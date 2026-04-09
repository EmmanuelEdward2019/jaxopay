import { query, transaction } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';
import webhookVerifier from '../utils/webhookVerifier.js';
import ledgerService from '../orchestration/ledger/LedgerService.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { SMILE_APPROVED_RESULT_CODES, SMILE_PROVISIONAL_RESULT_CODES } from '../services/smileId.service.js';
import * as kycNotify from '../services/kycNotification.service.js';

/**
 * Unified webhook handler for all providers
 * POST /webhooks/:provider
 */
export const handleWebhook = catchAsync(async (req, res) => {
    const { provider } = req.params;
    const body = req.body;
    const headers = req.headers;

    logger.info(`[WEBHOOK] Received from ${provider}`, {
        event: body.event || body.action || body.type || body.event_type || 'unknown'
    });

    // 1. Verify signature
    const isValid = webhookVerifier.verify(provider, headers, body);
    if (!isValid) {
        logger.warn(`[WEBHOOK] Invalid/missing signature for: ${provider}`);
        // For unknown providers, still return 200 to stop retries but don't process
        if (!['korapay', 'vtpass', 'graph', 'smile_identity', 'smile', 'smile-id'].includes(provider.toLowerCase())) {
            return res.status(401).json({ success: false, message: 'Invalid signature' });
        }
    }

    // 2. Route to handler
    try {
        switch (provider.toLowerCase()) {
            case 'korapay':
                await processKorapay(body, headers);
                break;
            case 'vtpass':
                await processVTpass(body);
                break;
            case 'graph':
            case 'graph_finance':
                await processGraph(body);
                break;
            case 'flutterwave':
                await processFlutterwave(body);
                break;
            case 'paystack':
                await processPaystack(body);
                break;
            case 'smile-id':
                await processSmileIdentity(body);
                break;
            case 'quidax':
                await processQuidax(body);
                break;
            default:
                logger.info(`[WEBHOOK] No handler for ${provider}, acknowledged.`);
        }
    } catch (err) {
        logger.error(`[WEBHOOK] Error processing ${provider}:`, err);
        return res.status(202).json({ success: false, message: 'Processed with errors' });
    }

    res.status(200).json({ success: true, message: 'Webhook received' });
});

