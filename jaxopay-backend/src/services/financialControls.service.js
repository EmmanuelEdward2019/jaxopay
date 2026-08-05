import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

const DEFAULT_CONTROLS = {
  deposits_enabled: true,
  withdrawals_enabled: true,
  custom_deposit_limit_ngn: null,
  custom_withdrawal_limit_usd: null,
};

/** A user with no row yet has no admin override — full default access. */
export async function getUserFinancialControls(userId) {
  const r = await query('SELECT * FROM user_financial_controls WHERE user_id = $1', [userId]);
  return r.rows[0] || DEFAULT_CONTROLS;
}

export async function assertDepositsAllowed(userId) {
  const c = await getUserFinancialControls(userId);
  if (!c.deposits_enabled) {
    throw new AppError('Deposits are currently disabled for your account. Contact support for help.', 403, 'DEPOSITS_DISABLED');
  }
}

export async function assertWithdrawalsAllowed(userId) {
  const c = await getUserFinancialControls(userId);
  if (!c.withdrawals_enabled) {
    throw new AppError('Withdrawals are currently disabled for your account. Contact support for help.', 403, 'WITHDRAWALS_DISABLED');
  }
}

/** Null means no override — caller should fall back to the KYC-tier-derived cap. */
export async function getCustomWithdrawalLimitUsd(userId) {
  const c = await getUserFinancialControls(userId);
  return c.custom_withdrawal_limit_usd != null ? Number(c.custom_withdrawal_limit_usd) : null;
}

/** Null means no override — caller should fall back to the fixed NGN tier deposit limit. */
export async function getCustomDepositLimitNgn(userId) {
  const c = await getUserFinancialControls(userId);
  return c.custom_deposit_limit_ngn != null ? Number(c.custom_deposit_limit_ngn) : null;
}

/** Admin upsert — only the fields present in `updates` are changed. */
export async function upsertUserFinancialControls(userId, updates, adminId) {
  const fields = ['deposits_enabled', 'withdrawals_enabled', 'custom_deposit_limit_ngn', 'custom_withdrawal_limit_usd'];
  const present = fields.filter((f) => Object.prototype.hasOwnProperty.call(updates, f));
  if (present.length === 0) throw new AppError('No fields to update', 400);

  const existing = await getUserFinancialControls(userId);
  const merged = { ...existing, ...updates };

  const r = await query(
    `INSERT INTO user_financial_controls
       (user_id, deposits_enabled, withdrawals_enabled, custom_deposit_limit_ngn, custom_withdrawal_limit_usd, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       deposits_enabled = $2, withdrawals_enabled = $3,
       custom_deposit_limit_ngn = $4, custom_withdrawal_limit_usd = $5,
       updated_by = $6, updated_at = NOW()
     RETURNING *`,
    [
      userId,
      merged.deposits_enabled,
      merged.withdrawals_enabled,
      merged.custom_deposit_limit_ngn,
      merged.custom_withdrawal_limit_usd,
      adminId,
    ]
  );
  return r.rows[0];
}
