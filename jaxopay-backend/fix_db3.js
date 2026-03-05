import { query } from './src/config/database.js';

async function run() {
    try {
        // Check missing columns in INSERT
        // Add a default to service_type or alter column to drop not null if needed
        console.log("Checking schema...");
        const res = await query(`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bill_payments';
    `);
        console.log(res.rows);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}
run();
