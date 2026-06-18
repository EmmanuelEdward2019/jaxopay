import { query } from './src/config/database.js';

async function test() {
  try {
    const res = await query(`
    WITH combined AS (
    SELECT 
      wt.id, 
      wt.from_wallet_id as wallet_id, 
      wt.transaction_type, 
      wt.from_amount as amount, 
      wt.from_currency as currency,
      wt.status, 
      wt.description, 
      wt.metadata, 
      wt.created_at,
      wt.reference,
      wt.user_id
    FROM transactions wt

    UNION ALL

    SELECT 
      bp.id, 
      NULL as wallet_id, 
      'bill_payment' as transaction_type, 
      bp.amount, 
      bp.currency,
      bp.status, 
      'Bill Payment: ' || bp.service_type as description, 
      bp.metadata, 
      bp.created_at,
      bp.reference,
      bp.user_id
    FROM bill_payments bp

    UNION ALL

    SELECT 
      wtx.id, 
      wtx.wallet_id, 
      wtx.transaction_type, 
      wtx.amount, 
      wtx.currency,
      wtx.status, 
      wtx.description, 
      wtx.metadata, 
      wtx.created_at,
      wtx.metadata->>'quidax_tx_id' as reference,
      w.user_id
    FROM wallet_transactions wtx
    JOIN wallets w ON w.id = wtx.wallet_id
    WHERE wtx.transaction_id IS NULL
    ) SELECT * FROM combined LIMIT 1;
    `);
    console.log("Success:", res.rowCount);
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
test();
