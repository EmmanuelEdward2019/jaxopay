import pg from 'pg';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

const isRemoteHost =
  (process.env.DB_HOST || '').includes('supabase') ||
  (process.env.DB_HOST || '').includes('pooler');

const poolMax = parseInt(process.env.DB_POOL_MAX || '', 10);
const max =
  Number.isFinite(poolMax) && poolMax > 0
    ? poolMax
    : isRemoteHost
      ? 5      // Keep pool small for remote Supabase to avoid connection exhaustion
      : 20;

const statementTimeoutMs = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '15000', 10);

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'jaxopay',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max,
  idleTimeoutMillis: isRemoteHost ? 10000 : 30000,
  connectionTimeoutMillis: isRemoteHost ? 8000 : 5000,
  // Keep connections alive with TCP keepalive to prevent silent drops
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
};

if (Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0) {
  dbConfig.options = `-c statement_timeout=${statementTimeoutMs}`;
}

/** Track consecutive connection failures for pool recovery */
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

/** Create a fresh pool instance */
function createPool() {
  const p = new Pool(dbConfig);

  p.on('connect', () => {
    consecutiveFailures = 0; // Reset on any successful connection
    logger.debug('New database client connected');
  });

  p.on('error', (err) => {
    logger.error('Unexpected error on idle database client:', err.message);
    // Don't exit – the pool will recover on next checkout
  });

  p.on('remove', () => {
    logger.debug('Database client removed from pool');
  });

  return p;
}

export let pool = createPool();

/**
 * Drain and recreate the pool when too many consecutive failures occur.
 * This recovers from "poisoned pool" states where all cached connections
 * are dead but the pool keeps handing them out.
 */
async function resetPoolIfNeeded() {
  if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) return;

  logger.warn(`[DB] ${consecutiveFailures} consecutive failures – resetting connection pool`);
  const oldPool = pool;
  pool = createPool();
  consecutiveFailures = 0;

  // End old pool in background (releases stuck clients)
  oldPool.end().catch((e) => logger.error('[DB] Error ending old pool:', e.message));
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export const connectDatabase = async () => {
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      logger.info(`Database connected at: ${result.rows[0].now}`);
      client.release();
      return true;
    } catch (error) {
      attempts++;
      logger.warn(`Database connection attempt ${attempts} failed:`, error.message);

      if (attempts >= MAX_RETRIES) {
        logger.error('Failed to connect to database after maximum retries');
        throw error;
      }

      // Wait before retrying with exponential backoff
      const delay = RETRY_DELAY_MS * Math.pow(2, attempts - 1);
      logger.info(`Retrying database connection in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Execute a query with automatic timeout, retries, and pool recovery.
 *
 * On retry we acquire a *dedicated client* so we are guaranteed to get
 * a fresh TCP connection rather than a potentially stale one from the
 * pool's internal queue.
 */
export const query = async (text, params, options = {}) => {
  const start = Date.now();
  const { timeout = 12000, retries = 2 } = options;

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    let client;
    try {
      // On first attempt use pool.query (fast path).
      // On retries, grab a dedicated client to force a new connection.
      if (attempt === 0) {
        const result = await Promise.race([
          pool.query({ text, values: params }),
          rejectAfter(timeout),
        ]);
        logQueryDuration(text, start, result.rowCount);
        return result;
      }

      // Retry path – dedicated client
      client = await Promise.race([pool.connect(), rejectAfter(timeout)]);
      const result = await Promise.race([
        client.query({ text, values: params }),
        rejectAfter(timeout),
      ]);
      logQueryDuration(text, start, result.rowCount);
      return result;
    } catch (error) {
      lastError = error;
      consecutiveFailures++;

      const isRetryable = error.code === 'ECONNRESET'
        || error.code === 'ETIMEDOUT'
        || error.code === '08006'
        || /connection terminated|timed out|query timed out/i.test(error.message);

      if (isRetryable) {
        logger.warn(`Query failed (attempt ${attempt + 1}/${retries}): ${error.message}`);

        // Check if we should nuke the pool
        await resetPoolIfNeeded();

        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
      }

      const duration = Date.now() - start;
      logger.error('Query error:', { text: text.slice(0, 120), duration, error: error.message, code: error.code });
      throw error;
    } finally {
      if (client) {
        try { client.release(true); } catch (_) { /* ignore */ }
      }
    }
  }

  throw lastError;
};

export const transaction = async (callback) => {
  const client = await Promise.race([
    pool.connect(),
    rejectAfter(10000),
  ]);
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw error;
  } finally {
    try { client.release(true); } catch (_) { /* ignore */ }
  }
};

// Health check function
export const checkDatabaseHealth = async () => {
  try {
    const result = await query('SELECT NOW() as now, version() as version', [], { timeout: 5000, retries: 1 });
    return {
      healthy: true,
      timestamp: result.rows[0].now,
      version: result.rows[0].version,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  }
};

// Graceful shutdown helper
export const closeDatabaseConnections = async () => {
  logger.info('Closing database connections...');
  await pool.end();
  logger.info('Database connections closed');
};

// ─── Helpers ───────────────────────────────────────────────────────

function rejectAfter(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Query timed out after ${ms}ms`)), ms)
  );
}

function logQueryDuration(text, start, rowCount) {
  const duration = Date.now() - start;
  if (duration > 5000) {
    logger.warn('Slow query', { text: text.slice(0, 120), duration, rows: rowCount });
  } else {
    logger.debug('Executed query', { text: text.slice(0, 120), duration, rows: rowCount });
  }
}

// ─── Periodic pool health ping (every 30s) ─────────────────────────
// Sends a lightweight SELECT 1 to detect stale connections early
// and trigger pool recovery before user requests fail.
setInterval(async () => {
  try {
    await Promise.race([pool.query('SELECT 1'), rejectAfter(5000)]);
    // If this succeeds, the pool is healthy
  } catch (e) {
    consecutiveFailures++;
    logger.warn(`[DB] Health ping failed: ${e.message} (failures: ${consecutiveFailures})`);
    await resetPoolIfNeeded();
  }
}, 30000);

export default pool;
