import { query } from './src/config/database.js';
import bcrypt from 'bcryptjs';

async function verifyPassword() {
    const email = 'imeldaanthony27@gmail.com';
    const password = 'MyFintech@2026';

    try {
        const result = await query('SELECT password_hash FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            console.log('User not found');
            return;
        }

        const { password_hash } = result.rows[0];
        const isValid = await bcrypt.compare(password, password_hash);
        console.log(`Password for ${email} is valid: ${isValid}`);
        console.log(`Hash: ${password_hash}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

verifyPassword();
