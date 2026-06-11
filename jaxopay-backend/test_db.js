import { query } from './src/config/database.js';

async function run() {
  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'wallet_transactions';
  `);
  console.log(result.rows.map(r => r.column_name));
  process.exit(0);
}
run();
