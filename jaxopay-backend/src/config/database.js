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
      ? 15
      : 20;

const statementTimeoutMs = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '25000', 10);

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'jaxopay',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max,
  idleTimeoutMillis: isRemoteHost ? 20000 : 30000,
  connectionTimeoutMillis: isRemoteHost ? 60000 : 30000,
};

if (Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0) {
  dbConfig.options = `-c statement_timeout=${statementTimeoutMs}`;
}

export const pool = new Pool(dbConfig);

pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client:', err.message);
});

export const connectDatabase = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    logger.info(`Database connected at: ${result.rows[0].now}`);
    client.release();
    return true;
  } catch (error) {
    logger.error('Database connection error:', error);
    throw error;
  }
};

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 5000) {
      logger.warn('Slow query', { text: text.slice(0, 120), duration, rows: result.rowCount });
    } else {
      logger.debug('Executed query', { text: text.slice(0, 120), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query error:', { text: text.slice(0, 120), duration, error: error.message });
    throw error;
  }
};

export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
