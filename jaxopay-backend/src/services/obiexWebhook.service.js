import { transaction as dbTransaction, query } from '../config/database.js';
import defaultLogger from '../utils/logger.js';
import { sendTransactionEmails, sendWithdrawalEmails } from './email.service.js';

/**
 * Obiex webhook attribution model.
 *
 * Obiex is a single pooled broker account — there is no per-user sub-account, and its
 * deposit webhook payload does NOT carry the `uniqueUserIdentifier` we passed when the
 * address was generated (confirmed against the live API docs). The only way to attribute
 * an incoming deposit to a specific JAXOPAY user is by matching the webhook's `address`
 * field back to the address we stored on that user's wallet row (`wallets.crypto_address`),
 * which was persisted the moment `getDepositAddress` first created/returned it.
 */

export function createObiexWebhookService({
  transaction = dbTransaction,
  logger = defaultLogger,
} = {}) {
  async function findWalletByAddress(client, address, currency) {
    if (!address || !currency) return null;
    const res = await client.query(
      `SELECT id, user_id FROM wallets
       WHERE (crypto_address = $1 OR LOWER(crypto_address) = LOWER($1))
         AND currency = $2 AND wallet_type = 'crypto' AND is_active = true
       LIMIT 1`,
      [address, String(currency).toUpperCase()]
    );
    return res.rows[0] || null;
  }

  /** DEPOSIT event, status CONFIRMED — credit the matched user's wallet. */
  async function creditUserWalletByObiex(data) {
    const { amount, currency, address, transactionId, reference, status } = data || {};
    const currencyUpper = String(currency || '').toUpperCase();

    if (String(status).toUpperCase() !== 'CONFIRMED') {
      logger.info(`[WEBHOOK] Obiex deposit ${transactionId} status=${status} — not yet confirmed, skipping`);
      return;
    }
    if (!amount || !currencyUpper || !transactionId || !address) {
      logger.warn('[WEBHOOK] Obiex deposit: missing amount, currency, address or transactionId', { data });
      return;
    }

    try {
      let capturedUserId = null;
      await transaction(async (client) => {
        const wallet = await findWalletByAddress(client, address, currencyUpper);
        if (!wallet) {
          logger.warn(`[WEBHOOK] Obiex deposit: no wallet found for address=${address} currency=${currencyUpper}`);
          return;
        }

        const dup = await client.query(
          `SELECT id FROM wallet_transactions WHERE metadata->>'obiex_tx_id' = $1`,
          [String(transactionId)]
        );
        if (dup.rows.length > 0) {
          logger.info(`[WEBHOOK] Obiex deposit already processed: ${transactionId}`);
          return;
        }

        await client.query(
          `UPDATE wallets
           SET balance = balance + $1,
               available_balance = COALESCE(available_balance, 0) + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [parseFloat(amount), wallet.id]
        );

        await client.query(
          `INSERT INTO wallet_transactions
           (wallet_id, transaction_type, amount, currency, status, description, metadata)
           VALUES ($1, 'deposit', $2, $3, 'completed', $4, $5)`,
          [
            wallet.id,
            parseFloat(amount),
            currencyUpper,
            `Crypto deposit via Obiex (${transactionId})`,
            JSON.stringify({ obiex_tx_id: String(transactionId), reference, address, source: 'obiex' }),
          ]
        );

        logger.info(`[WEBHOOK] ✅ Obiex credited: ${amount} ${currencyUpper} → wallet ${wallet.id} (user ${wallet.user_id})`);
        capturedUserId = wallet.user_id;
      });

      if (capturedUserId) {
        try {
          const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [capturedUserId]
          );
          if (userRes.rows.length > 0) {
            sendTransactionEmails({
              type: 'Deposit',
              amount,
              currency: currencyUpper,
              reference: String(transactionId),
              details: 'Crypto Wallet Funding',
            }, userRes.rows[0]).catch((e) => logger.error('[WEBHOOK] Obiex deposit email error:', e));
          }
        } catch (emailErr) {
          logger.error('[WEBHOOK] Obiex deposit email notify error:', emailErr);
        }
      }
    } catch (err) {
      logger.error('[WEBHOOK] creditUserWalletByObiex error:', err);
      throw err;
    }
  }

  /** WITHDRAWAL event — update the matching pending withdrawal's status; refund on failure. */
  async function updateObiexWithdrawal(data) {
    const { transactionId, reference, status } = data || {};
    const statusUpper = String(status || '').toUpperCase();
    const FAILED_STATUSES = new Set(['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED', 'DECLINED']);
    const isSuccessful = statusUpper === 'SUCCESSFUL';
    const isFailed = FAILED_STATUSES.has(statusUpper);

    if (!isSuccessful && !isFailed) {
      logger.info(`[WEBHOOK] Obiex withdrawal ${transactionId} status=${status} — no local state change needed`);
      return;
    }

    try {
      let emailPayload = null;

      await transaction(async (client) => {
        // Crypto withdrawal first (wallet_transactions), then fiat bank payout (transactions,
        // transaction_type='bank_transfer') — Obiex now handles both (crypto via
        // /wallets/ext/debit/crypto, NGN bank payouts via /wallets/ext/debit/fiat), and both
        // share the same WITHDRAWAL webhook event, matching Quidax's existing dual-table pattern.
        let txType = 'wallet_transactions';
        let txRes = await client.query(
          `SELECT id, wallet_id, amount, currency, status AS current_status, metadata
           FROM wallet_transactions
           WHERE metadata->>'obiex_withdraw_id' = $1
              OR ($2::text IS NOT NULL AND (metadata->>'obiex_reference' = $2 OR reference = $2))
           FOR UPDATE`,
          [String(transactionId || ''), reference ? String(reference) : null]
        );

        if (txRes.rows.length === 0) {
          txType = 'transactions';
          txRes = await client.query(
            `SELECT id, user_id, from_wallet_id AS wallet_id, from_amount AS amount, from_currency AS currency, status AS current_status, metadata
             FROM transactions
             WHERE transaction_type = 'bank_transfer'
               AND (metadata->>'obiex_withdraw_id' = $1
                 OR ($2::text IS NOT NULL AND (metadata->>'obiex_reference' = $2 OR reference = $2)))
             FOR UPDATE`,
            [String(transactionId || ''), reference ? String(reference) : null]
          );
        }

        if (txRes.rows.length === 0) {
          logger.warn(`[WEBHOOK] Obiex withdrawal not found: ${transactionId} or ref ${reference}`);
          return;
        }

        const tx = txRes.rows[0];
        const newStatus = isSuccessful ? 'completed' : 'failed';
        if (tx.current_status === newStatus || ['completed', 'failed'].includes(tx.current_status)) {
          logger.info(`[WEBHOOK] Obiex withdrawal ${transactionId} already final (${tx.current_status}); ignoring ${newStatus}`);
          return;
        }

        const table = txType === 'wallet_transactions' ? 'wallet_transactions' : 'transactions';
        await client.query(
          `UPDATE ${table}
           SET status = $1,
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = NOW(),
               completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
           WHERE id = $3`,
          [newStatus, JSON.stringify({ webhook_data: data, updated_at: new Date().toISOString() }), tx.id]
        );

        if (newStatus === 'failed') {
          await client.query(
            `UPDATE wallets
             SET balance = balance + $1,
                 available_balance = COALESCE(available_balance, 0) + $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [parseFloat(tx.amount), tx.wallet_id]
          );
          logger.info(`[WEBHOOK] Obiex withdrawal ${transactionId} failed — refunded ${tx.amount} ${tx.currency} to wallet ${tx.wallet_id}`);
        } else {
          logger.info(`[WEBHOOK] ✅ Obiex withdrawal ${transactionId} confirmed successful`);
        }

        let userId = tx.user_id || null;
        if (!userId) {
          const walletRes = await client.query(`SELECT user_id FROM wallets WHERE id = $1`, [tx.wallet_id]);
          userId = walletRes.rows[0]?.user_id || null;
        }
        emailPayload = {
          userId,
          success: newStatus === 'completed',
          amount: tx.amount,
          currency: tx.currency,
          reference: reference || transactionId,
          txId: tx.id,
          destination: tx.metadata?.address || tx.metadata?.account_number || null,
          destinationLabel: txType === 'wallet_transactions' ? 'crypto address' : 'bank account',
          network: tx.metadata?.network || null,
        };
      });

      if (emailPayload?.userId) {
        try {
          const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [emailPayload.userId]
          );
          if (userRes.rows.length > 0) {
            sendWithdrawalEmails(emailPayload, userRes.rows[0]).catch((e) =>
              logger.error('[WEBHOOK] Obiex withdrawal email error:', e)
            );
          }
        } catch (emailErr) {
          logger.error('[WEBHOOK] Obiex withdrawal email notify error:', emailErr);
        }
      }
    } catch (err) {
      logger.error('[WEBHOOK] updateObiexWithdrawal error:', err);
      throw err;
    }
  }

  return { creditUserWalletByObiex, updateObiexWithdrawal, findWalletByAddress };
}

const obiexWebhookService = createObiexWebhookService();

export const creditUserWalletByObiex = obiexWebhookService.creditUserWalletByObiex;
export const updateObiexWithdrawal = obiexWebhookService.updateObiexWithdrawal;
