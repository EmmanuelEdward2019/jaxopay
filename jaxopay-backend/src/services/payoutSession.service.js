import { query } from '../config/database.js';
import obiex from '../orchestration/adapters/crypto/ObiexAdapter.js';
import logger from '../utils/logger.js';

/**
 * NIBSS session ID for a fiat bank payout — the number a Nigerian bank asks for when tracing a
 * transfer that went missing (network glitch, wrong beneficiary, delayed settlement). It is the
 * single most useful thing on a NGN withdrawal receipt, so it has to be on the customer's
 * receipt, the customer's email, and the admin's copy of the same receipt.
 *
 * Where it actually comes from (verified against Obiex's published API reference, 2026-09-08):
 *
 *   POST /wallets/ext/debit/fiat   →  data.payout.externalReference is **null** at this point,
 *                                     status "APPROVED". The payout has been accepted, not sent.
 *   WITHDRAWAL webhook             →  documented payload is type/currency/amount/status/
 *                                     reference/transactionId/createdAt/lastUpdated/hash/
 *                                     network/address. No session ID, ever.
 *   GET /transactions/withdrawals/me →  payout.externalReference is populated once the payout
 *                                     settles: a 30-digit NIBSS session ID such as
 *                                     "436246970508842220876716789858".
 *
 * So the session ID can only ever be *fetched from the API after the fact* — which is exactly
 * what this module does, then persists onto the transaction's metadata so every later read
 * (receipt, email, admin panel, statement) is a plain metadata lookup rather than a fresh call.
 */

// A NIBSS session ID is 30 characters: 6-digit bank code + yymmddhhmmss + 12 random digits.
// Obiex reuses `externalReference` for non-NGN rails too (and for crypto payouts it can hold a
// chain reference), so shape-check before labelling something "Session ID" on a receipt. Anything
// that isn't NIBSS-shaped is still kept — as provider_external_reference — just not mislabelled.
const NIBSS_SESSION_ID = /^\d{30}$/;

export const isNibssSessionId = (value) => NIBSS_SESSION_ID.test(String(value || '').trim());

/**
 * Pull a session ID out of any Obiex payload shape — payout response, transaction row, or
 * webhook body. `payout.externalReference` is the real field; the explicit sessionId spellings
 * are kept because they cost nothing and would be the natural name if Obiex ever adds one.
 */
export function extractSessionId(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const sources = [
    payload.payout,
    payload.data?.payout,
    payload.raw?.payout,
    payload.raw?.data?.payout,
    payload,
    payload.data,
    payload.raw,
    payload.raw?.data,
  ];
  const keys = ['sessionId', 'session_id', 'nibssSessionId', 'nibss_session_id', 'sessionID', 'externalReference', 'external_reference'];

  // Two passes: prefer a value that actually looks like a NIBSS session ID over the first
  // non-empty string, so a UUID sitting in `externalReference` can never shadow the real one.
  for (const nibssOnly of [true, false]) {
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      for (const key of keys) {
        const v = src[key];
        if (v == null) continue;
        const s = String(v).trim();
        if (!s) continue;
        if (nibssOnly ? isNibssSessionId(s) : true) return s;
      }
    }
  }
  return null;
}

/**
 * Fetch the session ID for one already-initiated Obiex fiat payout, straight from the API.
 * Returns null when Obiex has not published one yet (payout still in flight) or the payout
 * cannot be located. Never throws — a missing session ID must not break a receipt or an email.
 */
export async function fetchSessionIdFromProvider({ obiexWithdrawId, reference }) {
  if (!obiexWithdrawId && !reference) return null;
  try {
    const row = await obiex.getPayoutForTransaction(obiexWithdrawId, reference);
    if (!row) return null;
    return extractSessionId(row);
  } catch (e) {
    logger.warn(`[PayoutSession] Obiex lookup failed for ${obiexWithdrawId || reference}: ${e.message}`);
    return null;
  }
}

/**
 * Make sure `metadata.session_id` is present on a fiat withdrawal row, fetching it from Obiex
 * and persisting it if it isn't. Idempotent and safe to call on every receipt/email/admin read:
 * a row that already has one costs nothing, and a row whose payout hasn't settled yet simply
 * returns null and will be retried on the next read.
 *
 * @param {object} tx  a `transactions` row with at least { id, metadata }
 * @param {string} [table='transactions']
 * @returns {Promise<string|null>} the session ID, or null if the provider has none yet
 */
export async function ensureSessionId(tx, table = 'transactions') {
  if (!tx?.id) return null;
  const metadata = tx.metadata || {};
  if (metadata.session_id) return String(metadata.session_id);

  // Only Obiex fiat payouts have one. Korapay disbursements and crypto withdrawals do not.
  const obiexWithdrawId = metadata.obiex_withdraw_id || null;
  const providerReference = metadata.obiex_reference || tx.reference || null;
  if (!obiexWithdrawId && !providerReference) return null;
  if (metadata.provider && metadata.provider !== 'obiex') return null;

  const sessionId = await fetchSessionIdFromProvider({ obiexWithdrawId, reference: providerReference });
  if (!sessionId) return null;

  const patch = isNibssSessionId(sessionId)
    ? { session_id: sessionId, session_id_source: 'obiex_api' }
    : { provider_external_reference: sessionId };

  try {
    await query(
      `UPDATE ${table === 'wallet_transactions' ? 'wallet_transactions' : 'transactions'}
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(patch), tx.id]
    );
    logger.info(`[PayoutSession] Captured session ID for transaction ${tx.id} from Obiex API`);
  } catch (e) {
    logger.warn(`[PayoutSession] Could not persist session ID for ${tx.id}: ${e.message}`);
  }

  return patch.session_id || null;
}

/**
 * Bulk version of ensureSessionId for a page of transactions — used by the transaction list and
 * the admin transaction monitor so a receipt opened from a list already has its session ID.
 * Only rows that are (a) completed bank transfers, (b) missing a session ID, and (c) Obiex-backed
 * are looked up, and no more than `limit` of them per call so one API hiccup can't stall a page.
 */
export async function backfillSessionIds(rows, { limit = 5, table = 'transactions' } = {}) {
  const candidates = (rows || []).filter((r) => {
    const m = r?.metadata;
    if (!m || typeof m !== 'object') return false;
    if (m.session_id) return false;
    if (!m.obiex_withdraw_id && !m.obiex_reference) return false;
    // A payout that never left "pending" has no session ID yet — don't spend a call on it.
    return ['completed', 'processing', 'success', 'successful'].includes(String(r.status || '').toLowerCase());
  }).slice(0, limit);

  if (candidates.length === 0) return rows;

  await Promise.all(candidates.map(async (row) => {
    const sessionId = await ensureSessionId(row, table).catch(() => null);
    if (sessionId) row.metadata = { ...row.metadata, session_id: sessionId };
  }));

  return rows;
}
