import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

const DEFAULT_CONTROLS = {
  deposits_fiat_enabled: true,
  deposits_crypto_enabled: true,
  withdrawals_fiat_enabled: true,
  withdrawals_crypto_enabled: true,
  custom_deposit_limit_ngn: null,
  custom_withdrawal_limit_usd: null,
};

/** A user with no row yet has no admin override — full default access. */
export async function getUserFinancialControls(userId) {
  const r = await query('SELECT * FROM user_financial_controls WHERE user_id = $1', [userId]);
  return r.rows[0] || DEFAULT_CONTROLS;
}

/** @param {'fiat'|'crypto'} kind */
export async function assertDepositsAllowed(userId, kind) {
  const c = await getUserFinancialControls(userId);
  const enabled = kind === 'crypto' ? c.deposits_crypto_enabled : c.deposits_fiat_enabled;
  if (!enabled) {
    throw new AppError(
      `${kind === 'crypto' ? 'Crypto' : 'Fiat'} deposits are currently disabled for your account. Contact support for help.`,
      403, 'DEPOSITS_DISABLED'
    );
  }
}

/** @param {'fiat'|'crypto'} kind */
export async function assertWithdrawalsAllowed(userId, kind) {
  const c = await getUserFinancialControls(userId);
  const enabled = kind === 'crypto' ? c.withdrawals_crypto_enabled : c.withdrawals_fiat_enabled;
  if (!enabled) {
    throw new AppError(
      `${kind === 'crypto' ? 'Crypto' : 'Fiat'} withdrawals are currently disabled for your account. Contact support for help.`,
      403, 'WITHDRAWALS_DISABLED'
    );
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

const EDITABLE_FIELDS = [
  'deposits_fiat_enabled',
  'deposits_crypto_enabled',
  'withdrawals_fiat_enabled',
  'withdrawals_crypto_enabled',
  'custom_deposit_limit_ngn',
  'custom_withdrawal_limit_usd',
];

/** Admin upsert — only the fields present in `updates` are changed. */
export async function upsertUserFinancialControls(userId, updates, adminId) {
  const present = EDITABLE_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(updates, f));
  if (present.length === 0) throw new AppError('No fields to update', 400);

  const existing = await getUserFinancialControls(userId);
  const merged = { ...existing, ...updates };

  const r = await query(
    `INSERT INTO user_financial_controls
       (user_id, deposits_fiat_enabled, deposits_crypto_enabled,
        withdrawals_fiat_enabled, withdrawals_crypto_enabled,
        custom_deposit_limit_ngn, custom_withdrawal_limit_usd, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       deposits_fiat_enabled = $2, deposits_crypto_enabled = $3,
       withdrawals_fiat_enabled = $4, withdrawals_crypto_enabled = $5,
       custom_deposit_limit_ngn = $6, custom_withdrawal_limit_usd = $7,
       updated_by = $8, updated_at = NOW()
     RETURNING *`,
    [
      userId,
      merged.deposits_fiat_enabled,
      merged.deposits_crypto_enabled,
      merged.withdrawals_fiat_enabled,
      merged.withdrawals_crypto_enabled,
      merged.custom_deposit_limit_ngn,
      merged.custom_withdrawal_limit_usd,
      adminId,
    ]
  );
  return r.rows[0];
}
