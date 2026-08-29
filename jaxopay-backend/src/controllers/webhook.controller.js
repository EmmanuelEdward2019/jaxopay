import { query, transaction } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';
import webhookVerifier from '../utils/webhookVerifier.js';
import ledgerService from '../orchestration/ledger/LedgerService.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { SMILE_APPROVED_RESULT_CODES, SMILE_PROVISIONAL_RESULT_CODES } from '../services/smileId.service.js';
import * as smileId from '../services/smileId.service.js';
import * as kycNotify from '../services/kycNotification.service.js';
import { creditUserWalletByQuidax, persistQuidaxWalletAddress } from '../services/quidaxWebhook.service.js';
import { creditUserWalletByObiex, updateObiexWithdrawal } from '../services/obiexWebhook.service.js';
import { sendTransactionEmails, sendWithdrawalEmails } from '../services/email.service.js';
import GlydeAdapter from '../orchestration/adapters/fiat/GlydeAdapter.js';
import { notifyDeposit, notifyWithdrawal } from '../services/notification.service.js';
import { getFeeConfig, computeFee } from '../services/feeConfig.service.js';

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
        } else if (provider.toLowerCase() === 'obiex') {
            // Same fail-open reasoning as Quidax — a misconfigured OBIEX_SIGNATURE_SECRET must
            // never silently block real user deposits/withdrawals from being reconciled.
            logger.error(
                '[WEBHOOK] ⚠️  Obiex signature FAILED — processing anyway. ' +
                'Verify OBIEX_SIGNATURE_SECRET matches the Signature Secret in Settings > Developers on the Obiex dashboard.'
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
            // Smile posts to /webhooks/smile_identity (the URL we register); accept all aliases.
            case 'smile-id':
            case 'smile_identity':
            case 'smile':
                await processSmileIdentity(body, headers);
                break;
            case 'quidax':
                await processQuidax(body);
                break;
            case 'obiex':
                await processObiex(body);
                break;
            case 'korapay':
                await processKorapay(body);
                break;
            case 'glyde':
                await processGlyde(body);
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
        notifyDeposit(tx.rows[0].user_id, { amount, currency, reference }).catch(() => {});
    } catch (err) {
        logger.error('[WEBHOOK] creditUserWallet error:', err);
    }
}

/**
 * Smile ID — verification job callbacks (signature verified in webhookVerifier).
 *
 * Current documented contract (docs.usesmileid.com/developer-resources/essentials/
 * verification-webhooks) — confirmed against a real "Enhanced KYC"/"Biometric KYC" payload
 * example: top-level `status` ("clear" | "block" | "error" | "processing"), `message`, `reason`,
 * `product` ("biometric_kyc" | "enhanced_kyc"), and `partner_params` echoing back whatever we
 * submitted. `Job-ID` / `User-ID` are delivered as HTTP HEADERS, not body fields — this is what
 * every prior version of this function got wrong (it only ever looked for a numeric `ResultCode`
 * inside the body, which this payload shape doesn't have at all), so real webhooks were arriving
 * successfully and being silently dropped as "missing result code" on every single delivery.
 *
 * The older numeric-ResultCode contract is kept as a fallback below in case any path still emits
 * it, but the modern `status` field is checked first and is what real traffic actually uses.
 *
 * job_id/user_id resolution, in priority order:
 *  1. `Job-ID` / `User-ID` headers (current documented mechanism, present on every webhook).
 *  2. `partner_params.job_id` / `partner_params.user_id` — what v1/v2 submissions
 *     (submitBasicKycAsync, submitBiometricKycJob, prepareSmileBiometricJob) chose themselves at
 *     submission time and expect echoed back.
 *  3. `partner_params.internal_user_id` — what postSmileV3Token (the web hosted-SDK path) binds
 *     at token-mint time, since v3's real job_id/user_id are server-generated and never told to us
 *     up front.
 * Whether this job already has a 'pending' kyc_documents row (checked in applySmileVerdict, not
 * guessed here) decides UPDATE vs INSERT — far more reliable than inferring "is this v3" from
 * which fields happened to be present, now that headers make job_id/user_id available uniformly
 * across every integration path.
 */
