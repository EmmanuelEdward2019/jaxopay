import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';

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

  const offset = (page - 1) * limit;

  // Build base query with UNION ALL
  const combinedQuery = `
    SELECT 
      wt.id, 
      wt.from_wallet_id as wallet_id, 
      wt.transaction_type::varchar, 
      wt.from_amount as amount, 
      wt.from_currency as currency,
      wt.status, 
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
      bp.amount, 
      bp.currency,
      bp.status, 
      ('Bill Payment: ' || bp.bill_category)::text as description, 
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
      wtx.amount, 
      wtx.currency,
      wtx.status, 
      wtx.description::text, 
      wtx.metadata, 
      wtx.created_at,
      (wtx.metadata->>'quidax_tx_id')::varchar as reference,
      w.user_id
    FROM wallet_transactions wtx
    JOIN wallets w ON w.id = wtx.wallet_id
    WHERE wtx.transaction_id IS NULL
  `;

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

  // Run data and count queries in parallel for better performance
  const [result, countResult] = await Promise.all([
    query(
      `WITH combined AS (${combinedQuery})
       SELECT * FROM combined
       ${conditions}
       ORDER BY created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
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
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
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

  res.status(200).json({
    success: true,
    data: {
      period_days: parseInt(period),
      volume_by_type: volumeByType.rows,
      daily_count: dailyCount.rows,
      status_breakdown: statusBreakdown.rows,
    },
  });
});

