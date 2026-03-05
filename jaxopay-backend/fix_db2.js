import { query } from './src/config/database.js';

async function run() {
    try {
        await query('ALTER TABLE bill_payments DROP CONSTRAINT IF EXISTS bill_payments_provider_id_fkey;');
        await query('ALTER TABLE bill_payments ALTER COLUMN provider_id TYPE VARCHAR(255);');
        console.log("DB Updated Successfully!");
    } catch (e) {
        console.error("Error updating DB:", e);
    } finally {
        process.exit(0);
    }
}
run();
