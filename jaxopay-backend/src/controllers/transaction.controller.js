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

  // Build query conditions
  let conditions = 'WHERE w.user_id = $1';
  const params = [req.user.id];
  let paramCount = 1;

  if (type) {
    paramCount++;
    conditions += ` AND wt.transaction_type = $${paramCount}`;
    params.push(type);
  }

  if (status) {
    paramCount++;
    conditions += ` AND wt.status = $${paramCount}`;
    params.push(status);
  }

  if (currency) {
    paramCount++;
    conditions += ` AND wt.currency = $${paramCount}`;
    params.push(currency.toUpperCase());
  }

  if (start_date) {
    paramCount++;
    conditions += ` AND wt.created_at >= $${paramCount}`;
    params.push(start_date);
  }

  if (end_date) {
    paramCount++;
    conditions += ` AND wt.created_at <= $${paramCount}`;
    params.push(end_date);
  }

  // Run data and count queries in parallel for better performance
  const [result, countResult] = await Promise.all([
    query(
      `SELECT wt.id, wt.wallet_id, wt.transaction_type, wt.amount, wt.currency,
              wt.status, wt.description, wt.metadata, wt.created_at,
              w.wallet_type
       FROM wallet_transactions wt
       JOIN wallets w ON wt.wallet_id = w.id
       ${conditions}
       ORDER BY wt.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*) as total
       FROM wallet_transactions wt
       JOIN wallets w ON wt.wallet_id = w.id
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
    `SELECT wt.id, wt.wallet_id, wt.transaction_type, wt.amount, wt.currency,
            wt.status, wt.description, wt.metadata, wt.created_at, wt.updated_at,
            w.wallet_type, w.user_id
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE wt.id = $1 AND w.user_id = $2`,
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
    `SELECT wt.transaction_type, wt.currency, SUM(wt.amount) as total_amount, COUNT(*) as count
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE w.user_id = $1
       AND wt.created_at >= NOW() - INTERVAL '${parseInt(period)} days'
       AND wt.status = 'completed'
     GROUP BY wt.transaction_type, wt.currency
     ORDER BY total_amount DESC`,
    [req.user.id]
  );

  // Daily transaction count
  const dailyCount = await query(
    `SELECT DATE(wt.created_at) as date, COUNT(*) as count
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE w.user_id = $1
       AND wt.created_at >= NOW() - INTERVAL '${parseInt(period)} days'
     GROUP BY DATE(wt.created_at)
     ORDER BY date DESC`,
    [req.user.id]
  );

  // Status breakdown
  const statusBreakdown = await query(
    `SELECT wt.status, COUNT(*) as count
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE w.user_id = $1
       AND wt.created_at >= NOW() - INTERVAL '${parseInt(period)} days'
     GROUP BY wt.status`,
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