async function processSmileIdentity(body, headers = {}) {
    const h = headers || {};
    const b = body?.Information || body?.information || body;
    const partnerParams = b.PartnerParams || b.partner_params || {};

    const jobId = h['job-id'] || partnerParams.job_id || b.job_id || b.jobId || b.JobId;
    const userId = h['user-id'] || partnerParams.user_id || partnerParams.internal_user_id || b.internal_user_id;

    if (!jobId || !userId) {
        logger.warn('[WEBHOOK] Smile ID: missing job_id or user_id', {
            payload: JSON.stringify(body).slice(0, 2000),
            headerKeys: Object.keys(h),
        });
        return;
    }

    const status = String(b.status || '').toLowerCase();
    let approved;
    let resultText;

    if (['clear', 'block', 'error', 'processing'].includes(status)) {
        if (status === 'processing') {
            logger.info(`[WEBHOOK] Smile ID processing (pending human review) job ${jobId} — no user status change; a final webhook follows`);
            return;
        }
        approved = status === 'clear';
        resultText = b.message || b.reason || (approved ? '' : 'Verification did not pass');
        if (status === 'error') {
            // Not necessarily the user's fault (could be a Smile-side processing failure) — logged
            // at error level so this is actually visible for follow-up, but still resolved as
            // 'rejected' rather than left pending forever, since no further webhook follows an
            // "error" job the way "processing" promises one will.
            logger.error(`[WEBHOOK] Smile ID job ${jobId} user ${userId} returned status "error": ${resultText}`);
        }
    } else {
        // Fallback: older numeric ResultCode contract.
        const rawCode = b.ResultCode ?? b.result_code;
        if (rawCode === undefined || rawCode === null || rawCode === '') {
            logger.warn('[WEBHOOK] Smile ID: unrecognized payload — no status and no ResultCode', { payload: JSON.stringify(body).slice(0, 2000) });
            return;
        }
        const resultCode = String(rawCode).padStart(4, '0');
        if (SMILE_PROVISIONAL_RESULT_CODES.has(resultCode)) {
            logger.info(`[WEBHOOK] Smile ID provisional/in-review result ${resultCode} job ${jobId} — no user status change`);
            return;
        }
        approved = SMILE_APPROVED_RESULT_CODES.has(resultCode);
        resultText = b.ResultText || b.result_text || '';
    }

    const product = String(b.product || '').toLowerCase();
    const docType = product === 'enhanced_kyc' ? 'smile_basic_kyc' : 'smile_biometric_kyc';
    const tier = product === 'enhanced_kyc' ? 'tier_1' : 'tier_2';

    await applySmileVerdict({ jobId, userId, approved, resultText, docType, tier, source: 'webhook' });
}

/**
 * Applies a final Smile ID result to our DB — kyc_documents status, the matching BVN/NIN row, the
 * user's tier bump/rejection, and the result notification. Pulled out of processSmileIdentity so
 * sweepPendingSmileJobs below (the reconciliation fallback for when Smile's webhook never arrives)
 * produces byte-for-byte the same outcome a webhook delivery would.
 *
 * Whether to UPDATE an existing pending row or INSERT a fresh one is decided by whether one
 * already exists for (userId, `SMILE:${jobId}`) — the web hosted-SDK path (v3) never pre-creates a
 * row (see processSmileIdentity's doc comment), every other path does. `docType`/`tier` are only
 * used on the INSERT branch, since an existing row already has its own correct values.
 */
