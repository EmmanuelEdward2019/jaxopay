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
               SELECT id::uuid, transaction_type::varchar, from_amount::numeric as amount, from_currency::varchar as currency,
                      status::varchar, description::text, created_at::timestamp, metadata::jsonb, reference::varchar
               FROM transactions
               WHERE user_id = $1

               UNION ALL

               SELECT bp.id::uuid, 'bill_payment'::varchar as transaction_type, bp.amount::numeric, bp.currency::varchar,
                      bp.status::varchar, ('Bill Payment: ' || bp.service_type)::text as description, bp.created_at::timestamp, bp.metadata::jsonb, bp.reference::varchar
               FROM bill_payments bp
               WHERE bp.user_id = $1

               UNION ALL

               SELECT wtx.id::uuid, wtx.transaction_type::varchar, wtx.amount::numeric, wtx.currency::varchar,
                      wtx.status::varchar, wtx.description::text, wtx.created_at::timestamp, wtx.metadata::jsonb, (wtx.metadata->>'quidax_tx_id')::varchar as reference
               FROM wallet_transactions wtx
               JOIN wallets w ON w.id = wtx.wallet_id
               WHERE w.user_id = $1 AND NOT EXISTS (
                 SELECT 1 FROM transactions t
                 WHERE (wtx.metadata->>'quidax_tx_id') IS NOT NULL
                   AND (t.metadata->>'quidax_tx_id') = (wtx.metadata->>'quidax_tx_id')
               )
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
