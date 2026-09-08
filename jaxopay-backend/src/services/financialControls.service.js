import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

const DEFAULT_CONTROLS = {
  deposits_fiat_enabled: true,
  deposits_crypto_enabled: true,
  withdrawals_fiat_enabled: true,
  withdrawals_crypto_enabled: true,
  custom_deposit_limit_ngn: null,
  custom_withdrawal_limit_usd: null,
  custom_withdrawal_limit_fiat_usd: null,
  custom_withdrawal_limit_crypto_usd: null,
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

/**
 * The admin-set DAILY withdrawal cap (USD) for one half of a user's activity, or null when there
 * is no override and the KYC tier default should apply.
 *
 * Crypto and fiat are capped independently — same split as TIER_CAPS_USD — so an admin can pin a
 * suspicious account's fiat cash-out without touching its crypto activity, or the reverse. The
 * pre-split single column is still honoured as a fallback so overrides set before migration 046
 * keep behaving exactly as they did.
 *
 * @param {string} userId
 * @param {'fiat'|'crypto'} kind
 */
export async function getCustomWithdrawalLimitUsd(userId, kind = 'fiat') {
  const c = await getUserFinancialControls(userId);
  const specific = kind === 'crypto' ? c.custom_withdrawal_limit_crypto_usd : c.custom_withdrawal_limit_fiat_usd;
  const value = specific != null ? specific : c.custom_withdrawal_limit_usd;
  return value != null ? Number(value) : null;
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
  'custom_withdrawal_limit_fiat_usd',
  'custom_withdrawal_limit_crypto_usd',
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
        custom_deposit_limit_ngn, custom_withdrawal_limit_usd,
        custom_withdrawal_limit_fiat_usd, custom_withdrawal_limit_crypto_usd,
        updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       deposits_fiat_enabled = $2, deposits_crypto_enabled = $3,
       withdrawals_fiat_enabled = $4, withdrawals_crypto_enabled = $5,
       custom_deposit_limit_ngn = $6, custom_withdrawal_limit_usd = $7,
       custom_withdrawal_limit_fiat_usd = $8, custom_withdrawal_limit_crypto_usd = $9,
       updated_by = $10, updated_at = NOW()
     RETURNING *`,
    [
      userId,
      merged.deposits_fiat_enabled,
      merged.deposits_crypto_enabled,
      merged.withdrawals_fiat_enabled,
      merged.withdrawals_crypto_enabled,
      merged.custom_deposit_limit_ngn,
      merged.custom_withdrawal_limit_usd,
      merged.custom_withdrawal_limit_fiat_usd,
      merged.custom_withdrawal_limit_crypto_usd,
      adminId,
    ]
  );
  return r.rows[0];
}
