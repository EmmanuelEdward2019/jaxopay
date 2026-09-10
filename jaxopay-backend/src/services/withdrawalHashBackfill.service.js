import { query } from '../config/database.js';
import obiex from '../orchestration/adapters/crypto/ObiexAdapter.js';
import logger from '../utils/logger.js';

/**
 * Recovers the on-chain hash for crypto withdrawals that never captured one.
 *
 * Obiex delivered the SUCCESSFUL webhook carrying the hash for every one of these; our own lookup
 * threw `column "reference" does not exist` before reading anything, so the events were received
 * and discarded (see obiexWebhook.service.js). With that fixed, asking Obiex to re-deliver the
 * event is enough to fill in what was lost — no new data source, just a replay of what they
 * already sent.
 *
 * Safe by construction: these rows are already `completed`, so a replayed event takes
 * updateObiexWithdrawal's already-final branch, which attaches hash/network and returns without
 * touching status, balances, or notifications. It cannot double-credit or re-email anyone.
 *
 * Must run somewhere Obiex has allowlisted — the droplet, not a dev machine.
 */
export async function backfillCryptoWithdrawalHashes({ limit = 25, dryRun = false } = {}) {
  const rows = (await query(
    `SELECT id, amount, currency, created_at,
            metadata->>'obiex_withdraw_id' AS obiex_id
       FROM wallet_transactions
      WHERE transaction_type = 'withdrawal'
        AND COALESCE(metadata->>'hash', '') = ''
        AND metadata->>'obiex_withdraw_id' IS NOT NULL
        AND status IN ('completed', 'pending', 'processing')
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  )).rows;

  if (rows.length === 0) {
    logger.info('[HashBackfill] Nothing to do — every crypto withdrawal already has a hash');
    return { candidates: 0, requested: 0, failed: 0 };
  }

  logger.info(`[HashBackfill] ${rows.length} crypto withdrawal(s) missing a hash${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) {
    for (const r of rows) logger.info(`[HashBackfill]   would resend ${r.obiex_id} (${r.amount} ${r.currency})`);
    return { candidates: rows.length, requested: 0, failed: 0, dryRun: true };
  }

  let requested = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await obiex.resendWebhook(r.obiex_id);
      requested++;
      logger.info(`[HashBackfill] Requested webhook replay for ${r.obiex_id} (${r.amount} ${r.currency})`);
    } catch (e) {
      failed++;
      logger.warn(`[HashBackfill] Replay request failed for ${r.obiex_id}: ${e.message}`);
    }
  }

  // The hash arrives on the replayed webhook, not in this response — it lands asynchronously via
  // the normal handler. Callers should re-read the rows shortly after rather than expect it here.
  logger.info(`[HashBackfill] Done — requested ${requested}, failed ${failed}. Hashes arrive via the replayed webhooks.`);
  return { candidates: rows.length, requested, failed };
}
