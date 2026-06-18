import { query } from './src/config/database.js';

async function test() {
  try {
    const res = await query(`
    WITH combined AS (
      SELECT id, transaction_type, from_amount as amount, from_currency as currency,
             status, description, created_at, metadata, reference
      FROM transactions
      WHERE user_id = '00000000-0000-0000-0000-000000000000'

      UNION ALL

      SELECT bp.id, 'bill_payment' as transaction_type, bp.amount, bp.currency,
             bp.status, 'Bill Payment: ' || bp.bill_category as description, bp.created_at, bp.metadata, bp.reference
      FROM bill_payments bp
      WHERE bp.user_id = '00000000-0000-0000-0000-000000000000'

      UNION ALL

      SELECT wtx.id, wtx.transaction_type, wtx.amount, wtx.currency,
             wtx.status, wtx.description, wtx.created_at, wtx.metadata, wtx.metadata->>'quidax_tx_id' as reference
      FROM wallet_transactions wtx
      JOIN wallets w ON w.id = wtx.wallet_id
      WHERE w.user_id = '00000000-0000-0000-0000-000000000000' AND wtx.transaction_id IS NULL
    )
    SELECT * FROM combined
    ORDER BY created_at DESC
    LIMIT 10
    `);
    console.log("Success:", res.rowCount);
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
test();
