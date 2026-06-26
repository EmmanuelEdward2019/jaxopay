import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';
import { hashPin, isValidPinFormat } from '../services/transactionPin.service.js';

// GET /security/transaction-pin  — whether a PIN is set + lock state
export const getPinStatus = catchAsync(async (req, res) => {
  const r = await query(
    `SELECT (transaction_pin IS NOT NULL) AS is_set, transaction_pin_set_at AS set_at,
            transaction_pin_locked_until AS locked_until
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  const row = r.rows[0] || {};
  const locked = !!(row.locked_until && new Date(row.locked_until) > new Date());
  res.status(200).json({
    success: true,
    data: { is_set: !!row.is_set, set_at: row.set_at || null, locked, locked_until: locked ? row.locked_until : null },
  });
});

// POST /security/transaction-pin  — set PIN for the first time (requires account password)
export const setTransactionPin = catchAsync(async (req, res) => {
  const { pin, password } = req.body;
  if (!isValidPinFormat(pin)) throw new AppError('PIN must be exactly 4 digits', 400, 'PIN_INVALID');

  const r = await query('SELECT password_hash, transaction_pin FROM users WHERE id = $1', [req.user.id]);
  const user = r.rows[0];
  if (!user) throw new AppError('User not found', 404);
  if (user.transaction_pin) throw new AppError('A transaction PIN is already set. Use change PIN instead.', 400, 'PIN_EXISTS');
  if (!password || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError('Your account password is required to set a transaction PIN', 403, 'PASSWORD_INVALID');
  }

  const hashed = await hashPin(pin);
  await query(
    `UPDATE users SET transaction_pin = $2, transaction_pin_set_at = NOW(),
       transaction_pin_failed_attempts = 0, transaction_pin_locked_until = NULL WHERE id = $1`,
    [req.user.id, hashed]
  );
  res.status(201).json({ success: true, message: 'Transaction PIN set successfully' });
});

// PATCH /security/transaction-pin  — change PIN (authorize with current PIN OR account password)
export const changeTransactionPin = catchAsync(async (req, res) => {
  const { current_pin, new_pin, password } = req.body;
  if (!isValidPinFormat(new_pin)) throw new AppError('New PIN must be exactly 4 digits', 400, 'PIN_INVALID');

  const r = await query('SELECT password_hash, transaction_pin FROM users WHERE id = $1', [req.user.id]);
  const user = r.rows[0];
  if (!user) throw new AppError('User not found', 404);
  if (!user.transaction_pin) throw new AppError('No transaction PIN set yet. Set one first.', 400, 'PIN_NOT_SET');

  let authorized = false;
  if (current_pin && isValidPinFormat(current_pin)) {
    authorized = await bcrypt.compare(current_pin, user.transaction_pin);
    if (!authorized) throw new AppError('Current PIN is incorrect', 403, 'PIN_INCORRECT');
  } else if (password) {
    authorized = await bcrypt.compare(password, user.password_hash);
    if (!authorized) throw new AppError('Account password is incorrect', 403, 'PASSWORD_INVALID');
  }
  if (!authorized) throw new AppError('Provide your current PIN or account password to change your PIN', 400);

  const hashed = await hashPin(new_pin);
  await query(
    `UPDATE users SET transaction_pin = $2, transaction_pin_set_at = NOW(),
       transaction_pin_failed_attempts = 0, transaction_pin_locked_until = NULL WHERE id = $1`,
    [req.user.id, hashed]
  );
  res.status(200).json({ success: true, message: 'Transaction PIN changed successfully' });
});
