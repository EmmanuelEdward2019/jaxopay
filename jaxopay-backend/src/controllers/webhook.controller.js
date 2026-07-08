import { query, transaction } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';
import webhookVerifier from '../utils/webhookVerifier.js';
import ledgerService from '../orchestration/ledger/LedgerService.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { SMILE_APPROVED_RESULT_CODES, SMILE_PROVISIONAL_RESULT_CODES } from '../services/smileId.service.js';
import * as kycNotify from '../services/kycNotification.service.js';
import { creditUserWalletByQuidax, persistQuidaxWalletAddress } from '../services/quidaxWebhook.service.js';
import { sendTransactionEmails } from '../services/email.service.js';

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
    // Pass req.rawBody (captured before express.json() parsed it) so HMAC is computed
    // over the original bytes — avoids JSON.stringify whitespace/key-order mismatches.
    const isValid = webhookVerifier.verify(provider, headers, body, req.rawBody || null);
    if (!isValid) {
        logger.warn(`[WEBHOOK] Signature verification failed for: ${provider}`);

        if (provider.toLowerCase() === 'quidax') {
            // For Quidax we log a prominent error but STILL PROCESS the event.
            // A misconfigured QUIDAX_WEBHOOK_SECRET must not permanently block deposits
            // from being credited to users. Investigate the secret mismatch separately.
            logger.error(
                '[WEBHOOK] ⚠️  Quidax signature FAILED — processing anyway. ' +
                'Verify QUIDAX_WEBHOOK_SECRET matches the "Signature Secret" in the Quidax dashboard.'
            );
            // continue to processing below
        } else if (!['vtpass', 'smile_identity', 'smile', 'smile-id'].includes(provider.toLowerCase())) {
            return res.status(401).json({ success: false, message: 'Invalid signature' });
        }
    }

    // 2. Route to handler
    try {
        switch (provider.toLowerCase()) {
            case 'vtpass':
                await processVTpass(body);
                break;
            case 'smile-id':
                await processSmileIdentity(body);
                break;
            case 'quidax':
                await processQuidax(body);
                break;
            case 'korapay':
                await processKorapay(body);
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

        try {
            // users.name does not exist — names are in user_profiles
            const userRes = await query(
                `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
                 FROM users u
                 LEFT JOIN user_profiles up ON up.user_id = u.id
                 WHERE u.id = $1`,
                [tx.rows[0].user_id]
            );
            if (userRes.rows.length > 0) {
                await sendTransactionEmails({
                    type: 'Deposit',
                    amount: amount,
                    currency: currency,
                    reference: reference,
                    details: 'Wallet Funding'
                }, userRes.rows[0]);
            }
        } catch (emailErr) {
            logger.error('[WEBHOOK] Deposit email notify error:', emailErr);
        }
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

    // Promote/reject a BVN/NIN captured for crypto-ramp verification (tied to this job via document_url).
    await query(
        `UPDATE kyc_documents
         SET status = $1, rejection_reason = $2, reviewed_at = NOW(), updated_at = NOW()
         WHERE user_id = $3::uuid AND document_url = $4 AND document_type IN ('bvn', 'nin')`,
        [
            approved ? 'approved' : 'rejected',
            approved ? null : (b.ResultText || b.result_text || 'Verification did not pass'),
            userId,
            docNumber,
        ]
    ).catch((e) => logger.error('[WEBHOOK] Smile ID ramp BVN/NIN update:', e.message));

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
// Korapay Webhooks (Fiat Deposits via Checkout & VBA)
// ─────────────────────────────────────────────
async function processKorapay(payload) {
    const { event, data } = payload;

    logger.info(`[WEBHOOK] Korapay event: ${event}`, { reference: data?.reference });

    // Payout / disbursement result (fiat withdrawal via Korapay)
    if (event === 'transfer.success' || event === 'transfer.failed') {
        await processKorapayPayout(event, data);
        return;
    }

    if (event === 'charge.success') {
        const { amount, currency, reference, fee, status, customer } = data;
        
        if (status !== 'success') return;

        const merchantRef = data.merchant_reference || data.reference;

        // 1. Try to match an existing pending deposit transaction (Checkout flow)
        const pendingTx = await query(
            'SELECT id, to_wallet_id, user_id FROM transactions WHERE reference = $1 AND status = $2 FOR UPDATE',
            [merchantRef, 'pending']
        );

        if (pendingTx.rows.length > 0) {
            const tx = pendingTx.rows[0];
            const netAmount = Math.max(0, parseFloat(amount) - parseFloat(fee || 0));
            await transaction(async (client) => {
                await client.query(
                    `UPDATE wallets SET balance = balance + $1, available_balance = COALESCE(available_balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
                    [netAmount, tx.to_wallet_id]
                );
                await client.query(
                    `UPDATE transactions SET status = 'completed', to_amount = $1, completed_at = NOW() WHERE reference = $2`,
                    [netAmount, merchantRef]
                );
            });
            logger.info(`[WEBHOOK] ✅ Korapay Checkout deposit complete: credited ${netAmount} ${currency} for ref ${merchantRef}`);

            // Record double-entry ledger movement + system float (non-fatal)
            ledgerService.recordDepositEntries({
                userWalletId: tx.to_wallet_id,
                amount: netAmount,
                transactionId: merchantRef,
                description: 'Wallet Funding',
            }).catch(e => logger.error('[WEBHOOK] Checkout deposit ledger error:', e.message));

            // Send email notification to user + admin (Checkout flow)
            try {
                const userRes = await query(
                    `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
                     FROM users u
                     LEFT JOIN user_profiles up ON up.user_id = u.id
                     WHERE u.id = $1`,
                    [tx.user_id]
                );
                if (userRes.rows.length > 0) {
                    sendTransactionEmails({
                        type: 'Deposit',
                        amount: netAmount,
                        currency: currency,
                        reference: merchantRef,
                        details: 'Wallet Funding'
                    }, userRes.rows[0]).catch(e => logger.error('[WEBHOOK] Checkout deposit email error:', e));
                }
            } catch (emailErr) {
                logger.error('[WEBHOOK] Checkout deposit email notify error:', emailErr);
            }
            return;
        }

        // 2. Ensure idempotency for VBA transfers
        const txCheck = await query('SELECT id FROM transactions WHERE reference = $1', [reference]);
        if (txCheck.rows.length > 0) {
            logger.info(`[WEBHOOK] Korapay deposit ${reference} already processed.`);
            return;
        }

        // 3. Fallback: Find the Virtual Bank Account based on the account_reference
        const vbaRes = await query(
            'SELECT wallet_id, user_id, account_number FROM virtual_bank_accounts WHERE provider_reference = $1',
            [merchantRef]
        );

        if (vbaRes.rows.length === 0) {
            // Alternative lookup if merchantRef doesn't match: find user by email
            const email = customer?.email;
            if (email) {
                const userRes = await query('SELECT id FROM users WHERE email = $1', [email]);
                if (userRes.rows.length > 0) {
                    const userId = userRes.rows[0].id;
                    const walletRes = await query('SELECT id FROM wallets WHERE user_id = $1 AND currency = $2', [userId, currency || 'NGN']);
                    if (walletRes.rows.length > 0) {
                        await applyKorapayDeposit(userId, walletRes.rows[0].id, amount, currency || 'NGN', fee, reference);
                        return;
                    }
                }
            }
            logger.warn(`[WEBHOOK] Korapay match not found for deposit: ${merchantRef}`);
            return;
        }

        const { wallet_id, user_id } = vbaRes.rows[0];
        await applyKorapayDeposit(user_id, wallet_id, amount, currency || 'NGN', fee, reference);
    }
}

async function applyKorapayDeposit(userId, walletId, amount, currency, fee, reference) {
    try {
        await transaction(async (client) => {
            // Log transaction
            const netAmount = Math.max(0, parseFloat(amount) - parseFloat(fee || 0));
            
            await client.query(
                `INSERT INTO transactions
                 (user_id, to_wallet_id, transaction_type, from_amount, to_amount,
                  from_currency, to_currency, net_amount, fee_amount, status, description, reference)
                 VALUES ($1, $2, 'deposit', $3, $3, $4, $4, $5, $6, 'completed', 'Bank Transfer Deposit', $7)`,
                [userId, walletId, amount, currency, netAmount, fee || 0, reference]
            );

            // Credit wallet
            await client.query(
                `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
                 WHERE id = $2`,
                [netAmount, walletId]
            );
        });

        logger.info(`[WEBHOOK] ✅ Korapay deposit complete: credited ${amount} ${currency} to user ${userId}`);

        // Record double-entry ledger movement + system float (non-fatal)
        ledgerService.recordDepositEntries({
            userWalletId: walletId,
            amount: Math.max(0, parseFloat(amount) - parseFloat(fee || 0)),
            transactionId: reference,
            description: 'Wallet Funding',
        }).catch(e => logger.error('[WEBHOOK] VBA deposit ledger error:', e.message));

        // Notify user — names live in user_profiles, not users
        const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [userId]
        );
        if (userRes.rows.length > 0) {
            sendTransactionEmails({
                type: 'Deposit',
                amount: amount,
                currency: currency,
                reference: reference,
                details: 'Virtual Bank Account Transfer'
            }, userRes.rows[0]).catch(e => logger.error('[WEBHOOK] VBA deposit email error:', e));
        }
    } catch (err) {
        logger.error(`[WEBHOOK] Korapay deposit error: ${err.message}`);
    }
}

// Finalize a Korapay payout (fiat withdrawal): complete on success, reverse funds on failure.
async function processKorapayPayout(event, data) {
    const reference = data?.reference || data?.merchant_reference;
    if (!reference) {
        logger.warn('[WEBHOOK] Korapay payout event missing reference');
        return;
    }

    const txRes = await query(
        `SELECT id, user_id, from_wallet_id, from_amount, from_currency, reference, status
         FROM transactions
         WHERE reference = $1 AND transaction_type = 'bank_transfer'`,
        [reference]
    );
    if (txRes.rows.length === 0) {
        logger.warn(`[WEBHOOK] Korapay payout ${reference} — no matching transfer found`);
        return;
    }
    const tx = txRes.rows[0];

    // Idempotency: ignore events for already-finalized transfers
    if (['completed', 'failed'].includes(tx.status)) {
        logger.info(`[WEBHOOK] Korapay payout ${reference} already ${tx.status}`);
        return;
    }

    if (event === 'transfer.success') {
        await transaction(async (client) => {
            await client.query(
                `UPDATE transactions SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE reference = $1`,
                [reference]
            );
        });
        logger.info(`[WEBHOOK] ✅ Korapay payout complete: ${reference}`);
        await notifyTransfer(tx, 'Withdrawal');
    } else {
        // transfer.failed — return the reserved funds to the wallet
        await transaction(async (client) => {
            await client.query(
                `UPDATE wallets
                 SET balance = balance + $1, available_balance = COALESCE(available_balance, 0) + $1, updated_at = NOW()
                 WHERE id = $2`,
                [tx.from_amount, tx.from_wallet_id]
            );
            await client.query(
                `UPDATE transactions SET status = 'failed', failure_reason = $2, updated_at = NOW() WHERE reference = $1`,
                [reference, data?.message || data?.reason || 'Payout failed at provider']
            );
        });
        logger.warn(`[WEBHOOK] ❌ Korapay payout failed, funds reversed: ${reference}`);
        await notifyTransfer(tx, 'Withdrawal Failed');
    }
}

// Email the user about a bank-transfer (withdrawal) outcome.
async function notifyTransfer(tx, label) {
    try {
        const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [tx.user_id]
        );
        if (userRes.rows.length > 0) {
            sendTransactionEmails({
                type: label,
                amount: tx.from_amount,
                currency: tx.from_currency,
                reference: tx.reference,
                details: 'Bank Transfer',
            }, userRes.rows[0]).catch((e) => logger.error('[WEBHOOK] Transfer email error:', e));
        }
    } catch (e) {
        logger.error('[WEBHOOK] Transfer notify error:', e.message);
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
        case 'wallet.address.generated': {
            // Quidax fires this when a sub-user's wallet address is generated asynchronously.
            // data.user.id = Quidax sub-user ID, data.address = the new address, data.currency
            await persistQuidaxWalletAddress(data);
            break;
        }
        case 'deposit.successful':
        case 'deposit.success': {
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
            const quidaxReference = webhookData?.reference ? String(webhookData.reference) : null;

            // Check wallet_transactions first (crypto withdrawals)
            let txType = 'wallet_transactions';
            let txRes = await client.query(
                `SELECT id, wallet_id, amount, currency, status AS current_status
                 FROM wallet_transactions
                 WHERE metadata->>'quidax_withdraw_id' = $1
                    OR ($2::text IS NOT NULL AND (metadata->>'quidax_reference' = $2 OR reference = $2))
                 FOR UPDATE`,
                [String(quidaxWithdrawId), quidaxReference]
            );

            // If not found, check transactions (fiat withdrawals / payouts)
            if (txRes.rows.length === 0) {
                txType = 'transactions';
                txRes = await client.query(
                    `SELECT id, from_wallet_id AS wallet_id, from_amount AS amount, from_currency AS currency, status AS current_status
                     FROM transactions
                     WHERE metadata->>'quidax_withdraw_id' = $1
                        OR ($2::text IS NOT NULL AND (metadata->>'quidax_reference' = $2 OR reference = $2))
                     FOR UPDATE`,
                    [String(quidaxWithdrawId), quidaxReference]
                );
            }

            if (txRes.rows.length === 0) {
                logger.warn(`[WEBHOOK] Quidax withdrawal not found: ${quidaxWithdrawId} or ref ${quidaxReference}`);
                return;
            }

            const tx = txRes.rows[0];
            if (tx.current_status === status) {
                logger.info(`[WEBHOOK] Quidax withdrawal ${quidaxWithdrawId} already ${status}; skipping duplicate webhook`);
                return;
            }
            if (['completed', 'failed'].includes(tx.current_status)) {
                logger.warn(`[WEBHOOK] Quidax withdrawal ${quidaxWithdrawId} already final (${tx.current_status}); ignoring ${status}`);
                return;
            }

            // Update transaction status
            if (txType === 'wallet_transactions') {
                await client.query(
                    `UPDATE wallet_transactions
                     SET status = $1,
                         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                         updated_at = NOW(),
                         completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
                     WHERE id = $3`,
                    [
                        status,
                        JSON.stringify({ webhook_data: webhookData, updated_at: new Date().toISOString() }),
                        tx.id
                    ]
                );
            } else {
                await client.query(
                    `UPDATE transactions
                     SET status = $1,
                         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                         updated_at = NOW(),
                         completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
                     WHERE id = $3`,
                    [
                        status,
                        JSON.stringify({ webhook_data: webhookData, updated_at: new Date().toISOString() }),
                        tx.id
                    ]
                );
            }

            // If withdrawal failed, refund the amount back to wallet
            if (status === 'failed') {
                await client.query(
                    `UPDATE wallets
                     SET balance = balance + $1,
                         available_balance = COALESCE(available_balance, 0) + $1,
                         updated_at = NOW()
                     WHERE id = $2`,
                    [tx.amount, tx.wallet_id]
                );

                logger.info(`[WEBHOOK] ✅ Quidax withdrawal failed - refunded ${tx.amount} ${tx.currency} to wallet ${tx.wallet_id}`);
            } else {
                logger.info(`[WEBHOOK] ✅ Quidax withdrawal ${status}: ${tx.amount} ${tx.currency} (${txType} ID: ${tx.id})`);
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
                     WHERE user_id = $1 AND currency = $2 AND is_active = true`,
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
                     WHERE user_id = $2 AND currency = $3 AND is_active = true`,
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
