const { query } = require('./src/config/database.js');

async function testQueries() {
  try {
    // 1. Find a user with wallet_transactions
    const userRes = await query(`
      SELECT w.user_id 
      FROM wallet_transactions wt 
      JOIN wallets w ON wt.wallet_id = w.id 
      LIMIT 1
    `);
    
    if (userRes.rows.length === 0) {
      console.log('No wallet transactions found to test.');
      return;
    }
    const userId = userRes.rows[0].user_id;
    console.log('Testing for user:', userId);

    // 2. Test the dashboard query
    const dashQuery = `
      WITH combined AS (
        SELECT id, transaction_type::varchar, from_amount as amount, from_currency as currency,
               status, description::text, created_at, metadata, reference::varchar
        FROM transactions
        WHERE user_id = $1

        UNION ALL

        SELECT bp.id, 'bill_payment'::varchar as transaction_type, bp.amount, bp.currency,
               bp.status, ('Bill Payment: ' || bp.bill_category)::text as description, bp.created_at, bp.metadata, bp.reference::varchar
        FROM bill_payments bp
        WHERE bp.user_id = $1

        UNION ALL

        SELECT wtx.id, wtx.transaction_type::varchar, wtx.amount, wtx.currency,
               wtx.status, wtx.description::text, wtx.created_at, wtx.metadata, (wtx.metadata->>'quidax_tx_id')::varchar as reference
        FROM wallet_transactions wtx
        JOIN wallets w ON w.id = wtx.wallet_id
        WHERE w.user_id = $1 AND wtx.transaction_id IS NULL
      )
      SELECT * FROM combined
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const dashRes = await query(dashQuery, [userId]);
    console.log('Dashboard summary successful! Rows:', dashRes.rows.length);

    // 3. Test the transactions tab query
    const txQuery = `
      WITH combined AS (
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
      )
      SELECT * FROM combined
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10 OFFSET 0
    `;
    const txRes = await query(txQuery, [userId]);
    console.log('Transactions list successful! Rows:', txRes.rows.length);
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

testQueries().then(() => process.exit(0));
