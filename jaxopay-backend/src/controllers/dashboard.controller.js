import { query } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';

// Get dashboard summary - combines wallets, recent transactions, and stats in one call
export const getDashboardSummary = catchAsync(async (req, res) => {
    const userId = req.user.id;
    console.log(`Fetching dashboard summary for user: ${userId}`);

    // Run all queries in parallel for maximum performance
    const [walletsResult, transactionsResult, cardsResult] = await Promise.all([
        // Get all wallets
        query(
            `SELECT id, currency, wallet_type, balance, available_balance, locked_balance, is_active, created_at
       FROM wallets
       WHERE user_id = $1
       ORDER BY created_at ASC`,
            [userId]
        ),
        query(
            `WITH combined AS (
               SELECT id, transaction_type, from_amount as amount, from_currency as currency,
                      status, description, created_at
               FROM transactions
               WHERE user_id = $1

               UNION ALL

               SELECT bp.id, 'bill_payment' as transaction_type, bp.amount, bp.currency,
                      bp.status, 'Bill Payment: ' || bp.service_type as description, bp.created_at
               FROM bill_payments bp
               WHERE bp.user_id = $1

               UNION ALL

               SELECT wtx.id, wtx.transaction_type, wtx.amount, wtx.currency,
                      wtx.status, wtx.description, wtx.created_at
               FROM wallet_transactions wtx
               JOIN wallets w ON w.id = wtx.wallet_id
               WHERE w.user_id = $1 AND wtx.transaction_id IS NULL
             )
             SELECT * FROM combined
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
        ),
        // Get active virtual cards count
        query(
            `SELECT COUNT(*) as count
       FROM virtual_cards
       WHERE user_id = $1 AND status != 'terminated'`,
            [userId]
        ),
    ]);

    // Calculate total balance separated by currency
    const totalBalance = walletsResult.rows.reduce((acc, wallet) => {
        const bal = parseFloat(wallet.balance) || 0;
        acc[wallet.currency] = (acc[wallet.currency] || 0) + bal;
        return acc;
    }, {});

    res.status(200).json({
        success: true,
        data: {
            wallets: walletsResult.rows,
            transactions: transactionsResult.rows,
            stats: {
                total_balance: totalBalance,
                wallet_count: walletsResult.rows.length,
                transaction_count: transactionsResult.rows.length,
                active_cards: parseInt(cardsResult.rows[0].count),
            },
        },
    });
});
