import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function isValidPinFormat(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export async function hashPin(pin) {
  return bcrypt.hash(pin, 10);
}

/**
 * Verify a user's transaction PIN. Throws a typed AppError on any failure so
 * callers (money-out controllers) can simply `await verifyTransactionPin(...)`.
 * On success resets the failed-attempt counter.
 */
export async function verifyTransactionPin(userId, pin) {
  if (!isValidPinFormat(pin)) {
    throw new AppError('A valid 4-digit transaction PIN is required', 400, 'PIN_REQUIRED');
  }

  const result = await query(
    `SELECT transaction_pin, transaction_pin_failed_attempts AS attempts, transaction_pin_locked_until AS locked_until
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = result.rows[0];

  if (!row || !row.transaction_pin) {
    throw new AppError('Set a transaction PIN in Settings before making this transaction', 400, 'PIN_NOT_SET');
  }

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    throw new AppError('Transaction PIN is temporarily locked due to failed attempts. Try again later.', 423, 'PIN_LOCKED');
  }

  const match = await bcrypt.compare(pin, row.transaction_pin);
  if (!match) {
    const attempts = (row.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query(
        `UPDATE users SET transaction_pin_failed_attempts = 0,
           transaction_pin_locked_until = NOW() + INTERVAL '${LOCK_MINUTES} minutes' WHERE id = $1`,
        [userId]
      );
      throw new AppError(`Too many incorrect attempts. Transaction PIN locked for ${LOCK_MINUTES} minutes.`, 423, 'PIN_LOCKED');
    }
    await query('UPDATE users SET transaction_pin_failed_attempts = $2 WHERE id = $1', [userId, attempts]);
    // 403 (not 401) so the frontend auth-refresh interceptor doesn't treat a wrong PIN as token expiry.
    throw new AppError(`Incorrect transaction PIN. ${MAX_ATTEMPTS - attempts} attempt(s) left.`, 403, 'PIN_INCORRECT');
  }

  // Success — clear any failed-attempt state.
  if (row.attempts || row.locked_until) {
    await query(
      'UPDATE users SET transaction_pin_failed_attempts = 0, transaction_pin_locked_until = NULL WHERE id = $1',
      [userId]
    );
  }
  return true;
}
