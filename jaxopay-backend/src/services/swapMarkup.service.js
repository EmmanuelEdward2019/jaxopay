import { query } from '../config/database.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import obiex from '../orchestration/adapters/crypto/ObiexAdapter.js';
import logger from '../utils/logger.js';

// Same provider selection crypto.controller.js uses for the actual swap execution — mirrored
// here (not imported from a controller) so markup math always uses the same exchange the coin
// actually trades on. See kycLimits.service.js for the identical pattern.
const CRYPTO_PROVIDER = (process.env.CRYPTO_PROVIDER || 'obiex').toLowerCase() === 'quidax' ? 'quidax' : 'obiex';
const cryptoFx = CRYPTO_PROVIDER === 'quidax' ? quidax : obiex;

const FIAT_CURRENCIES = new Set(['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR', 'CAD', 'CNY', 'AUD', 'JPY']);
export const isFiatCurrency = (currency) => FIAT_CURRENCIES.has(String(currency || '').toUpperCase());

/**
 * Admin-facing "Base" rate for a FROM->TO pair — always the price of whichever side is the
 * crypto asset, expressed in the other asset (e.g. USDT->NGN AND NGN->USDT both quote "1 USDT =
 * X NGN", never "1 NGN = 0.0007 USDT"). This is a live provider call, used only for the admin FX
 * Rates screen's preview/reference — the actual swap flow (below) never reads this; it works
 * directly off whatever amount the live quote for the real trade returns.
 */
export async function getSwapBaseRate(fromCurrency, toCurrency) {
  const from = String(fromCurrency).toUpperCase();
  const to = String(toCurrency).toUpperCase();
  if (from === to) return 1;
  // crypto -> fiat: price of FROM (crypto) in TO (fiat). fiat -> crypto: same "price of the
  // crypto side" convention, just quoted with the pair's currencies swapped for the lookup.
  // crypto -> crypto: natural FROM-priced-in-TO (no fiat to normalize against).
  const [priceOf, in_] = isFiatCurrency(from) && !isFiatCurrency(to) ? [to, from] : [from, to];
  const rate = await cryptoFx.getExchangeRate(priceOf, in_);
  return rate == null ? null : Number(rate);
}

// exchange_rates is shared with Yellow Card's own rate markup (ycMarkup.service.js) since
// migration 042, so every read here must be scoped to this product — the same currency pair can
// carry a different margin as a YC swap/transfer than it does as an Obiex/Quidax crypto swap, and
// the two use opposite markup sign conventions.
const PRODUCT = 'crypto_swap';

/** Admin-configured markup % for a FROM->TO pair. 0 (no-op) if unconfigured or inactive — an
 *  unconfigured pair behaves exactly like before this feature existed: raw provider passthrough. */
export async function getSwapMarkupPercentage(fromCurrency, toCurrency) {
  const result = await query(
    `SELECT markup_percentage FROM exchange_rates
     WHERE product = $1 AND from_currency = $2 AND to_currency = $3 AND is_active = true`,
    [PRODUCT, String(fromCurrency).toUpperCase(), String(toCurrency).toUpperCase()]
  );
  if (result.rows.length === 0) return 0;
  return Number(result.rows[0].markup_percentage) || 0;
}

// Bulk, cached version for callers computing markup across many pairs at once (the dashboard/
// homepage ticker's "JAXOPAY Rate" column) — one query for every active pair instead of one
// query per pair per request. Mirrors crypto.controller.js's own ticker-snapshot cache (same
// 5-minute TTL); admin FX-rate edits show up within that window, not instantly, which is fine
// for a decorative rate display.
let _markupCache = new Map(); // "FROM:TO" -> percentage
let _markupCacheTime = 0;
const MARKUP_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getAllSwapMarkups() {
  if (_markupCache.size > 0 && Date.now() - _markupCacheTime < MARKUP_CACHE_TTL_MS) {
    return _markupCache;
  }
  try {
    // Product-scoped for the same reason getSwapMarkupPercentage is — without it a Yellow Card
    // row for an overlapping pair would silently overwrite the crypto one in this cache (the Map
    // is keyed by pair alone), corrupting the public "JAXOPAY Rate" ticker.
    const result = await query(
      `SELECT from_currency, to_currency, markup_percentage FROM exchange_rates
       WHERE product = $1 AND is_active = true`,
      [PRODUCT]
    );
    const next = new Map();
    for (const row of result.rows) {
      next.set(`${row.from_currency}:${row.to_currency}`, Number(row.markup_percentage) || 0);
    }
    _markupCache = next;
    _markupCacheTime = Date.now();
  } catch (e) {
    logger.warn('[SwapMarkup] Failed to refresh markup cache:', e.message);
  }
  return _markupCache;
}

// The one direction where the "price of crypto in fiat" convention is inversely related to how
// much of the output currency a fixed input actually buys: paying a fixed amount of FIAT for
// CRYPTO means a *higher* crypto price buys *less* crypto. Every other direction (selling crypto
// for fiat, or crypto<->crypto) multiplies the raw amount directly by the markup factor.
// Worked examples this was derived from (also in jaxopay memory: fx-rates-swap-markup.md):
//   USDT->NGN (selling USDT), Obiex 1395, JAXOPAY 1393 (markup -0.1435%): multiply branch.
//   NGN->USDT (buying USDT), Obiex 1395, JAXOPAY 1400 (markup +0.3571%): divide branch.
function isInverseDirection(fromCurrency, toCurrency) {
  return isFiatCurrency(fromCurrency) && !isFiatCurrency(toCurrency);
}

/**
 * What the customer actually receives, given the raw `to_amount` a swap quote/execution would
 * otherwise deliver. A correctly-signed markup (negative when the customer is selling crypto,
 * positive when buying crypto with fiat) always REDUCES this relative to the raw amount — that
 * reduction is JAXOPAY's margin. Returns the raw amount unchanged when markupPct is 0.
 */
export function markDownDelivered(rawToAmount, fromCurrency, toCurrency, markupPct) {
  const raw = Number(rawToAmount) || 0;
  if (!markupPct) return raw;
  const factor = 1 + Number(markupPct) / 100;
  return isInverseDirection(fromCurrency, toCurrency) ? raw / factor : raw * factor;
}

/**
 * Inverse of markDownDelivered: given a TARGET amount the customer wants to end up with (the
 * "I want to receive exactly X" swap flow), returns the larger amount to actually request from
 * the provider so that, after marking down on execution, the customer nets exactly the target.
 */
export function inflateTarget(desiredToAmount, fromCurrency, toCurrency, markupPct) {
  const desired = Number(desiredToAmount) || 0;
  if (!markupPct) return desired;
  const factor = 1 + Number(markupPct) / 100;
  return isInverseDirection(fromCurrency, toCurrency) ? desired * factor : desired / factor;
}

/**
 * True if the given markup, applied via markDownDelivered, would make the customer's rate
 * BETTER than the raw provider rate (i.e. the sign is backwards and JAXOPAY would be giving
 * away money instead of earning margin). Used to warn the admin before they save a pair.
 */
export function isMarkupBackwards(fromCurrency, toCurrency, markupPct) {
  if (!markupPct) return false;
  const marked = markDownDelivered(100, fromCurrency, toCurrency, markupPct);
  return marked > 100;
}

logger.info(`[SwapMarkup] Using ${CRYPTO_PROVIDER} for live base-rate lookups`);
