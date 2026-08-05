import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { kycTierLevel } from '../middleware/auth.js';
import yellowCard from '../orchestration/adapters/fx/YellowCardService.js';
import logger from '../utils/logger.js';
import { getCustomWithdrawalLimitUsd } from './financialControls.service.js';

// Fiat vs crypto — determines which half of a tier's split cap applies to a transaction.
const FIAT_CURRENCIES = new Set(['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR', 'CAD', 'CNY', 'AUD', 'JPY']);
const isFiat = (currency) => FIAT_CURRENCIES.has(String(currency || '').toUpperCase());

/**
 * KYC tier transaction limits (USD), split by crypto vs fiat since the two move at very
 * different scales on this platform:
 *   tier_1 — profile complete (name, address, phone, verified email). No transacting yet.
 *   tier_2 — NIN + facial/biometric verification.
 *   tier_3 — + proof of address (utility bill / bank statement).
 * Monthly = 10x daily, matching the platform's existing tier-limit convention.
 */
export const TIER_CAPS_USD = {
  0: { crypto: { daily: 0, monthly: 0 }, fiat: { daily: 0, monthly: 0 } },
  1: { crypto: { daily: 0, monthly: 0 }, fiat: { daily: 0, monthly: 0 } },
  2: { crypto: { daily: 5000000, monthly: 50000000 }, fiat: { daily: 50000, monthly: 500000 } },
  3: { crypto: { daily: 8000000, monthly: 80000000 }, fiat: { daily: 500000, monthly: 5000000 } },
};

/** The cap object for a tier level + currency kind ('crypto'|'fiat'), clamped to known tiers. */
export function tierCapFor(kycTier, currency) {
  const level = Math.min(kycTierLevel(kycTier), 3);
  const caps = TIER_CAPS_USD[level] || TIER_CAPS_USD[0];
  return isFiat(currency) ? caps.fiat : caps.crypto;
}

// USD-rate cache so limit checks don't hit the FX provider on every transaction.
const rateCache = new Map(); // currency -> { rate, at }
const RATE_TTL_MS = 10 * 60 * 1000;

async function usdRate(currency) {
  const cur = String(currency || 'USD').toUpperCase();
  if (['USD', 'USDT', 'USDC'].includes(cur)) return 1;
  const hit = rateCache.get(cur);
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return hit.rate;
  try {
    const r = await yellowCard.getExchangeRate(cur, 'USD');
    const rate = Number(r?.rate) || 0;
    if (rate > 0) { rateCache.set(cur, { rate, at: Date.now() }); return rate; }
  } catch (e) {
    logger.warn(`[KYCLimits] USD rate for ${cur} unavailable: ${e.message}`);
  }
  return hit?.rate ?? null; // stale cache beats nothing
}

/**
 * Sum the user's money-out in USD since `since`, split into crypto vs fiat buckets (the two
 * halves of a tier's cap). Sources: bank transfers & other outflows in `transactions`
 * (everything except deposits), `bill_payments`, and `fx_transactions` (international
 * transfers + crypto ramp; internal swaps excluded). Failed/reversed rows and refunds don't count.
 */
async function usdOutflowSince(userId, since) {
  const rows = (await query(
    `SELECT from_currency::text AS currency, SUM(from_amount)::numeric AS total
       FROM transactions
      WHERE user_id = $1 AND created_at >= $2
        AND transaction_type::text NOT IN ('deposit','refund','exchange_in','credit')
        AND status::text NOT IN ('failed','reversed','cancelled')
      GROUP BY 1
     UNION ALL
     SELECT currency::text, SUM(amount + COALESCE(fee,0))::numeric
       FROM bill_payments
      WHERE user_id = $1 AND created_at >= $2
        AND status::text NOT IN ('failed','reversed','cancelled')
      GROUP BY 1
     UNION ALL
     SELECT from_currency::text, SUM(amount)::numeric
       FROM fx_transactions
      WHERE user_id = $1 AND created_at >= $2
        AND type NOT IN ('swap')
        AND UPPER(status) NOT IN ('FAILED','REVERSED')
      GROUP BY 1`,
    [userId, since]
  )).rows;

  let cryptoUsd = 0;
  let fiatUsd = 0;
  for (const r of rows) {
    const rate = await usdRate(r.currency);
    if (rate == null) { logger.warn(`[KYCLimits] skipping ${r.total} ${r.currency} (no USD rate)`); continue; }
    const usd = Number(r.total) * rate;
    if (isFiat(r.currency)) fiatUsd += usd; else cryptoUsd += usd;
  }
  return { cryptoUsd, fiatUsd };
}

/**
 * Enforce the user's tier limits for a new outgoing transaction. Crypto and fiat limits are
 * tracked independently, so a transaction in one never counts against the other's cap.
 * @param {string} userId
 * @param {number} amount  transaction amount in `currency`
 * @param {string} currency
 * @param {string} kycTier user's tier ('tier_1' | number)
 * @throws AppError 403 LIMIT_EXCEEDED when the transaction would breach the daily/monthly cap.
 */
export async function enforceTierLimit(userId, amount, currency, kycTier) {
  let caps = tierCapFor(kycTier, currency);
  const kind = isFiat(currency) ? 'fiat' : 'crypto';

  // An admin-set custom override always replaces the tier default (both daily and monthly,
  // monthly scaled 10x like every other cap on this platform) — see financialControls.service.js.
  const customDaily = await getCustomWithdrawalLimitUsd(userId).catch(() => null);
  if (customDaily != null) {
    caps = { daily: customDaily, monthly: customDaily * 10 };
  }

  const rate = await usdRate(currency);
  if (rate == null) {
    // Can't price the transaction — don't hard-block payments on an FX outage, but log loudly.
    logger.error(`[KYCLimits] cannot convert ${amount} ${currency} to USD — limit check skipped for user ${userId}`);
    return;
  }
  const txUsd = Number(amount) * rate;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [daySpent, monthSpent] = await Promise.all([
    usdOutflowSince(userId, dayStart.toISOString()),
    usdOutflowSince(userId, monthStart.toISOString()),
  ]);
  const daySpentUsd = kind === 'fiat' ? daySpent.fiatUsd : daySpent.cryptoUsd;
  const monthSpentUsd = kind === 'fiat' ? monthSpent.fiatUsd : monthSpent.cryptoUsd;

  if (daySpentUsd + txUsd > caps.daily) {
    const left = Math.max(0, caps.daily - daySpentUsd);
    throw new AppError(
      `This transaction exceeds your daily ${kind} limit of $${caps.daily.toLocaleString()} (about $${left.toFixed(2)} remaining today). Upgrade your KYC tier for higher limits.`,
      403, 'LIMIT_EXCEEDED'
    );
  }
  if (monthSpentUsd + txUsd > caps.monthly) {
    const left = Math.max(0, caps.monthly - monthSpentUsd);
    throw new AppError(
      `This transaction exceeds your monthly ${kind} limit of $${caps.monthly.toLocaleString()} (about $${left.toFixed(2)} remaining this month). Upgrade your KYC tier for higher limits.`,
      403, 'LIMIT_EXCEEDED'
    );
  }
}
