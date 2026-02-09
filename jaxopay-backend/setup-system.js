import { query, transaction } from './src/config/database.js';
import bcrypt from 'bcryptjs';

async function setupSystem() {
    try {
        const email = 'system@jaxopay.com';
        const existing = await query('SELECT id FROM users WHERE email = $1', [email]);

        let systemId;
        if (existing.rows.length === 0) {
            const hash = await bcrypt.hash('SystemSafePassword@2026', 12);
            const res = await query(
                `INSERT INTO users (email, password_hash, role, is_active) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
                [email, hash, 'admin', true]
            );
            systemId = res.rows[0].id;
            console.log('Created system user:', systemId);
        } else {
            systemId = existing.rows[0].id;
            console.log('System user already exists:', systemId);
        }

        const currencies = ['USD', 'NGN', 'EUR', 'GBP'];
        for (const cur of currencies) {
            const wall = await query('SELECT id FROM wallets WHERE user_id = $1 AND currency = $2 AND wallet_type = $3', [systemId, cur, 'system']);
            if (wall.rows.length === 0) {
                await query(
                    `INSERT INTO wallets (user_id, currency, wallet_type, balance) VALUES ($1, $2, $3, $4)`,
                    [systemId, cur, 'system', 1000000000] // Initial "infinite" balance for system
                );
                console.log(`Created ${cur} system wallet`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

setupSystem();
