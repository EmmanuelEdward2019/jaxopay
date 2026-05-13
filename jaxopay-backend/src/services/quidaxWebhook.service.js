import { transaction as dbTransaction } from '../config/database.js';
import defaultLogger from '../utils/logger.js';

export function getQuidaxUserRefs(data) {
  const user = data?.user || {};
  return [
    user.id,
    user.uid,
    user.user_id,
    user.sn,
    data?.user_id,
    data?.quidax_user_id,
    data?.quidax_user_sn,
  ]
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value).trim());
}

export async function findQuidaxUserId(client, quidaxUserRefs) {
  if (!quidaxUserRefs.length) return null;

  const userRes = await client.query(
    `SELECT id
     FROM users
     WHERE quidax_user_id = ANY($1::text[])
        OR quidax_user_sn = ANY($1::text[])
     ORDER BY CASE WHEN quidax_user_id = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [quidaxUserRefs, quidaxUserRefs[0]]
  );

  return userRes.rows[0]?.id || null;
}

export async function upsertCryptoWallet(client, userId, currency, address = null, tag = null) {
  const result = await client.query(
    `INSERT INTO wallets (user_id, currency, wallet_type, balance, available_balance, crypto_address, crypto_tag, is_active)
     VALUES ($1, $2, 'crypto', 0, 0, $3, $4, true)
     ON CONFLICT (user_id, currency, wallet_type) DO UPDATE
       SET crypto_address = COALESCE(EXCLUDED.crypto_address, wallets.crypto_address),
           crypto_tag = COALESCE(EXCLUDED.crypto_tag, wallets.crypto_tag),
           is_active = true,
           deleted_at = NULL,
           updated_at = NOW()
     RETURNING id, user_id`,
    [userId, currency, address, tag || null]
  );

  return result.rows[0];
}

export function createQuidaxWebhookService({
  transaction = dbTransaction,
  logger = defaultLogger,
} = {}) {
  /**
   * wallet.address.generated webhook — fired when a sub-user's wallet address is
   * created asynchronously. Persists the address into wallets.crypto_address so
   * deposit webhooks can match by address as a fallback.
   */
  async function persistQuidaxWalletAddress(data) {
    const quidaxUserRefs = getQuidaxUserRefs(data);
    const quidaxSubUserId = quidaxUserRefs[0] || null;
    const address = data.address;
    const currency = data.currency?.toUpperCase();
    const tag = data.destination_tag || null;

    if (!quidaxSubUserId || !address || !currency) {
      logger.warn('[WEBHOOK] wallet.address.generated: missing user.id, address or currency', { data });
      return;
    }

    try {
      await transaction(async (client) => {
        const userId = await findQuidaxUserId(client, quidaxUserRefs);
        if (!userId) {
          logger.warn(`[WEBHOOK] wallet.address.generated: no user found for quidax user refs=${quidaxUserRefs.join(',')}`);
          return;
        }

        const wallet = await upsertCryptoWallet(client, userId, currency, address, tag);
        logger.info(`[WEBHOOK] ✅ wallet.address.generated: ${currency} address ${address} saved for wallet ${wallet.id} (user ${userId})`);
      });
    } catch (err) {
      logger.error('[WEBHOOK] persistQuidaxWalletAddress error:', err.message);
    }
  }

  async function creditUserWalletByQuidax(data) {
    const { amount, currency, address, id: quidaxTxId } = data;
    const tag = data.address_info?.tag || data.tag || '';
    const currencyUpper = currency?.toUpperCase();

    // Quidax webhook carries data.user.id when using sub-accounts, but older
    // accounts may have either Quidax id or sn persisted locally.
    const quidaxUserRefs = getQuidaxUserRefs(data);
    const quidaxSubUserId = quidaxUserRefs[0] || null;

    if (!amount || !currencyUpper || !quidaxTxId) {
      logger.warn('[WEBHOOK] Quidax deposit: missing amount, currency or id', { data });
      return;
    }

    try {
      await transaction(async (client) => {
        let walletRow = null;

        const matchedUserId = await findQuidaxUserId(client, quidaxUserRefs);
        if (matchedUserId) {
          walletRow = await upsertCryptoWallet(client, matchedUserId, currencyUpper, address || null, tag || null);
        }

        // Fallback: match by the stored deposit address (covers legacy / migrated users)
        if (!walletRow && address) {
          const byAddress = await client.query(
            `SELECT id, user_id FROM wallets
             WHERE (crypto_address = $1 OR crypto_address = $2)
               AND currency = $3
               AND wallet_type = 'crypto'
               AND is_active = true`,
            [address, address.toLowerCase(), currencyUpper]
          );
          if (byAddress.rows.length > 0) walletRow = byAddress.rows[0];
        }

        if (!walletRow) {
          logger.warn(
            `[WEBHOOK] Quidax deposit: No wallet found — quidaxUserId=${quidaxSubUserId}, address=${address}, currency=${currencyUpper}`
          );
          return;
        }

        const { id: walletId, user_id: userId } = walletRow;

        const dupRes = await client.query(
          `SELECT id FROM wallet_transactions WHERE metadata->>'quidax_tx_id' = $1`,
          [String(quidaxTxId)]
        );
        if (dupRes.rows.length > 0) {
          logger.info(`[WEBHOOK] Quidax deposit already processed: ${quidaxTxId}`);
          return;
        }

        await client.query(
          `UPDATE wallets
           SET balance           = balance           + $1,
               available_balance = COALESCE(available_balance, 0) + $1,
               updated_at        = NOW()
           WHERE id = $2`,
          [parseFloat(amount), walletId]
        );

        await client.query(
          `INSERT INTO wallet_transactions
           (wallet_id, transaction_type, amount, currency, status, description, metadata)
           VALUES ($1, 'deposit', $2, $3, 'completed', $4, $5)`,
          [
            walletId,
            parseFloat(amount),
            currencyUpper,
            `Crypto deposit via Quidax (${quidaxTxId})`,
            JSON.stringify({ quidax_tx_id: String(quidaxTxId), address, tag, quidax_user_id: quidaxSubUserId, quidax_user_refs: quidaxUserRefs, source: 'quidax' }),
          ]
        );

        logger.info(`[WEBHOOK] ✅ Quidax credited: ${amount} ${currencyUpper} → wallet ${walletId} (user ${userId})`);
      });
    } catch (err) {
      logger.error('[WEBHOOK] creditUserWalletByQuidax error:', err);
      throw err;
    }
  }

  return {
    creditUserWalletByQuidax,
    persistQuidaxWalletAddress,
  };
}

const quidaxWebhookService = createQuidaxWebhookService();

export const creditUserWalletByQuidax = quidaxWebhookService.creditUserWalletByQuidax;
export const persistQuidaxWalletAddress = quidaxWebhookService.persistQuidaxWalletAddress;
