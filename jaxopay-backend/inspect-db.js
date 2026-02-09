import { query } from './src/config/database.js';

async function inspectSchema() {
    try {
        const result = await query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable
      FROM 
        information_schema.columns
      WHERE 
        table_name = 'user_sessions';
    `);
        console.log('Columns for user_sessions:');
        console.table(result.rows);

        const constraints = await query(`
      SELECT
          tc.constraint_name, tc.table_name, kcu.column_name, 
          tc.constraint_type
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'user_sessions';
    `);
        console.log('Constraints for user_sessions:');
        console.table(constraints.rows);

    } catch (err) {
        console.error('Error inspecting schema:', err);
    } finally {
        process.exit();
    }
}

inspectSchema();
