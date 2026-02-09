import { query } from './src/config/database.js';

async function inspectCurrencyEnum() {
    try {
        const result = await query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'currency_code'::regtype;
    `);
        console.table(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

inspectCurrencyEnum();