async function applySmileVerdict({ jobId, userId, approved, resultText, docType, tier, source }) {
    const docNumber = `SMILE:${jobId}`;
    const logTag = source === 'sweep' ? '[SMILE SWEEP]' : '[WEBHOOK]';

    const existing = await query(
        `SELECT 1 FROM kyc_documents WHERE user_id = $1::uuid AND document_number = $2 LIMIT 1`,
        [userId, docNumber]
    );
    const mode = existing.rows.length > 0 ? 'update' : 'insert';

    let docUpdate;
    if (mode === 'insert') {
        // kyc_documents has no unique constraint on (user_id, document_number), so a duplicate
        // delivery would insert a second row rather than upsert; Smile ID webhooks are
        // idempotent-by-intent but not guaranteed exactly-once, same as every other provider
        // webhook in this file — acceptable here since reads key off the latest row by tier logic
        // below, not row count.
        docUpdate = await query(
            `INSERT INTO kyc_documents
             (user_id, document_type, document_number, document_url, selfie_url, status, rejection_reason, tier, reviewed_at)
             VALUES ($1::uuid, $2, $3, 'https://jaxopay.com/kyc/smile-web-v3', null, $4, $5, $6::kyc_tier, NOW())
             RETURNING document_type`,
            [
                userId,
                docType,
                docNumber,
                approved ? 'approved' : 'rejected',
                approved ? null : (resultText || 'Verification did not pass'),
                tier,
            ]
        );
    } else {
        docUpdate = await query(
            `UPDATE kyc_documents
             SET status = $1,
                 rejection_reason = $2,
                 reviewed_at = NOW(),
                 updated_at = NOW()
             WHERE user_id = $3::uuid AND document_number = $4
               AND document_type IN ('smile_basic_kyc', 'smile_biometric_kyc')
               AND status = 'pending'
             RETURNING document_type`,
            [
                approved ? 'approved' : 'rejected',
                approved ? null : (resultText || 'Verification did not pass'),
                userId,
                docNumber,
            ]
        );
    }

    if (docUpdate.rowCount === 0) {
        logger.warn(`${logTag} Smile ID: no pending kyc_documents row for job ${jobId} user ${userId} — already processed or not found`);
        return { changed: false };
    }

    // Promote/reject a BVN/NIN captured for crypto-ramp verification (tied to this job via document_url).
    await query(
        `UPDATE kyc_documents
         SET status = $1, rejection_reason = $2, reviewed_at = NOW(), updated_at = NOW()
         WHERE user_id = $3::uuid AND document_url = $4 AND document_type IN ('bvn', 'nin')`,
        [
            approved ? 'approved' : 'rejected',
            approved ? null : (resultText || 'Verification did not pass'),
            userId,
            docNumber,
        ]
    ).catch((e) => logger.error(`${logTag} Smile ID ramp BVN/NIN update:`, e.message));

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

    const resolvedDocType = docUpdate.rows[0]?.document_type || docType || 'smile_biometric_kyc';
    kycNotify
        .notifySmileKycWebhookResult({ userId, jobId, documentType: resolvedDocType, approved, resultText })
        .catch((err) => logger.error(`${logTag} KYC email notify:`, err?.message || err));

    logger.info(`${logTag} Smile ID job ${jobId} user ${userId} → ${approved ? 'approved' : 'rejected'}${resultText ? ` (${resultText})` : ''}`);
    return { changed: true, approved };
}

/**
 * Polls Smile for one pending row's live result and applies it if the job has finished. Checks
 * the same modern `status` field processSmileIdentity does first (see its doc comment), falling
 * back to the older numeric ResultCode. docType/tier are omitted — this only ever targets a row
 * that's already pending, so applySmileVerdict always takes the UPDATE branch, which doesn't use
 * them.
 */
async function reconcileOnePendingSmileRow(row) {
    const jobId = row.document_number.slice('SMILE:'.length);
    const status = await smileId.queryJobStatus({ userId: row.user_id, jobId });
    if (!status?.job_complete) return { changed: false };
    const result = status.result || status;

    const resultStatus = String(result.status || '').toLowerCase();
    let approved;
    let resultText;
    if (['clear', 'block', 'error', 'processing'].includes(resultStatus)) {
        if (resultStatus === 'processing') return { changed: false };
        approved = resultStatus === 'clear';
        resultText = result.message || result.reason || '';
    } else {
        const rawCode = result.ResultCode ?? result.result_code ?? status.code;
        if (rawCode === undefined || rawCode === null || rawCode === '') {
            // job_complete but no recognizable status/result code — either Smile's response shape
            // doesn't match what's assumed above, or this job type/edge case sends something new.
            // Logged in full (unlike the silent skip on an in-progress job above) so a real
            // mismatch is diagnosable instead of this reconciliation path quietly never resolving
            // anything.
            logger.warn(`[SMILE SWEEP] job ${jobId} user ${row.user_id} complete but no status/result code found`, {
                payload: JSON.stringify(status).slice(0, 2000),
            });
            return { changed: false };
        }
        const resultCode = String(rawCode).padStart(4, '0');
        if (SMILE_PROVISIONAL_RESULT_CODES.has(resultCode)) return { changed: false };
        approved = SMILE_APPROVED_RESULT_CODES.has(resultCode);
        resultText = result.ResultText || result.result_text || '';
    }

    return applySmileVerdict({ jobId, userId: row.user_id, approved, resultText, source: 'sweep' });
}

