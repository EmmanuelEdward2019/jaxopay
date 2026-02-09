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
        // Get recent transactions (last 10) from the main transactions table
        query(
            `SELECT id, transaction_type, from_amount, from_currency, to_amount, to_currency,
              status, description, created_at
       FROM transactions
       WHERE user_id = $1
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

    // Calculate total balance (simplified - in production would use exchange rates)
    const totalBalance = walletsResult.rows.reduce((sum, wallet) => {
        return sum + parseFloat(wallet.balance || 0);
    }, 0);

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
