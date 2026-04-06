
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function optimizeDb() {
  try {
    console.log('--- Database Optimization ---');
    console.log('Connecting to database...');
    
    const migrationPath = path.join(__dirname, '../migrations/010_add_performance_indices.sql');
    console.log(`Reading migration file: ${migrationPath}`);
    
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    console.log('Applying performance indices...');
    // We execute the SQL - it contains "CREATE INDEX IF NOT EXISTS" and "DO $$" blocks for safety
    await pool.query(sql);
    
    console.log('--- Optimization Complete ---');
    console.log('Indices created successfully for high-traffic tables.');
    console.log('Query performance should now be significantly improved.');

    // Count indices created
    const result = await pool.query(`
        SELECT COUNT(*) FROM pg_indexes 
        WHERE indexname LIKE 'idx_%' 
        AND schemaname = 'public'
    `);
    console.log(`Total custom indices active: ${result.rows[0].count}`);

  } catch (err) {
    console.error('ERROR during DB optimization:', err);
  } finally {
    await pool.end();
  }
}

optimizeDb();