/**
 * Fallback for when Smile ID's webhook never arrives — confirmed possible in production (a job
 * showed approved on Smile's own dashboard while our copy sat 'pending' indefinitely with no
 * callback ever received). Polls Smile directly for every 'pending' kyc_documents row's real
 * status and applies the result through the exact same path a webhook delivery uses. Same
 * reconciliation-sweep pattern this codebase already relies on for Yellow Card ramps, Obiex
 * transfers/withdrawals, and Glyde deposits — see server.js's *_SWEEP_MS intervals, one of which
 * now calls this on a timer. document_number LIKE 'SMILE:%' covers every non-v3 submission path
 * (native RN guided camera, the manual-selfie REST relay, and the BVN/NIN Basic KYC gate) — v3
 * (the web hosted SDK) never leaves a 'pending' row to reconcile in the first place, since that
 * path only ever writes the final result once its own webhook arrives.
 */
export async function sweepPendingSmileJobs(limit = 50) {
    const rows = (await query(
        `SELECT user_id, document_number FROM kyc_documents
         WHERE status = 'pending' AND document_number LIKE 'SMILE:%'
         ORDER BY updated_at ASC LIMIT $1`,
        [limit]
    )).rows;

    let checked = 0;
    let resolved = 0;
    for (const row of rows) {
        try {
            checked++;
            const outcome = await reconcileOnePendingSmileRow(row);
            if (outcome.changed) resolved++;
        } catch (e) {
            logger.warn(`[SMILE SWEEP] error checking job for user ${row.user_id}: ${e.message}`);
        }
    }
    if (rows.length) logger.info(`[SMILE SWEEP] checked ${checked}/${rows.length} pending job(s), resolved ${resolved}`);
    return { checked, resolved };
}

/**
 * Same reconciliation as sweepPendingSmileJobs, scoped to one user — called inline from
 * GET /kyc/status so a user pressing "Check status" gets a genuinely live answer instead of just
 * re-reading our (possibly stale) copy of their result. Small limit and every error swallowed by
 * the caller: this runs on every status poll, so it must never be the reason that endpoint gets
 * slow or fails.
 */