// ─────────────────────────────────────────────
// Korapay
// ─────────────────────────────────────────────
async function processKorapay(payload, headers) {
    // Verify Korapay HMAC signature
    const korapaySecret = process.env.KORAPAY_SECRET_KEY;
    if (korapaySecret && headers['x-korapay-signature']) {
        const hash = crypto.createHmac('sha256', korapaySecret)
            .update(JSON.stringify(payload))
            .digest('hex');
        if (hash !== headers['x-korapay-signature']) {
            logger.warn('[WEBHOOK] Korapay signature mismatch');
            return;
        }
    }

    const event = payload.event;
    const data = payload.data;

    switch (event) {
        case 'charge.success':
        case 'charge.failed': {
            // Incoming payment (e.g. user funding wallet via Korapay checkout)
            const status = event === 'charge.success' ? 'completed' : 'failed';
            await updateTransactionStatus(data.reference, status, data);

            if (status === 'completed' && data.amount) {
                // Credit the user's wallet
                await creditUserWallet(data.reference, data.amount, data.currency);
            }
            break;
        }
        case 'transfer.success':
        case 'transfer.failed': {
            // Outgoing payout (e.g. user sending to beneficiary bank)
            const payoutStatus = event === 'transfer.success' ? 'completed' : 'failed';
            await query(
                'UPDATE payments SET status = $1, updated_at = NOW() WHERE reference = $2',
                [payoutStatus, data.reference]
            );

            if (payoutStatus === 'failed') {
                // Refund user wallet on failed payout
                await refundFailedPayment(data.reference);
            }
            logger.info(`[WEBHOOK] Korapay payout ${data.reference} → ${payoutStatus}`);
            break;
        }
        case 'virtual_bank_account_transfer.success': {
            // Someone sent money TO a user's VBA (Virtual Bank Account)
            // Find VBA by account reference, credit the linked wallet
            const vbaRef = data.virtual_bank_account?.account_reference || data.account_reference;
            const amount = data.amount;
            const currency = data.currency || 'NGN';

            logger.info(`[WEBHOOK] VBA transfer received: ref=${vbaRef}, amount=${amount} ${currency}`);

            if (vbaRef && amount) {
                try {
                    const vba = await query(
                        'SELECT user_id, wallet_id FROM virtual_bank_accounts WHERE provider_reference = $1 AND is_active = true',
                        [vbaRef]
                    );
                    if (vba.rows.length > 0) {
                        const { user_id, wallet_id } = vba.rows[0];
                        await query(
                            'UPDATE wallets SET balance = balance + $1, available_balance = COALESCE(available_balance, 0) + $1, updated_at = NOW() WHERE id = $2',
                            [amount, wallet_id]
                        );
                        // Record transaction
                        await query(
                            `INSERT INTO transactions
                               (user_id, to_wallet_id, transaction_type, from_amount, to_amount,
                                from_currency, to_currency, net_amount, fee_amount, status, description, reference)
                             VALUES ($1, $2, 'deposit', $3, $3, $4, $4, $3, 0, 'completed', 'VBA bank transfer received', $5)`,
                            [user_id, wallet_id, amount, currency, `VBA-${data.reference || Date.now()}`]
                        );
                        logger.info(`[WEBHOOK] ✅ Wallet ${wallet_id} credited ${amount} ${currency} via VBA`);
                    } else {
                        logger.warn(`[WEBHOOK] VBA not found for ref: ${vbaRef}`);
                    }
                } catch (vbaErr) {
                    logger.error('[WEBHOOK] VBA credit error:', vbaErr);
                }
            }
            break;
        }
        default:
            logger.info(`[WEBHOOK] Korapay unhandled event: ${event}`);
    }
}

// ─────────────────────────────────────────────
// VTpass
// ─────────────────────────────────────────────
async function processVTpass(payload) {
    const { requestId, status, content } = payload;
    if (!requestId) return;

    const vtStatus = status === 'delivered' ? 'completed' :
        status === 'failed' ? 'failed' : 'processing';

    await query(
        'UPDATE bill_payments SET status = $1, updated_at = NOW() WHERE reference = $2',
        [vtStatus, requestId]
    );

    if (vtStatus === 'failed') {
        // Refund wallet for failed bill payment
        const bp = await query('SELECT user_id, amount, fee, currency FROM bill_payments WHERE reference = $1', [requestId]);
        if (bp.rows.length > 0) {
            const { user_id, amount, fee, currency } = bp.rows[0];
            const refundAmount = parseFloat(amount) + parseFloat(fee);
            await query(
                `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
                 WHERE user_id = $2 AND currency = $3`,
                [refundAmount, user_id, currency]
            );
            // transaction_status enum does not support 'refunded'; use 'reversed'
            await query('UPDATE bill_payments SET status = \'reversed\' WHERE reference = $1', [requestId]);
            logger.info(`[WEBHOOK] VTpass failed bill reversed: ${requestId} → ₦${refundAmount}`);
        }
    }

    logger.info(`[WEBHOOK] VTpass ${requestId} → ${vtStatus}`);
}

// ─────────────────────────────────────────────
// Graph Finance
// ─────────────────────────────────────────────
async function processGraph(payload) {
    const { type, data } = payload;

    switch (type) {
        case 'card.transaction': {
            // Record card spend
            const card = await query('SELECT id FROM virtual_cards WHERE provider_card_id = $1', [data.card_id]);
            if (card.rows.length > 0) {
                await query(
                    `INSERT INTO card_transactions
                       (card_id, transaction_type, amount, currency, merchant_name, merchant_category, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT DO NOTHING`,
                    [card.rows[0].id, data.type || 'purchase', data.amount,
                    data.currency || 'USD', data.merchant_name || '',
                    data.merchant_category || '', data.status || 'completed']
                );
                // Deduct from card balance
                await query(
                    'UPDATE virtual_cards SET balance = GREATEST(0, balance - $1), updated_at = NOW() WHERE id = $2',
                    [data.amount, card.rows[0].id]
                );
                logger.info(`[WEBHOOK] Graph card spend: ${data.amount} USD on ${data.merchant_name}`);
            }
            break;
        }
        case 'card.frozen':
        case 'card.unfrozen': {
            const newStatus = type === 'card.frozen' ? 'frozen' : 'active';
            await query(
                'UPDATE virtual_cards SET status = $1, updated_at = NOW() WHERE provider_card_id = $2',
                [newStatus, data.card_id]
            );
            break;
        }
        default:
            logger.info(`[WEBHOOK] Graph unhandled event: ${type}`);
    }
}

