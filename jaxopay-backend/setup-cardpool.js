import { query } from './src/config/database.js';

async function addCardPool() {
    try {
        const email = 'system@jaxopay.com';
        const systemRes = await query('SELECT id FROM users WHERE email = $1', [email]);
        if (systemRes.rows.length === 0) return;
        const systemId = systemRes.rows[0].id;

        const existing = await query('SELECT id FROM wallets WHERE user_id = $1 AND currency = \'USD\' AND wallet_type = \'escrow\'', [systemId]);
        if (existing.rows.length === 0) {
            await query(
                `INSERT INTO wallets (user_id, currency, wallet_type, balance) VALUES ($1, \'USD\', \'escrow\', 0)`,
                [systemId]
            );
            console.log('Created Card Pool Escrow wallet');
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

addCardPool();
