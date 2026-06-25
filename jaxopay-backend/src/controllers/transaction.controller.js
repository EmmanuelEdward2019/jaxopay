import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';

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

  res.status(200).json({
    success: true,
    data: {
      period_days: parseInt(period),
      total_count: agg.total_count || 0,
      completed_count: agg.completed_count || 0,
      pending_count: agg.pending_count || 0,
      total_volume: parseFloat(agg.total_volume) || 0,
      volume_by_type: volumeByType.rows,
      daily_count: dailyCount.rows,
      status_breakdown: statusBreakdown.rows,
    },
  });
});