// ─────────────────────────────────────────────
// Legacy / other providers
// ─────────────────────────────────────────────
async function processFlutterwave(payload) {
    const { event, data } = payload;
    if (event === 'transfer.completed') {
        const status = data.status === 'SUCCESSFUL' ? 'completed' : 'failed';
        await updateTransactionStatus(data.reference, status, data);
    }
}

async function processPaystack(payload) {
    const { event, data } = payload;
    if (event === 'charge.success') {
        await updateTransactionStatus(data.reference, 'completed', data);
        await creditUserWallet(data.reference, data.amount / 100, data.currency);
    }
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────
async function updateTransactionStatus(reference, status, metadata) {
    await transaction(async (client) => {
        const txRes = await client.query(
            'SELECT * FROM transactions WHERE reference = $1 OR external_reference = $1 FOR UPDATE',
            [reference]
        );
        if (txRes.rows.length === 0) {
            logger.warn(`[WEBHOOK] Transaction not found: ${reference}`);
            return;
        }
        const tx = txRes.rows[0];
        if (tx.status === status) return;

        await client.query(
            'UPDATE transactions SET status = $1, metadata = $2, updated_at = NOW(), completed_at = $3 WHERE id = $4',
            [status, JSON.stringify({ ...(tx.metadata || {}), ...metadata }), status === 'completed' ? new Date() : null, tx.id]
        );
    });
}

async function creditUserWallet(reference, amount, currency) {
    try {
        // Look up a deposit transaction by reference to find the user
        const tx = await query('SELECT user_id FROM transactions WHERE reference = $1 LIMIT 1', [reference]);
        if (tx.rows.length === 0) return;

        await query(
            `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
             WHERE user_id = $2 AND currency = $3`,
            [amount, tx.rows[0].user_id, (currency || 'USD').toUpperCase()]
        );
        logger.info(`[WEBHOOK] Wallet credited: ${amount} ${currency} for ref ${reference}`);
    } catch (err) {
        logger.error('[WEBHOOK] creditUserWallet error:', err);
    }
}

/**
 * Smile ID — Basic KYC / job callbacks (signature verified in webhookVerifier).
 */
async function processSmileIdentity(body) {
    const b = body?.Information || body?.information || body;
    const partnerParams = b.PartnerParams || b.partner_params || {};
    const jobId = partnerParams.job_id;
    const userId = partnerParams.user_id;
    const rawCode = b.ResultCode ?? b.result_code;
    if (rawCode === undefined || rawCode === null || rawCode === '') {
        logger.warn('[WEBHOOK] Smile ID: missing result code');
        return;
    }
    const resultCode = String(rawCode).padStart(4, '0');

    if (!jobId || !userId) {
        logger.warn('[WEBHOOK] Smile ID: missing job_id or user_id');
        return;
    }

    if (SMILE_PROVISIONAL_RESULT_CODES.has(resultCode)) {
        logger.info(`[WEBHOOK] Smile ID provisional/in-review result ${resultCode} job ${jobId} — no user status change`);
        return;
    }

    const approved = SMILE_APPROVED_RESULT_CODES.has(resultCode);

    const docNumber = `SMILE:${jobId}`;

    const docUpdate = await query(
        `UPDATE kyc_documents
         SET status = $1,
             rejection_reason = $2,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $3::uuid AND document_number = $4
           AND document_type IN ('smile_basic_kyc', 'smile_biometric_kyc')
         RETURNING document_type`,
        [
            approved ? 'approved' : 'rejected',
            approved ? null : (b.ResultText || b.result_text || 'Verification did not pass'),
            userId,
            docNumber,
        ]
    );

    if (docUpdate.rowCount === 0) {
        logger.warn(`[WEBHOOK] Smile ID: no kyc_documents row for job ${jobId} user ${userId}`);
    }

    const smileResultText = b.ResultText || b.result_text || '';

    if (approved) {
        const tierRank = { tier_0: 0, tier_1: 1, tier_2: 2 };
        const userRow = await query(`SELECT kyc_tier FROM users WHERE id = $1::uuid`, [userId]);
        const docTierRow = await query(
            `SELECT tier::text AS tier FROM kyc_documents WHERE document_number = $1 AND user_id = $2::uuid`,
            [docNumber, userId]
        );
        const current = tierRank[userRow.rows[0]?.kyc_tier] ?? 0;
        const fromDoc = tierRank[docTierRow.rows[0]?.tier] ?? 1;
        const nextIdx = Math.min(2, Math.max(current, fromDoc));
        const nextTier = ['tier_0', 'tier_1', 'tier_2'][nextIdx];
        await query(
            `UPDATE users SET kyc_status = 'approved', kyc_tier = $1::kyc_tier, updated_at = NOW() WHERE id = $2::uuid`,
            [nextTier, userId]
        );
    } else {
        await query(`UPDATE users SET kyc_status = 'rejected', updated_at = NOW() WHERE id = $1::uuid`, [userId]);
    }

    if (docUpdate.rowCount > 0) {
        const docType = docUpdate.rows[0]?.document_type || 'smile_biometric_kyc';
        kycNotify
            .notifySmileKycWebhookResult({
                userId,
                jobId,
                documentType: docType,
                approved,
                resultText: smileResultText,
            })
            .catch((err) => logger.error('[WEBHOOK] KYC email notify:', err?.message || err));
    }

    logger.info(`[WEBHOOK] Smile ID job ${jobId} user ${userId} → ${resultCode} (${approved ? 'approved' : 'rejected'})`);
}

async function refundFailedPayment(reference) {
    try {
        const payment = await query('SELECT user_id, source_amount, fee, source_currency FROM payments WHERE reference = $1', [reference]);
        if (payment.rows.length === 0) return;

        const { user_id, source_amount, fee, source_currency } = payment.rows[0];
        const refund = parseFloat(source_amount) + parseFloat(fee || 0);

        await query(
            `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
             WHERE user_id = $2 AND currency = $3`,
            [refund, user_id, source_currency]
        );
        logger.info(`[WEBHOOK] Refunded failed payment ${reference}: ${refund} ${source_currency}`);
    } catch (err) {
        logger.error('[WEBHOOK] refundFailedPayment error:', err);
    }
}

// ─────────────────────────────────────────────
// Quidax Webhooks
// ─────────────────────────────────────────────
async function processQuidax(payload) {
    const event = payload.event;
    const data = payload.data;

    logger.info(`[WEBHOOK] Quidax event: ${event}`, { id: data?.id });

    switch (event) {
        case 'deposit.successful':
        case 'deposit.success': {
            // Find wallet by address and tag
            const address = data.address;
            const currency = data.currency?.toUpperCase();
            const tag = data.address_info?.tag || data.tag || '';

            // Map and credit
            await creditUserWalletByQuidax(data);
            break;
        }
        case 'withdraw.successful':
        case 'withdraw.success': {
            await updateQuidaxWithdrawal(data.id, 'completed', data);
            break;
        }
        case 'withdraw.failed':
        case 'withdraw.rejected': {
            await updateQuidaxWithdrawal(data.id, 'failed', data);
            break;
        }
        // ── Instant Swap lifecycle ──────────────────────────────────────────
        case 'swap_transaction.complete':
        case 'swap_transaction.completed': {
            await updateQuidaxSwap(data, 'completed');
            break;
        }
        case 'swap_transaction.reversed': {
            await updateQuidaxSwap(data, 'reversed');
            break;
        }
        case 'swap_transaction.failed': {
            await updateQuidaxSwap(data, 'failed');
            break;
        }
        default:
            logger.info(`[WEBHOOK] Quidax unhandled event: ${event}`);
    }
}

/**
 * Update Quidax withdrawal status
 * Matches by quidax_withdraw_id in metadata
 */
async function updateQuidaxWithdrawal(quidaxWithdrawId, status, webhookData) {
    try {
        await transaction(async (client) => {
            // Find transaction by Quidax withdrawal ID in metadata
            const txRes = await client.query(
                `SELECT id, wallet_id, amount, currency
                 FROM wallet_transactions
                 WHERE metadata->>'quidax_withdraw_id' = $1
                 FOR UPDATE`,
                [String(quidaxWithdrawId)]
            );

            if (txRes.rows.length === 0) {
                logger.warn(`[WEBHOOK] Quidax withdrawal not found: ${quidaxWithdrawId}`);
                return;
            }

            const tx = txRes.rows[0];

            // Update transaction status
            await client.query(
                `UPDATE wallet_transactions
                 SET status = $1,
                     metadata = metadata || $2::jsonb,
                     updated_at = NOW(),
                     completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
                 WHERE id = $3`,
                [
                    status,
                    JSON.stringify({ webhook_data: webhookData, updated_at: new Date().toISOString() }),
                    tx.id
                ]
            );

            // If withdrawal failed, refund the amount back to wallet
            if (status === 'failed') {
                await client.query(
                    'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
                    [tx.amount, tx.wallet_id]
                );

                logger.info(`[WEBHOOK] ✅ Quidax withdrawal failed - refunded ${tx.amount} ${tx.currency} to wallet ${tx.wallet_id}`);
            } else {
                logger.info(`[WEBHOOK] ✅ Quidax withdrawal ${status}: ${tx.amount} ${tx.currency} (TX: ${tx.id})`);
            }
        });
    } catch (err) {
        logger.error('[WEBHOOK] updateQuidaxWithdrawal error:', err);
        throw err;
    }
}

/**
 * Handle swap_transaction.complete / .reversed / .failed webhooks from Quidax.
 *
 * Webhook payload (from Quidax):
 *   { id, from_currency, to_currency, from_amount, received_amount, status, ... }
 *
 * For completed swaps: update local transaction status and credit the to_currency wallet.
 * For reversed/failed: refund the from_currency wallet.
 */
async function updateQuidaxSwap(data, status) {
    const quidaxSwapId  = data?.id;
    const fromCurrency  = (data?.from_currency || '').toUpperCase();
    const toCurrency    = (data?.to_currency   || '').toUpperCase();
    const fromAmount    = parseFloat(data?.from_amount    || 0);
    const receivedAmt   = parseFloat(data?.received_amount || data?.to_amount || 0);

    if (!quidaxSwapId) {
        logger.warn('[WEBHOOK] Quidax swap: missing id');
        return;
    }

    logger.info(`[WEBHOOK] Quidax swap ${quidaxSwapId}: ${fromCurrency}->${toCurrency} status=${status}`);

    try {
        await transaction(async (client) => {
            // Find local transaction by Quidax swap ID
            const txRes = await client.query(
                `SELECT t.id, t.user_id, t.from_wallet_id, t.to_wallet_id, t.status
                 FROM transactions t
                 WHERE t.metadata->>'quidax_swap_id' = $1
                    OR t.external_reference = $1
                 FOR UPDATE`,
                [String(quidaxSwapId)]
            );

            if (txRes.rows.length === 0) {
                // No matching transaction — still log but don't crash
                logger.warn(`[WEBHOOK] Quidax swap: no local transaction for swap ${quidaxSwapId}`);
                return;
            }

            const tx = txRes.rows[0];
            if (tx.status === status) return; // Already up to date (idempotent)

            // Update the transaction record
            await client.query(
                `UPDATE transactions
                 SET status = $1,
                     metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                     updated_at = NOW(),
                     completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
                 WHERE id = $3`,
                [
                    status,
                    JSON.stringify({ quidax_swap_status: status, webhook_at: new Date().toISOString() }),
                    tx.id,
                ]
            );

            if (status === 'completed' && receivedAmt > 0 && toCurrency) {
                // Ensure the to_currency wallet exists and credit it
                let toWallet = await client.query(
                    `SELECT id FROM wallets
                     WHERE user_id = $1 AND currency = $2 AND deleted_at IS NULL`,
                    [tx.user_id, toCurrency]
                );
                if (toWallet.rows.length === 0) {
                    const wType = ['NGN','USD','EUR','GBP','GHS','KES','ZAR'].includes(toCurrency) ? 'fiat' : 'crypto';
                    toWallet = await client.query(
                        `INSERT INTO wallets (user_id, currency, wallet_type, balance)
                         VALUES ($1, $2, $3, 0) RETURNING id`,
                        [tx.user_id, toCurrency, wType]
                    );
                }
                await client.query(
                    'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
                    [receivedAmt, toWallet.rows[0].id]
                );
                logger.info(`[WEBHOOK] ✅ Swap complete: credited ${receivedAmt} ${toCurrency} to user ${tx.user_id}`);

            } else if ((status === 'reversed' || status === 'failed') && fromAmount > 0 && fromCurrency) {
                // Refund the from_currency amount
                await client.query(
                    `UPDATE wallets
                     SET balance = balance + $1, updated_at = NOW()
                     WHERE user_id = $2 AND currency = $3 AND deleted_at IS NULL`,
                    [fromAmount, tx.user_id, fromCurrency]
                );
                logger.info(`[WEBHOOK] ✅ Swap ${status}: refunded ${fromAmount} ${fromCurrency} to user ${tx.user_id}`);
            }
        });
    } catch (err) {
        logger.error('[WEBHOOK] updateQuidaxSwap error:', err);
        throw err;
    }
}

async function creditUserWalletByQuidax(data) {
    const { amount, currency, address, id: quidaxTxId } = data;
    const tag = data.address_info?.tag || data.tag || '';

    try {
        await transaction(async (client) => {
            // 1. Find wallet
            const walletRes = await client.query(
                `SELECT id, user_id FROM wallets 
                 WHERE (crypto_address = $1 OR crypto_address = $2) 
                   AND currency = $3 
                   AND wallet_type = 'crypto'`,
                [address, address.toLowerCase(), currency.toUpperCase()]
            );

            if (walletRes.rows.length === 0) {
                logger.warn(`[WEBHOOK] Quidax deposit: No wallet found for address ${address} (${currency})`);
                return;
            }

            const { id: walletId, user_id: userId } = walletRes.rows[0];

            // 2. Check for duplicate (idempotency)
            const txRes = await client.query(
                'SELECT id FROM wallet_transactions WHERE metadata->>\'quidax_tx_id\' = $1',
                [quidaxTxId]
            );
            if (txRes.rows.length > 0) {
                logger.info(`[WEBHOOK] Quidax deposit already processed: ${quidaxTxId}`);
                return;
            }

            // 3. Update balance
            await client.query(
                'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
                [amount, walletId]
            );

            // 4. Record transaction
            await client.query(
                `INSERT INTO wallet_transactions 
                 (wallet_id, transaction_type, amount, currency, status, description, metadata)
                 VALUES ($1, 'deposit', $2, $3, 'completed', $4, $5)`,
                [
                    walletId,
                    amount,
                    currency.toUpperCase(),
                    `Crypto deposit via Quidax (${quidaxTxId})`,
                    JSON.stringify({ quidax_tx_id: quidaxTxId, address, tag, source: 'quidax' })
                ]
            );

            logger.info(`[WEBHOOK] ✅ Quidax Credited: ${amount} ${currency} to wallet ${walletId}`);
        });
    } catch (err) {
        logger.error('[WEBHOOK] creditUserWalletByQuidax error:', err);
        throw err;
    }
}
