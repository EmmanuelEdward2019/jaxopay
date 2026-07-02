import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import logger from '../utils/logger.js';

// Currency the "Total Volume" figure is displayed in.
const DISPLAY_CURRENCY = 'NGN';

/**
 * Convert a per-currency volume map into a single total in DISPLAY_CURRENCY (NGN)
 * using live Quidax rates. Resilient: any currency we can't price is left out of the
 * total and flagged as partial, but still shown in the per-currency breakdown.
 */
async function convertVolumeToDisplay(rows) {
  let total = 0;
  let partial = false;
  const breakdown = await Promise.all(
    rows.map(async (r) => {
      const currency = String(r.currency || '').toUpperCase();
      const amount = parseFloat(r.total) || 0;
      let baseValue = null;
      if (currency === DISPLAY_CURRENCY) {
        baseValue = amount;
      } else if (amount > 0) {
        try {
          const rate = await quidax.getExchangeRate(currency, DISPLAY_CURRENCY);
          if (rate && rate > 0) baseValue = amount * rate;
        } catch (e) {
          logger.warn(`[Stats] rate ${currency}->${DISPLAY_CURRENCY} failed: ${e.message}`);
        }
      } else {
        baseValue = 0;
      }
      if (baseValue != null) total += baseValue;
      else partial = true;
      return { currency, total: amount, base_value: baseValue };
    })
  );
  breakdown.sort((a, b) => (b.base_value || 0) - (a.base_value || 0));
  return { total, partial, breakdown };
}

const combinedQuery = `
  SELECT 
    wt.id, 
    wt.from_wallet_id as wallet_id, 
    wt.transaction_type::varchar, 
    wt.from_amount::numeric as amount,
    wt.from_currency::varchar as currency,
    wt.status::varchar,
    wt.description::text,
    wt.metadata, 
    wt.created_at,
    wt.reference::varchar,
    wt.user_id
  FROM transactions wt

  UNION ALL

  SELECT 
    bp.id, 
    NULL::uuid as wallet_id, 
    'bill_payment'::varchar as transaction_type, 
    bp.amount::numeric,
    bp.currency::varchar,
    bp.status::varchar,
    ('Bill Payment: ' || bp.service_type)::text as description,
    bp.metadata, 
    bp.created_at,
    bp.reference::varchar,
    bp.user_id
  FROM bill_payments bp

  UNION ALL

  SELECT 
    wtx.id, 
    wtx.wallet_id, 
    wtx.transaction_type::varchar, 
    wtx.amount::numeric,
    wtx.currency::varchar,
    wtx.status::varchar,
    wtx.description::text,
    wtx.metadata, 
    wtx.created_at,
    (wtx.metadata->>'quidax_tx_id')::varchar as reference,
    w.user_id
  FROM wallet_transactions wtx
  JOIN wallets w ON w.id = wtx.wallet_id
  WHERE NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE (wtx.metadata->>'quidax_tx_id') IS NOT NULL
      AND (t.metadata->>'quidax_tx_id') = (wtx.metadata->>'quidax_tx_id')
  )

  UNION ALL

  SELECT
    fx.id,
    NULL::uuid as wallet_id,
    (CASE fx.type WHEN 'swap' THEN 'exchange' WHEN 'international_payment' THEN 'transfer' ELSE fx.type END)::varchar as transaction_type,
    fx.amount::numeric,
    fx.from_currency::varchar as currency,
    (CASE UPPER(fx.status) WHEN 'SUCCESS' THEN 'completed' WHEN 'PROCESSING' THEN 'pending' WHEN 'FAILED' THEN 'failed' ELSE LOWER(fx.status) END)::varchar as status,
    (CASE fx.type
       WHEN 'swap' THEN 'Currency Swap: ' || fx.from_currency || ' → ' || fx.to_currency
       ELSE 'International Transfer to ' || COALESCE(fx.recipient_details->>'name', fx.to_currency)
     END)::text as description,
    fx.recipient_details as metadata,
    fx.created_at,
    fx.provider_txn_id::varchar as reference,
    fx.user_id
  FROM fx_transactions fx
`;