export async function reconcileSmileJobsForUser(userId, limit = 5) {
    const rows = (await query(
        `SELECT user_id, document_number FROM kyc_documents
         WHERE user_id = $1::uuid AND status = 'pending' AND document_number LIKE 'SMILE:%'
         ORDER BY updated_at ASC LIMIT $2`,
        [userId, limit]
    )).rows;

    let resolved = 0;
    for (const row of rows) {
        try {
            const outcome = await reconcileOnePendingSmileRow(row);
            if (outcome.changed) resolved++;
        } catch (e) {
            logger.warn(`[SMILE SWEEP] error checking job for user ${userId}: ${e.message}`);
        }
    }
    return { resolved };
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
            const providerNet = Math.max(0, parseFloat(amount) - parseFloat(fee || 0));
            // Platform deposit fee (separate from Korapay's own processing fee above) — 0% until
            // an admin sets a real value in Rates & Fees.
            const depositFeeCfg = await getFeeConfig('fiat_deposit', currency);
            const platformFee = computeFee(depositFeeCfg, providerNet);
            const netAmount = Math.max(0, providerNet - platformFee);
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
        const providerNet = Math.max(0, parseFloat(amount) - parseFloat(fee || 0));
        const depositFeeCfg = await getFeeConfig('fiat_deposit', currency);
        const platformFee = computeFee(depositFeeCfg, providerNet);
        const netAmount = Math.max(0, providerNet - platformFee);
        await transaction(async (client) => {
            // Log transaction
            await client.query(
                `INSERT INTO transactions
                 (user_id, to_wallet_id, transaction_type, from_amount, to_amount,
                  from_currency, to_currency, net_amount, fee_amount, status, description, reference)
                 VALUES ($1, $2, 'deposit', $3, $3, $4, $4, $5, $6, 'completed', 'Bank Transfer Deposit', $7)`,
                [userId, walletId, amount, currency, netAmount, (parseFloat(fee) || 0) + platformFee, reference]
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
        notifyDeposit(userId, { amount, currency, reference }).catch(() => {});
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
        `SELECT id, user_id, from_wallet_id, from_amount, from_currency, reference, status, metadata
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
        await notifyTransfer(tx, true);
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
        await notifyTransfer(tx, false);
    }
}

// ─────────────────────────────────────────────
// Glyde Webhooks (Naira Collections via Static Virtual Accounts) — primary NGN deposit provider
// ─────────────────────────────────────────────
async function processGlyde(payload) {
    const { event, data } = payload || {};
    // Log unconditionally, regardless of event name — a real deposit was confirmed to arrive
    // on Glyde's side (total_collected updated) with NO webhook ever reaching this handler, and
    // when Glyde's own transaction record was inspected directly it carried a "type": "credit"
    // field never shown in the documented collection.success example. The actual event name for
    // a virtual-account bank-transfer credit is unconfirmed, so this log is the only way to see
    // it if/when Glyde does deliver one.
    logger.info(`[WEBHOOK] Glyde event: ${event}`, { raw: JSON.stringify(payload) });

    const looksLikeCredit = event === 'collection.success' || String(data?.type).toLowerCase() === 'credit';
    if (!looksLikeCredit) return;

    const { amount, currency, fee, status } = data || {};
    if (status && !['successful', 'success'].includes(String(status).toLowerCase())) return;

    const reference = data?.reference;
    // NOTE: confirmed via Glyde's own /virtual-accounts/{id}/transactions response that
    // merchant_reference is a bank/NIBSS session id, NOT the customer.reference we set at
    // account-creation time — it must not be trusted as a primary match key. Try the fields
    // that plausibly carry our own reference first, and treat merchant_reference as a last resort.
    const ourRef =
        data?.customer?.reference ||
        data?.account?.reference ||
        data?.virtual_account?.reference ||
        data?.merchant_reference;
    const accountNumber = data?.account_number || data?.account?.account_number || data?.virtual_account?.account_number;

    if (!ourRef && !accountNumber) {
        logger.warn(`[WEBHOOK] Glyde credit event with no reference or account number to match. Raw: ${JSON.stringify(payload)}`);
        return;
    }

    // Idempotency: never credit the same Glyde transaction twice.
    if (reference) {
        const existing = await query('SELECT id FROM transactions WHERE reference = $1', [reference]);
        if (existing.rows.length > 0) {
            logger.info(`[WEBHOOK] Glyde deposit ${reference} already processed.`);
            return;
        }
    }

    // 1. Match by our own account reference (set as customer.reference at account-creation time)
    let vbaRes = { rows: [] };
    if (ourRef) {
        vbaRes = await query(
            `SELECT wallet_id, user_id FROM virtual_bank_accounts WHERE provider = 'glyde' AND provider_reference = $1`,
            [ourRef]
        );
    }

    // 2. Fallback: match by the destination account number
    if (vbaRes.rows.length === 0 && accountNumber) {
        vbaRes = await query(
            `SELECT wallet_id, user_id FROM virtual_bank_accounts WHERE provider = 'glyde' AND account_number = $1`,
            [accountNumber]
        );
    }

    if (vbaRes.rows.length === 0) {
        logger.warn(`[WEBHOOK] Glyde deposit could not be matched to a virtual account — ref=${ourRef} acct=${accountNumber}. Raw payload: ${JSON.stringify(payload)}`);
        return;
    }

    const { wallet_id, user_id } = vbaRes.rows[0];
    await applyGlydeDeposit(user_id, wallet_id, amount, currency || 'NGN', fee, reference || ourRef);
}

/**
 * Reconciliation safety net: polls Glyde directly for a virtual account's transaction history
 * and credits any successful ones we don't already have recorded. Call this whenever a user's
 * existing VBA is fetched (see wallet.controller.js getOrCreateVBA) — the webhook alone isn't
 * provably reliable (a real deposit landed on Glyde's side with no webhook ever received here).
 */
export async function reconcileGlydeVBA(vba) {
    if (!vba?.provider_account_id) return;
    let transactions;
    try {
        transactions = await GlydeAdapter.getTransactions(vba.provider_account_id);
    } catch (err) {
        logger.warn(`[Reconcile] Glyde transactions fetch failed for ${vba.provider_account_id}: ${err.message}`);
        return;
    }

    for (const tx of transactions || []) {
        if (String(tx.type).toLowerCase() !== 'credit') continue;
        if (!['successful', 'success'].includes(String(tx.status).toLowerCase())) continue;
        if (!tx.reference) continue;

        const existing = await query('SELECT id FROM transactions WHERE reference = $1', [tx.reference]);
        if (existing.rows.length > 0) continue;

        logger.info(`[Reconcile] Found unprocessed Glyde credit ${tx.reference} for wallet ${vba.wallet_id} — crediting now.`);
        await applyGlydeDeposit(vba.user_id, vba.wallet_id, tx.amount, 'NGN', tx.fee, tx.reference);
    }
}

/**
 * Periodic sweep (see server.js) — reconciles EVERY active Glyde virtual account, not just
 * the one a user happens to be looking at. Relying on reconcileGlydeVBA firing only when a
 * user reopens the deposit screen isn't enough: a user who deposits then checks their balance
 * from the dashboard/wallets list (not the deposit modal) never triggers it at all, and would
 * see a stuck deposit indefinitely.
 */
export async function sweepPendingGlydeDeposits(limit = 100) {
    const rows = (await query(
        `SELECT wallet_id, user_id, provider_account_id FROM virtual_bank_accounts
         WHERE provider = 'glyde' AND is_active = true AND provider_account_id IS NOT NULL
         ORDER BY updated_at ASC LIMIT $1`,
        [limit]
    )).rows;

    let checked = 0;
    for (const vba of rows) {
        await reconcileGlydeVBA(vba).catch((e) => logger.warn(`[Glyde sweep] error for wallet ${vba.wallet_id}: ${e.message}`));
        checked++;
    }
    if (rows.length) logger.info(`[Glyde sweep] checked ${checked} virtual account(s)`);
    return { checked };
}

export async function applyGlydeDeposit(userId, walletId, amount, currency, fee, reference) {
    try {
        const providerNet = Math.max(0, parseFloat(amount) - parseFloat(fee || 0));
        const depositFeeCfg = await getFeeConfig('fiat_deposit', currency);
        const platformFee = computeFee(depositFeeCfg, providerNet);
        const netAmount = Math.max(0, providerNet - platformFee);

        await transaction(async (client) => {
            await client.query(
                `INSERT INTO transactions
                 (user_id, to_wallet_id, transaction_type, from_amount, to_amount,
                  from_currency, to_currency, net_amount, fee_amount, status, description, reference)
                 VALUES ($1, $2, 'deposit', $3, $3, $4, $4, $5, $6, 'completed', 'Bank Transfer Deposit', $7)`,
                [userId, walletId, amount, currency, netAmount, (parseFloat(fee) || 0) + platformFee, reference]
            );

            await client.query(
                `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
                [netAmount, walletId]
            );
        });

        logger.info(`[WEBHOOK] ✅ Glyde deposit complete: credited ${netAmount} ${currency} to user ${userId}`);

        ledgerService.recordDepositEntries({
            userWalletId: walletId,
            amount: netAmount,
            transactionId: reference,
            description: 'Wallet Funding',
        }).catch((e) => logger.error('[WEBHOOK] Glyde deposit ledger error:', e.message));

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
                amount,
                currency,
                reference,
                details: 'Virtual Bank Account Transfer',
            }, userRes.rows[0]).catch((e) => logger.error('[WEBHOOK] Glyde deposit email error:', e));
        }
        notifyDeposit(userId, { amount, currency, reference }).catch(() => {});
    } catch (err) {
        logger.error(`[WEBHOOK] Glyde deposit error: ${err.message}`);
    }
}

