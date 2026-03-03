import { query } from './src/config/database.js';

async function checkRLS() {
    try {
        const result = await query(`
            SELECT 
                tablename, 
                rowsecurity 
            FROM 
                pg_tables 
            WHERE 
                schemaname = 'public'
            ORDER BY tablename;
        `);
        console.table(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkRLS();
