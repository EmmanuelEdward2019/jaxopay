import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    try {
        await pool.query('ALTER TABLE bill_payments DROP CONSTRAINT IF EXISTS bill_payments_provider_id_fkey;');
        await pool.query('ALTER TABLE bill_payments ALTER COLUMN provider_id TYPE VARCHAR(255);');
        console.log("DB Updated");
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        pool.end();
    }
}
run();
