import { query } from './src/config/database.js';

async function inspectEnum() {
    try {
        const result = await query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'wallet_type'::regtype;
    `);
        console.table(result.rows);
    } catch (err) {
        // If it fails, maybe it's not an enum or regtype doesn't work
        const alt = await query(`
        SELECT udt_name 
        FROM information_schema.columns 
        WHERE table_name = 'wallets' AND column_name = 'wallet_type'
    `);
        console.log('UDT Name:', alt.rows[0].udt_name);

        if (alt.rows[0].udt_name) {
            const result2 = await query(`
          SELECT enumlabel 
          FROM pg_enum 
          WHERE enumtypid = $1::regtype;
        `, [alt.rows[0].udt_name]);
            console.table(result2.rows);
        }
    } finally {
        process.exit();
    }
}

inspectEnum();
