import { query } from '../config/database.js';

/**
 * JAXOPAY's margin on Yellow Card's Global Finance products, expressed as a markup baked into the
 * exchange rate itself rather than a separate fee added to (or deducted from) the amount. The
 * customer only ever sees one final rate — there is no fee line to disclose, by design.
 *
 * Deliberately NOT shared with swapMarkup.service.js (Obiex/Quidax crypto swap), despite both
 * reading markup_percentage out of exchange_rates, because the two providers quote rates
 * differently and the math genuinely differs:
 *
 *   - Obiex quotes "the price of whichever side of the pair is crypto", so its markup has to be
 *     direction-aware (isInverseDirection there divides for fiat->crypto, multiplies otherwise),
 *     and a positive markup means opposite things in each direction.
 *   - Yellow Card's getExchangeRate always means `amount_to = amount_from * rate`, for every pair
 *     in either direction (it derives every cross rate from a per-currency USD table — see
 *     YellowCardService.getExchangeRate). So the markup here is always a straight multiply, and a
 *     positive markup always means the same thing: JAXOPAY's margin, i.e. a worse rate for the
 *     customer.
 *
 * Keeping the conventions separate is what lets this one stay simple; do not "unify" them.
 */

/** Products priced through this mechanism. Payment Collection is absent on purpose — it converts
 *  nothing customer-facing (USDT in, USDT out, minus a skim), so it has no rate to mark up and
 *  stays on fee_configurations. */
export const YC_MARKUP_PRODUCTS = ['yc_swap', 'yc_international_transfer'];

/**
 * The admin-configured markup for one product's currency pair. An unconfigured pair returns 0 —
 * the transaction still goes through, at Yellow Card's raw rate with no margin — matching how
 * crypto swap treats an unconfigured pair.
 */
export async function getYcMarkupPercentage(product, fromCurrency, toCurrency) {
  const result = await query(
    `SELECT markup_percentage FROM exchange_rates
     WHERE product = $1 AND from_currency = $2 AND to_currency = $3 AND is_active = true`,
    [product, String(fromCurrency).toUpperCase(), String(toCurrency).toUpperCase()]
  );
  if (result.rows.length === 0) return 0;
  return Number(result.rows[0].markup_percentage) || 0;
}

/**
 * Base rate -> the rate the customer actually transacts at. A positive markup lowers the rate,
 * so the same input amount converts to less output — that difference is JAXOPAY's margin.
 */
export function applyYcMarkup(baseRate, markupPct) {
  const rate = Number(baseRate) || 0;
  const pct = Number(markupPct) || 0;
  if (!pct) return rate;
  return rate * (1 - pct / 100);
}

/**
 * True when a configured markup would hand the customer a BETTER rate than Yellow Card's own —
 * i.e. JAXOPAY paying for the privilege of moving their money. Surfaced as an admin warning
 * before saving, not enforced at runtime (a negative markup is a legitimate, if unusual,
 * promotional choice — it just should never be set by accident).
 */
export function isYcMarkupBackwards(markupPct) {
  return Number(markupPct) < 0;
}
