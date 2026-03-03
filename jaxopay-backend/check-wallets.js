import { query } from './src/config/database.js';

async function checkWallets() {
    try {
        const result = await query(`
            SELECT id, user_id, balance, currency, wallet_type 
            FROM wallets 
            WHERE wallet_type != 'system'
            LIMIT 10;
        `);
        console.table(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkWallets();
