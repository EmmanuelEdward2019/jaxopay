import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function test() {
    const userId = '112e5c83-cb01-4475-b6d3-9bc37f10b037'; // A placeholder UUID, we'll just check if query is valid
    try {
        await pool.query(
            `WITH combined AS (
               SELECT id, transaction_type, from_amount as amount, from_currency as currency,
                      status, description, created_at, metadata, reference
               FROM transactions
               WHERE user_id = $1

               UNION ALL

               SELECT bp.id, 'bill_payment' as transaction_type, bp.amount, bp.currency,
                      bp.status, 'Bill Payment: ' || bp.service_type as description, bp.created_at, bp.metadata, bp.reference
               FROM bill_payments bp
               WHERE bp.user_id = $1

               UNION ALL

               SELECT wtx.id, wtx.transaction_type, wtx.amount, wtx.currency,
                      wtx.status, wtx.description, wtx.created_at, wtx.metadata, wtx.metadata->>'quidax_tx_id' as reference
               FROM wallet_transactions wtx
               JOIN wallets w ON w.id = wtx.wallet_id
               WHERE w.user_id = $1 AND wtx.transaction_id IS NULL
             )
             SELECT * FROM combined
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
        );
        console.log("Query OK");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
test();