// Get all user transactions
export const getTransactions = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    type,
    status,
    currency,
    start_date,
    end_date,
  } = req.query;

  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const offset = (parsedPage - 1) * parsedLimit;

  // Build filtering conditions
  let conditions = 'WHERE user_id = $1';
  const params = [req.user.id];
  let paramCount = 1;

  if (type) {
    paramCount++;
    conditions += ` AND transaction_type = $${paramCount}`;
    params.push(type);
  }

  if (status) {
    paramCount++;
    conditions += ` AND status = $${paramCount}`;
    params.push(status);
  }

  if (currency) {
    paramCount++;
    conditions += ` AND currency = $${paramCount}`;
    params.push(currency.toUpperCase());
  }

  if (start_date) {
    paramCount++;
    conditions += ` AND created_at >= $${paramCount}`;
    params.push(start_date);
  }

  if (end_date) {
    paramCount++;
    conditions += ` AND created_at <= $${paramCount}`;
    params.push(end_date);
  }

  const [result, countResult] = await Promise.all([
    query(
      `WITH combined AS (${combinedQuery})
       SELECT * FROM combined
       ${conditions}
       ORDER BY created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, parsedLimit, offset]
    ),
    query(
      `WITH combined AS (${combinedQuery})
       SELECT COUNT(*) as total FROM combined
       ${conditions}`,
      params
    )
  ]);

  res.status(200).json({
    success: true,
    data: {
      transactions: result.rows,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / parsedLimit),
      },
    },
  });
});

// Get single transaction
export const getTransaction = catchAsync(async (req, res) => {
  const { transactionId } = req.params;

  const result = await query(
    `WITH combined AS (${combinedQuery})
     SELECT * FROM combined
     WHERE id = $1 AND user_id = $2`,
    [transactionId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Transaction not found', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Get transaction statistics
export const getTransactionStats = catchAsync(async (req, res) => {
  const { period = '30' } = req.query; // days

  // Total volume by type
  const volumeByType = await query(
    `WITH combined AS (${combinedQuery})
     SELECT transaction_type, currency, SUM(amount) as total_amount, COUNT(*) as count
     FROM combined
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'
       AND status = 'completed'
     GROUP BY transaction_type, currency
     ORDER BY total_amount DESC`,
    [req.user.id]
  );

  // Daily transaction count
  const dailyCount = await query(
    `WITH combined AS (${combinedQuery})
     SELECT DATE(created_at) as date, COUNT(*) as count
     FROM combined
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'
     GROUP BY DATE(created_at)
     ORDER BY date DESC`,
    [req.user.id]
  );

  // Status breakdown
  const statusBreakdown = await query(
    `WITH combined AS (${combinedQuery})
     SELECT status, COUNT(*) as count
     FROM combined
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'
     GROUP BY status`,
    [req.user.id]
  );

  // Flat aggregates for the summary cards (the frontend reads these directly)
  const summary = await query(
    `WITH combined AS (${combinedQuery})
     SELECT
       COUNT(*)::int AS total_count,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
       COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS pending_count,
       COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS total_volume
     FROM combined
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'`,
    [req.user.id]
  );
  const agg = summary.rows[0] || {};

  // Completed volume grouped by its OWN currency (can't sum currencies directly).
  const byCurrency = await query(
    `WITH combined AS (${combinedQuery})
     SELECT currency, SUM(amount)::numeric AS total
     FROM combined
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${parseInt(period)} days'
       AND status = 'completed'
       AND amount > 0
     GROUP BY currency`,
    [req.user.id]
  );

  // Convert each currency to a single NGN figure via live Quidax rates (best-effort).
  const { total, partial, breakdown } = await convertVolumeToDisplay(byCurrency.rows);

  // Also provide a USD equivalent of the NGN total so the UI can offer a NGN/USD switch.
  let totalUsd = null;
  try {
    const ngnToUsd = await quidax.getExchangeRate('NGN', 'USDT'); // USDT ≈ USD
    if (ngnToUsd && ngnToUsd > 0) totalUsd = total * ngnToUsd;
  } catch { /* leave USD null if unavailable */ }

  res.status(200).json({
    success: true,
    data: {
      period_days: parseInt(period),
      total_count: agg.total_count || 0,
      completed_count: agg.completed_count || 0,
      pending_count: agg.pending_count || 0,
      // total_volume is the NGN-converted total (default display); both are provided for the toggle.
      total_volume: total,
      total_volume_ngn: total,
      total_volume_usd: totalUsd,
      base_currency: DISPLAY_CURRENCY,
      volume_partial: partial,
      volume_by_currency: breakdown,
      volume_by_type: volumeByType.rows,
      daily_count: dailyCount.rows,
      status_breakdown: statusBreakdown.rows,
    },
  });
});

