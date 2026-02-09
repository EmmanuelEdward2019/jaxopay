import { query } from './src/config/database.js';

async function inspectProfiles() {
    try {
        const result = await query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable
      FROM 
        information_schema.columns
      WHERE 
        table_name = 'user_profiles';
    `);
        console.table(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

inspectProfiles();
