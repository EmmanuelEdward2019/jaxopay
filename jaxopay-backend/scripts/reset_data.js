
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function resetData() {
  try {
    console.log('Fetching table list...');
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const allTables = tablesRes.rows.map(r => r.table_name);
    console.log('All Public Tables:', allTables);

    // Filter tables that should be cleared (transactions, history, etc.)
    // common tables: transactions, exchange_history, trade_history, crypto_withdrawals, crypto_deposits, wallet_history
    const tablesToClear = allTables.filter(t => 
      t.includes('transaction') || 
      t.includes('history') || 
      t.includes('withdrawal') || 
      t.includes('deposit') || 
      t.includes('trade') ||
      t.includes('exchange') ||
      t.includes('activity') ||
      t.includes('notification')
    );

    console.log('Tables to clear:', tablesToClear);

    // TRUNCATE all clearable tables
    for (const table of tablesToClear) {
      console.log(`Clearing ${table}...`);
      await pool.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
    }

    // Reset all wallet balances to 0
    if (allTables.includes('wallets')) {
      console.log('Resetting wallet balances to zero...');
      // Try to update common balance columns, identifying which ones exist could be better but let's try a safe set first
      await pool.query('UPDATE wallets SET balance = 0');
    }

    if (allTables.includes('accounts')) {
      console.log('Resetting account balances to zero...');
      await pool.query('UPDATE accounts SET balance = 0, available_balance = 0');
    }

    console.log('SUCCESS: All transaction history cleared and balances reset to zero.');
  } catch (err) {
    console.error('ERROR during data reset:', err);
  } finally {
    await pool.end();
  }
}

resetData();
