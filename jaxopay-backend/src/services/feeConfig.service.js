import { query } from '../config/database.js';

/**
 * Compute a fee for an amount from a fee_configurations row.
 *
 * fee_type:
 *   - 'fixed'             → fee = fee_value                (min_fee/max_fee clamp)
 *   - 'percentage'        → fee = amount * fee_value / 100  (min_fee floor, max_fee cap)
 *   - 'flat_plus_percent' → fee = min_fee (flat) + amount * fee_value (percent) / 100  (max_fee caps)
 *
 * For 'flat_plus_percent', `min_fee` holds the flat component and `fee_value` the percentage.
 */
export function computeFee(cfg, amount) {
  if (!cfg) return 0;
  const pct = Number(cfg.fee_value) || 0;
  const flat = Number(cfg.min_fee) || 0;
  const cap = Number(cfg.max_fee) || 0;
  const amt = Number(amount) || 0;

  let fee = 0;
  switch (cfg.fee_type) {
    case 'fixed':
      fee = pct; // fee_value holds the flat amount for 'fixed'
      break;
    case 'percentage':
      fee = (amt * pct) / 100;
      if (flat) fee = Math.max(fee, flat); // min_fee is a floor here
      break;
    case 'flat_plus_percent':
      fee = flat + (amt * pct) / 100;
      break;
    default:
      fee = 0;
  }
  if (cap > 0) fee = Math.min(fee, cap);
  return Math.round((fee + Number.EPSILON) * 100) / 100;
}

/** Fetch the active fee config for a transaction type (currency-specific first, then global). */
export async function getFeeConfig(transactionType, currency = 'USD') {
  const r = await query(
    `SELECT * FROM fee_configurations
     WHERE transaction_type = $1 AND is_active = true
       AND (currency = $2 OR currency IS NULL OR currency = '')
     ORDER BY (currency = $2) DESC, (country IS NULL OR country = '') DESC
     LIMIT 1`,
    [transactionType, currency]
  );
  return r.rows[0] || null;
}

/** Convenience: compute the fee for a card op. kind = 'card_creation' | 'card_funding'. */
export async function getCardFee(kind, amount) {
  const cfg = await getFeeConfig(kind, 'USD');
  return { fee: computeFee(cfg, amount), config: cfg };
}
