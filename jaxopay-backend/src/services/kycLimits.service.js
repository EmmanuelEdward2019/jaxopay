import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { kycTierLevel } from '../middleware/auth.js';
import yellowCard from '../orchestration/adapters/fx/YellowCardService.js';
import logger from '../utils/logger.js';

/**
 * KYC tier transaction limits (USD). tier_0 cannot transact at all (route gates enforce that);
 * these caps bound how much verified users can move out per day / calendar month.
 */
export const TIER_CAPS_USD = {
  0: { daily: 0, monthly: 0 },
  1: { daily: 1000, monthly: 10000 },
  2: { daily: 5000, monthly: 50000 },
};

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
 * Sum the user's money-out in USD since `since`. Sources: bank transfers & other outflows in
 * `transactions` (everything except deposits), `bill_payments`, and `fx_transactions`
 * (international transfers + crypto ramp; internal swaps excluded). Failed/reversed rows and
 * refunds don't count.
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

  let usd = 0;
  for (const r of rows) {
    const rate = await usdRate(r.currency);
    if (rate == null) { logger.warn(`[KYCLimits] skipping ${r.total} ${r.currency} (no USD rate)`); continue; }
    usd += Number(r.total) * rate;
  }
  return usd;
}

/**
 * Enforce the user's tier limits for a new outgoing transaction.
 * @param {string} userId
 * @param {number} amount  transaction amount in `currency`
 * @param {string} currency
 * @param {string} kycTier user's tier ('tier_1' | number)
 * @throws AppError 403 LIMIT_EXCEEDED when the transaction would breach the daily/monthly cap.
 */
export async function enforceTierLimit(userId, amount, currency, kycTier) {
  const level = kycTierLevel(kycTier);
  const caps = TIER_CAPS_USD[Math.min(level, 2)] || TIER_CAPS_USD[0];

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

  if (daySpent + txUsd > caps.daily) {
    const left = Math.max(0, caps.daily - daySpent);
    throw new AppError(
      `This transaction exceeds your daily limit of $${caps.daily.toLocaleString()} (about $${left.toFixed(2)} remaining today). Upgrade your KYC tier for higher limits.`,
      403, 'LIMIT_EXCEEDED'
    );
  }
  if (monthSpent + txUsd > caps.monthly) {
    const left = Math.max(0, caps.monthly - monthSpent);
    throw new AppError(
      `This transaction exceeds your monthly limit of $${caps.monthly.toLocaleString()} (about $${left.toFixed(2)} remaining this month). Upgrade your KYC tier for higher limits.`,
      403, 'LIMIT_EXCEEDED'
    );
  }
}
