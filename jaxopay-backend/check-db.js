import { query } from './src/config/database.js';

async function checkStats() {
    try {
        const users = await query('SELECT COUNT(*) FROM users');
        console.log('Total Users:', users.rows[0].count);

        const wallets = await query('SELECT COUNT(*) FROM wallets');
        console.log('Total Wallets:', wallets.rows[0].count);

        const cards = await query('SELECT COUNT(*) FROM virtual_cards');
        console.log('Total Cards:', cards.rows[0].count);

        const roles = await query('SELECT role, COUNT(*) FROM users GROUP BY role');
        console.log('Roles:', roles.rows);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

checkStats();
