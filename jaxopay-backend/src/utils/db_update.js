import { query } from '../config/database.js';

const run = async () => {
    try {
        console.log('Adding columns...');
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_secret TEXT;`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';`);
        console.log('Columns added successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error adding columns:', error);
        process.exit(1);
    }
};

run();
