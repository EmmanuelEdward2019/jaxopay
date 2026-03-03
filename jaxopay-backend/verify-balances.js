import { query } from './src/config/database.js';

async function verifyBalances() {
    try {
        const result = await query(`
            SELECT id, user_id, balance, currency, wallet_type 
            FROM wallets;
        `);

        console.log("Total Wallets:", result.rows.length);

        const invalid = result.rows.filter(w => isNaN(parseFloat(w.balance)));
        if (invalid.length > 0) {
            console.log("Found Invalid Balances:");
            console.table(invalid);
        } else {
            console.log("All balances are valid numeric strings.");
            // Log a few to be sure
            console.table(result.rows.slice(0, 5));
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

verifyBalances();