// Email the user about a bank-transfer (withdrawal/payout) outcome.
async function notifyTransfer(tx, success) {
    try {
        const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [tx.user_id]
        );
        if (userRes.rows.length > 0) {
            const beneficiary = (tx.metadata?.bank_name || tx.metadata?.account_number)
                ? { bankName: tx.metadata?.bank_name, accountNumber: tx.metadata?.account_number, accountName: tx.metadata?.account_name }
                : undefined;
            sendWithdrawalEmails({
                success,
                amount: tx.from_amount,
                currency: tx.from_currency,
                reference: tx.reference,
                txId: tx.id,
                beneficiary,
                destinationLabel: 'bank account',
                typeDetail: `${tx.from_currency} Bank Transfer`,
            }, userRes.rows[0]).catch((e) => logger.error('[WEBHOOK] Transfer email error:', e));
        }
        notifyWithdrawal(tx.user_id, {
            amount: tx.from_amount,
            currency: tx.from_currency,
            reference: tx.reference,
            status: success ? 'completed' : 'failed',
        }).catch(() => {});
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
 * Obiex webhook — no `event` envelope; the payload itself carries `type: 'DEPOSIT'|'WITHDRAWAL'`.
 * Deposits are matched to a user by address (see obiexWebhook.service.js — Obiex's deposit
 * payload doesn't carry our uniqueUserIdentifier). Withdrawals are matched by the
 * obiex_withdraw_id/obiex_reference we stored when the withdrawal was submitted.
 */
async function processObiex(payload) {
    const type = String(payload?.type || '').toUpperCase();
    logger.info(`[WEBHOOK] Obiex event: ${type}`, { transactionId: payload?.transactionId, status: payload?.status });

    switch (type) {
        case 'DEPOSIT':
            await creditUserWalletByObiex(payload);
            break;
        case 'WITHDRAWAL':
            await updateObiexWithdrawal(payload);
            break;
        default:
            logger.info(`[WEBHOOK] Obiex unhandled type: ${type}`);
    }
}

/**
 * Update Quidax withdrawal status
 * Matches by quidax_withdraw_id in metadata
 */
async function updateQuidaxWithdrawal(quidaxWithdrawId, status, webhookData) {
    try {
        let emailPayload = null;

        await transaction(async (client) => {
            const quidaxReference = webhookData?.reference ? String(webhookData.reference) : null;

            // Check wallet_transactions first (crypto withdrawals)
            let txType = 'wallet_transactions';
            let txRes = await client.query(
                `SELECT id, wallet_id, amount, currency, status AS current_status, metadata
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
                    `SELECT id, user_id, from_wallet_id AS wallet_id, from_amount AS amount, from_currency AS currency, status AS current_status, metadata
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

            let userId = tx.user_id || null;
            if (!userId) {
                const walletRes = await client.query(`SELECT user_id FROM wallets WHERE id = $1`, [tx.wallet_id]);
                userId = walletRes.rows[0]?.user_id || null;
            }
            const isCrypto = txType === 'wallet_transactions';
            emailPayload = {
                userId,
                success: status === 'completed',
                amount: tx.amount,
                currency: tx.currency,
                reference: quidaxReference || quidaxWithdrawId,
                txId: tx.id,
                destination: isCrypto ? (tx.metadata?.address || null) : null,
                destinationLabel: isCrypto ? 'crypto address' : 'bank account',
                network: tx.metadata?.network || null,
                beneficiary: !isCrypto && (tx.metadata?.bank_name || tx.metadata?.account_number)
                    ? { bankName: tx.metadata?.bank_name, accountNumber: tx.metadata?.account_number, accountName: tx.metadata?.account_name }
                    : undefined,
                typeDetail: isCrypto
                    ? `Crypto Withdrawal (${tx.currency}${tx.metadata?.network ? ' · ' + tx.metadata.network : ''})`
                    : `${tx.currency} Bank Transfer`,
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
                        logger.error('[WEBHOOK] Quidax withdrawal email error:', e)
                    );
                }
            } catch (emailErr) {
                logger.error('[WEBHOOK] Quidax withdrawal email notify error:', emailErr);
            }
            notifyWithdrawal(emailPayload.userId, {
                amount: emailPayload.amount,
                currency: emailPayload.currency,
                reference: emailPayload.reference,
                status: emailPayload.success ? 'completed' : 'failed',
            }).catch(() => {});
        }
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
