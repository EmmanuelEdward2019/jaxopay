import { query } from './src/config/database.js';
import bcrypt from 'bcryptjs';

async function setupCardPool() {
    try {
        const email = 'cards-system@jaxopay.com';
        const existing = await query('SELECT id FROM users WHERE email = $1', [email]);

        let userId;
        if (existing.rows.length === 0) {
            const hash = await bcrypt.hash('CardSystemSafe@2026', 12);
            const res = await query(
                `INSERT INTO users (email, password_hash, role, is_active) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
                [email, hash, 'admin', true]
            );
            userId = res.rows[0].id;
            console.log('Created cards system user:', userId);
        } else {
            userId = existing.rows[0].id;
        }

        const wall = await query('SELECT id FROM wallets WHERE user_id = $1 AND currency = \'USD\'', [userId]);
        if (wall.rows.length === 0) {
            await query(
                `INSERT INTO wallets (user_id, currency, wallet_type, balance) VALUES ($1, \'USD\', \'fiat\', 0)`,
                [userId]
            );
            console.log('Created USD wallet for cards system');
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

setupCardPool();
