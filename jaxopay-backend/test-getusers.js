import { query } from './src/config/database.js';

async function testGetUsers() {
    try {
        const result = await query(
            `SELECT u.id, u.email, u.phone, u.role, u.kyc_tier, u.is_active,
                    u.is_email_verified, u.two_fa_enabled, u.created_at,
                    up.first_name, up.last_name, up.country, up.avatar_url
             FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             ORDER BY u.created_at DESC
             LIMIT $1 OFFSET $2`,
            [20, 0]
        );
        console.log('Users found:', result.rows.length);
        console.log('Sample User:', result.rows[0]);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

testGetUsers();
