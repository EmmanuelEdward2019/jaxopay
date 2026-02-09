import { query } from '../config/database.js';

async function migrate() {
    try {
        console.log('Starting migration to add bulk_sms feature...');

        // Add bulk_sms to feature_toggle enum
        await query(`ALTER TYPE feature_toggle ADD VALUE IF NOT EXISTS 'bulk_sms'`);
        console.log('✅ Added "bulk_sms" to feature_toggle enum');

        // Insert bulk_sms into feature_toggles table
        const checkResult = await query(`SELECT * FROM feature_toggles WHERE feature_name = 'bulk_sms'`);
        if (checkResult.rows.length === 0) {
            await query(`
                INSERT INTO feature_toggles (feature_name, is_enabled, config)
                VALUES ('bulk_sms', false, '{"provider": "twilio", "rate_per_sms": 0.05}')
            `);
            console.log('✅ Inserted "bulk_sms" into feature_toggles table');
        } else {
            console.log('ℹ️ "bulk_sms" already exists in feature_toggles table');
        }

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
