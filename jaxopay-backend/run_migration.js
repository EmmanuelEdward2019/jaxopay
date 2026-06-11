import { query } from './src/config/database.js';

async function run() {
  try {
    await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;`);
    console.log('Migration successful');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();
