#!/usr/bin/env node

/**
 * Database Migration Runner
 *
 * Usage:
 *   node src/database/migrate.js              # Run all pending migrations
 *   node src/database/migrate.js --rollback  # Rollback last migration
 *   node src/database/migrate.js --status    # Show migration status
 *   node src/database/migrate.js --create NAME # Create new migration file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../config/database.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Ensure migrations table exists
async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// Get list of applied migrations
async function getAppliedMigrations() {
  const result = await query('SELECT version FROM schema_migrations ORDER BY version');
  return result.rows.map(row => row.version);
}

// Get list of migration files
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  return files;
}

// Run a single migration
async function runMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Execute migration
    await client.query(sql);

    // Record migration
    const version = filename.replace('.sql', '');
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
      [version]
    );

    await client.query('COMMIT');
    logger.info(`✅ Migration applied: ${filename}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`❌ Migration failed: ${filename}`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Rollback last migration (simplified - just removes record)
async function rollbackLastMigration() {
  const result = await query(
    'SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
  );

  if (result.rows.length === 0) {
    logger.info('No migrations to rollback');
    return;
  }

  const version = result.rows[0].version;
  logger.warn(`⚠️ Rolling back migration: ${version}`);
  logger.warn('Note: Rollback only removes the migration record. Manual rollback SQL may be needed.');

  await query('DELETE FROM schema_migrations WHERE version = $1', [version]);
  logger.info(`✅ Migration ${version} rolled back (record removed)`);
}

// Show migration status
async function showStatus() {
  const applied = await getAppliedMigrations();
  const files = getMigrationFiles();

  console.log('\n📊 Migration Status:\n');
  console.log('Version                  | Status    | Applied At');
  console.log('-'.repeat(70));

  for (const file of files) {
    const version = file.replace('.sql', '');
    const isApplied = applied.includes(version);

    const result = await query(
      'SELECT applied_at FROM schema_migrations WHERE version = $1',
      [version]
    );
    const appliedAt = result.rows[0]?.applied_at
      ? new Date(result.rows[0].applied_at).toLocaleString()
      : '-';

    const status = isApplied ? '✅ Applied' : '⏳ Pending';
    console.log(`${version.padEnd(24)} | ${status.padEnd(9)} | ${appliedAt}`);
  }

  console.log('');
}

// Create new migration file
function createMigration(name) {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${timestamp}_${name}.sql`;
  const filepath = path.join(MIGRATIONS_DIR, filename);

  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Write your migration SQL here

-- Insert migration record
INSERT INTO schema_migrations (version) VALUES ('${timestamp}_${name}')
ON CONFLICT (version) DO NOTHING;
`;

  fs.writeFileSync(filepath, template);
  logger.info(`✅ Created migration: ${filepath}`);
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    await ensureMigrationsTable();

    if (command === '--rollback') {
      await rollbackLastMigration();
    } else if (command === '--status') {
      await showStatus();
    } else if (command === '--create') {
      const name = args[1];
      if (!name) {
        console.error('Usage: node migrate.js --create migration_name');
        process.exit(1);
      }
      createMigration(name);
    } else {
      // Run pending migrations
      const applied = await getAppliedMigrations();
      const files = getMigrationFiles();
      const pending = files.filter(f => !applied.includes(f.replace('.sql', '')));

      if (pending.length === 0) {
        logger.info('✅ No pending migrations');
        return;
      }

      logger.info(`📦 Found ${pending.length} pending migration(s)`);

      for (const file of pending) {
        await runMigration(file);
      }

      logger.info('✅ All migrations completed successfully');
    }

    // Close pool connection
    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
