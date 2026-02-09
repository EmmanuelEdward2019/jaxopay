import { query } from './src/config/database.js';
import bcrypt from 'bcryptjs';

async function resetPassword() {
    const email = 'imeldaanthony27@gmail.com';
    const newPassword = 'MyFintech@2026';

    try {
        const salt = await bcrypt.genSalt(12);
        const hash = await bcrypt.hash(newPassword, salt);

        const result = await query(
            'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
            [hash, email]
        );

        if (result.rows.length > 0) {
            console.log(`Password reset successfully for ${email}`);
        } else {
            console.log(`User ${email} not found`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

resetPassword();
