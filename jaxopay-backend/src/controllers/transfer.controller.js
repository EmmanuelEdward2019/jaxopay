import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { auditFromReq } from '../services/audit.service.js';
import KorapayAdapter from '../orchestration/adapters/payments/KorapayAdapter.js';
import obiex from '../orchestration/adapters/crypto/ObiexAdapter.js';
import { getSpendableBalance } from '../utils/walletBalance.js';
import { getKorapayErrorDetails, getKorapayTransferFailureMessage } from '../utils/korapay.js';
import { verifyTransactionPin } from '../services/transactionPin.service.js';
import { enforceTierLimit } from '../services/kycLimits.service.js';
import { sendWithdrawalEmails } from '../services/email.service.js';
import { assertWithdrawalsAllowed } from '../services/financialControls.service.js';
import { notifyWithdrawal } from '../services/notification.service.js';
import { getFeeConfig, computeFee } from '../services/feeConfig.service.js';

async function notifyPayout(userId, payload) {
    try {
        const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [userId]
        );
        if (userRes.rows.length > 0) {
            sendWithdrawalEmails(payload, userRes.rows[0]).catch((e) => logger.error('[Transfer] payout email error:', e.message));
        }
    } catch (e) {
        logger.error('[Transfer] payout notify error:', e.message);
    }
    notifyWithdrawal(userId, {
        amount: payload.amount,
        currency: payload.currency,
        reference: payload.reference,
        status: payload.success ? 'completed' : 'failed',
    }).catch(() => {});
}

const korapay = new KorapayAdapter();

// ─────────────────────────────────────────────
// GET /transfers/banks  — NGN via Obiex (matches the payout provider — Obiex's own bank codes
// are used consistently across list → resolve → payout, see resolveAccount/sendTransfer below).
// Other currencies via Korapay (Obiex bank payouts are NGN-only).
// ─────────────────────────────────────────────
export const listBanks = catchAsync(async (req, res) => {
    const currency = req.query.currency || 'NGN';

    try {
        let normalized;
        if (currency.toUpperCase() === 'NGN') {
            const banks = await obiex.getNgnBanks();
            normalized = (banks || []).map((b) => ({
                code: b.uuid || b.sortCode,
                name: b.name,
            })).filter((b) => b.code && b.name);
            logger.info(`[Transfer] Fetched ${normalized.length} banks from Obiex (NGN)`);
        } else {
            const banks = await korapay.listBanks(currency);
            normalized = (banks || []).map((b) => ({
                code: b.code || b.nibss_bank_code,
                name: b.name,
            })).filter((b) => b.code && b.name);
            logger.info(`[Transfer] Fetched ${normalized.length} banks from Korapay (currency=${currency})`);
        }

        if (normalized.length === 0) {
            throw new AppError('No banks returned. Please try again.', 503);
        }

        res.status(200).json({ success: true, data: normalized, total: normalized.length });

    } catch (err) {
        // Fallback to static common Nigerian banks so the UI isn't blocked
        const fallbackBanks = [
            { code: "044", name: "Access Bank" },
            { code: "023", name: "Citibank" },
            { code: "050", name: "Ecobank" },
            { code: "070", name: "Fidelity Bank" },
            { code: "011", name: "First Bank" },
            { code: "214", name: "First City Monument Bank" },
            { code: "058", name: "Guaranty Trust Bank" },
            { code: "030", name: "Heritage Bank" },
            { code: "082", name: "Keystone Bank" },
            { code: "076", name: "Polaris Bank" },
            { code: "221", name: "Stanbic IBTC Bank" },
            { code: "232", name: "Sterling Bank" },
            { code: "032", name: "Union Bank" },
            { code: "033", name: "United Bank for Africa" },
            { code: "215", name: "Unity Bank" },
            { code: "035", name: "Wema Bank" },
            { code: "057", name: "Zenith Bank" },
            { code: "090267", name: "Kuda Bank" },
            { code: "090175", name: "Rubies MFB" },
            { code: "090294", name: "VFD MFB" },
            { code: "100004", name: "Opay (Paycom)" },
            { code: "090328", name: "Eyowo" },
            { code: "100013", name: "PalmPay" },
            { code: "100039", name: "Titan Trust" }
        ];

        logger.warn(`[Transfer] Korapay bank list failed: ${err.message}`);
        return res.status(200).json({ success: true, data: fallbackBanks, total: fallbackBanks.length, fallback: true });
    }
});

// ─────────────────────────────────────────────
// POST /transfers/resolve  — verify bank account name. NGN via Obiex (matches the bank list +
// payout provider), other currencies via Korapay.
// ─────────────────────────────────────────────
export const resolveAccount = catchAsync(async (req, res) => {
    const { bank_code, account_number, currency = 'NGN' } = req.body;
    if (!bank_code || !account_number) {
        throw new AppError('bank_code and account_number are required', 400);
    }
    const isNgn = currency.toUpperCase() === 'NGN';

    try {
        const data = isNgn
            ? await obiex.resolveNgnAccount(bank_code, account_number)
            : await korapay.resolveAccount(bank_code, account_number, currency.toUpperCase());

        const accountName = data?.account_name || data?.account_holder_name || data?.name;
        if (!accountName) {
            throw new AppError('Could not verify bank account. Please check the details and try again.', 422);
        }

        res.status(200).json({
            success: true,
            data: {
                account_name: accountName,
                bank_name: data?.bank_name || null,
                account_number: data?.account_number || account_number,
                bank_code: data?.bank_code || bank_code,
            }
        });
    } catch (err) {
        if (err instanceof AppError) throw err;
        const message = isNgn ? (err.message || 'Bank account verification failed') : getKorapayErrorDetails(err).message;
        logger.error(`[Transfer] ${isNgn ? 'Obiex' : 'Korapay'} account resolve failed: ${message}`);
        throw new AppError(`Could not verify bank account: ${message}`, err.statusCode || 502);
    }
});

// ─────────────────────────────────────────────
// POST /transfers/send  — initiate bank transfer via Korapay disbursement
// ─────────────────────────────────────────────
/**
 * Pull a NIBSS session ID out of a payout response, whatever the provider decided to call it.
 * Nigerian banks quote this when tracing a transfer, so it belongs on the receipt — but the field
 * name varies by provider and isn't documented for Obiex, so check the plausible spellings at both
 * the top level and inside the raw payload. Returns null when there genuinely isn't one, so the
 * receipt simply omits the row rather than inventing a value.
 */
function extractSessionId(payoutResponse) {
    const candidates = ['sessionId', 'session_id', 'nibssSessionId', 'nibss_session_id', 'sessionID'];
    const sources = [payoutResponse, payoutResponse?.raw, payoutResponse?.raw?.data, payoutResponse?.raw?.payout];
    for (const src of sources) {
        if (!src || typeof src !== 'object') continue;
        for (const key of candidates) {
            const v = src[key];
            if (v != null && String(v).trim()) return String(v).trim();
        }
    }
    return null;
}

/**
 * What a fiat withdrawal will cost and what the recipient will get, before committing to it.
 * Read-only, and deliberately computed from the same getFeeConfig/computeFee the withdrawal
 * itself uses, so the quoted fee can never drift from the charged one.
 *
 * Only the fee and the recipient amount are exposed — the provider's own cost is absorbed inside
 * our fee and is nobody's business but ours.
 */
export const getWithdrawalQuote = catchAsync(async (req, res) => {
    const currency = String(req.query.currency || '').toUpperCase();
    const amount = parseFloat(req.query.amount);
    if (!currency) throw new AppError('currency is required', 400);

    const cfg = await getFeeConfig('fiat_withdrawal', currency);
    // With no amount we can still answer for a flat fee, which is the common case for the
    // "before you withdraw" panel that renders before anything is typed.
    const fee = computeFee(cfg, Number.isFinite(amount) ? amount : 0);

    res.status(200).json({
        success: true,
        data: {
            currency,
            fee,
            feeType: cfg?.fee_type || null,
            recipientAmount: Number.isFinite(amount) ? Math.max(0, amount - fee) : null,
        },
    });
});

export const sendTransfer = catchAsync(async (req, res) => {
    const {
        wallet_id,
        bank_code,
        account_number,
        account_name,
        bank_name,
        amount,
        narration,
        currency = 'NGN',
    } = req.body;
    const amountValue = Number(amount);
    const transferCurrency = currency.toUpperCase();

    if (!wallet_id || !bank_code || !account_number || !account_name || !Number.isFinite(amountValue) || amountValue <= 0) {
        throw new AppError('wallet_id, bank_code, account_number, account_name, and amount are required', 400);
    }

    await assertWithdrawalsAllowed(req.user.id, 'fiat');

    // Require the transaction PIN as the final authorization step.
    await verifyTransactionPin(req.user.id, req.body.pin);
    // KYC tier daily/monthly limit
    await enforceTierLimit(req.user.id, amountValue, transferCurrency, req.user.kyc_tier);

    // Supported fiat withdrawal currencies via Korapay disbursements
    const DISBURSE_SUPPORTED = new Set(['NGN', 'KES', 'GHS', 'ZAR']);
    if (!DISBURSE_SUPPORTED.has(transferCurrency)) {
        throw new AppError(
            `Bank transfers in ${transferCurrency} are not currently available. Supported: NGN, KES, GHS, ZAR.`,
            400
        );
    }

    // The fee we quote is all-in: the user is debited `amountValue` and the recipient receives
    // exactly `amountValue - platformFee`, with our margin being whatever is left after the payout
    // provider takes their own cut.
    //
    // Obiex deducts their charge from whatever we ask them to send, so asking for the recipient's
    // amount would land short — which is exactly what used to happen: a 1,200 withdrawal quoted a
    // 100 fee, sent 1,100, and the user received 1,046.25 because Obiex took a further 53.75. The
    // payout is therefore grossed up by that cost so the deduction lands the recipient on target.
    const withdrawalFeeCfg = await getFeeConfig('fiat_withdrawal', transferCurrency);
    const platformFee = computeFee(withdrawalFeeCfg, amountValue);
    const recipientAmount = amountValue - platformFee;

    const providerCostCfg = await getFeeConfig('provider_payout_cost', transferCurrency);
    const providerCost = computeFee(providerCostCfg, amountValue);
    const netAmount = recipientAmount + providerCost;

    // Our margin. Negative means the configured withdrawal fee doesn't cover what the provider
    // charges, so every withdrawal loses money — honour the quoted fee (the user was promised it)
    // but make it loud, because it needs an admin to raise the fee.
    const platformMargin = platformFee - providerCost;
    if (platformMargin < 0) {
        logger.warn(
            `[Transfer] ${transferCurrency} withdrawal fee (${platformFee}) is below the provider payout cost ` +
            `(${providerCost}) — JAXOPAY absorbs ${Math.abs(platformMargin)} ${transferCurrency} on this transfer. ` +
            `Raise fiat_withdrawal for ${transferCurrency} in Rates & Fees.`
        );
    }

    const reference = `TXF-${req.user.id.slice(0, 8)}-${Date.now()}`;

    // 1. Verify wallet belongs to user, reserve funds, and create a pending transaction atomically.
    await transaction(async (client) => {
        const walletResult = await client.query(
            `SELECT id, currency, balance, available_balance, locked_balance
             FROM wallets
             WHERE id = $1 AND user_id = $2 AND is_active = true
             FOR UPDATE`,
            [wallet_id, req.user.id]
        );
        if (walletResult.rows.length === 0) throw new AppError('Wallet not found', 404);

        const wallet = walletResult.rows[0];
        if (wallet.currency.toUpperCase() !== transferCurrency) {
            throw new AppError(`Wallet currency ${wallet.currency} does not match transfer currency ${transferCurrency}`, 400);
        }

        const spendableBalance = getSpendableBalance(wallet);

        if (spendableBalance < amountValue) {
            throw new AppError(`Insufficient balance. Available: ${wallet.currency} ${spendableBalance.toLocaleString()}`, 400);
        }

        await client.query(
            `UPDATE wallets
             SET balance = balance - $1,
                 available_balance = CASE
                   WHEN COALESCE(locked_balance, 0) > 0 THEN GREATEST(
                     (CASE WHEN available_balance IS NULL THEN balance - COALESCE(locked_balance, 0) ELSE available_balance END) - $1,
                     0
                   )
                   WHEN COALESCE(available_balance, 0) <= 0 AND balance > 0 THEN GREATEST(balance - $1, 0)
                   ELSE GREATEST(LEAST(COALESCE(available_balance, balance), balance) - $1, 0)
                 END,
                 updated_at = NOW()
             WHERE id = $2`,
            [amountValue, wallet_id]
        );

        await client.query(
            `INSERT INTO transactions
               (user_id, from_wallet_id, transaction_type, from_amount, from_currency, net_amount, fee_amount,
                status, description, reference, metadata)
             VALUES ($1, $2, 'bank_transfer', $3, $4, $5, $6, 'pending', $7, $8, $9)`,
            [
                req.user.id, wallet_id, amountValue, transferCurrency, netAmount, platformFee,
                narration || `Transfer to ${account_name}`,
                reference,
                // recipient_amount is what actually lands in their account — worth storing
                // explicitly since it is neither from_amount nor net_amount (net_amount is the
                // grossed-up figure handed to the provider). provider_cost/platform_margin are
                // internal, for reconciliation; only the fee and recipient amount are ever shown.
                JSON.stringify({
                    bank_code, account_number, account_name, bank_name, currency: transferCurrency,
                    platform_fee: platformFee,
                    recipient_amount: recipientAmount,
                    provider_cost: providerCost,
                    platform_margin: platformMargin,
                }),
            ]
        );
    });

    // 2. Call the payout provider — NGN goes through Obiex (real bank-account payout via
    // POST /wallets/ext/debit/fiat), other supported currencies remain on Korapay.
    const useObiex = transferCurrency === 'NGN';
    try {
        let transferStatus, providerReference, providerMetadata, isComplete;

        if (useObiex) {
            // bank_code is already an Obiex-native code — the bank list (listBanks) and account
            // resolution (resolveAccount) both source from Obiex for NGN, so no code translation
            // needed. The frontend never sends bank_name though, and withdrawFiat requires it —
            // resolve it server-side from Obiex's own bank list by code.
            const obiexBanks = await obiex.getNgnBanks();
            const matchedBank = obiexBanks.find((b) => (b.uuid || b.sortCode) === bank_code);
            const resolvedBankName = bank_name || matchedBank?.name;
            if (!resolvedBankName) {
                throw new AppError('Could not identify the selected bank. Please try again.', 422);
            }

            logger.info(`[Transfer] Initiating Obiex NGN payout: ${reference} → ${account_name} (${resolvedBankName}/${account_number}) ${netAmount} (debited ${amountValue}, fee ${platformFee})`);

            const transferData = await obiex.withdrawFiat({
                currency: transferCurrency,
                amount: netAmount,
                accountNumber: account_number,
                accountName: account_name,
                bankName: resolvedBankName,
                bankCode: bank_code,
                reference,
                narration: narration || `Transfer to ${account_name} via Jaxopay`,
            });

            transferStatus = String(transferData?.status || 'PENDING').toLowerCase();
            providerReference = transferData?.id || null;
            // Obiex settles the bank payout asynchronously and confirms via webhook (see
            // updateObiexWithdrawal) — an accepted submission ("approved"/"pending") is NOT
            // final completion, unlike Korapay which can return an immediate success.
            isComplete = false;
            providerMetadata = {
                provider: 'obiex',
                obiex_withdraw_id: providerReference,
                obiex_reference: reference,
                obiex_status: transferStatus,
                // What the provider actually charged, so the configured provider_payout_cost used
                // to gross this payout up can be checked against reality instead of assumed.
                provider_fee_charged: transferData?.fee ?? null,
                // NIBSS session ID, which Nigerian banks quote when tracing a transfer. Obiex's
                // field name for it isn't documented and this machine can't call their
                // account-scoped endpoints (IP allowlist), so take whichever spelling shows up
                // rather than guessing one — and keep the raw payout object so the next
                // withdrawal in production tells us definitively what they return.
                session_id: extractSessionId(transferData),
                provider_payout_raw: transferData?.raw ?? null,
            };

            logger.info(`[Transfer] Obiex response for ${reference}: status=${transferStatus}`);
        } else {
            logger.info(`[Transfer] Initiating Korapay payout: ${reference} → ${account_name} (${bank_code}/${account_number}) ${transferCurrency} ${netAmount} (debited ${amountValue}, fee ${platformFee})`);

            const transferData = await korapay.disburse({
                reference,
                amount: netAmount,
                currency: transferCurrency,
                bankCode: bank_code,
                accountNumber: account_number,
                accountName: account_name,
                narration: narration || `Transfer to ${account_name} via Jaxopay`,
                customerEmail: req.user.email,
            });

            transferStatus = (transferData?.status || 'processing').toLowerCase();
            providerReference = transferData?.providerReference || null;

            logger.info(`[Transfer] Korapay response for ${reference}: status=${transferStatus} success=${transferData?.success}`);

            // Korapay returned an explicit failure synchronously — treat as failed and reverse.
            if (transferData?.success === false || transferStatus === 'failed') {
                throw new AppError(transferData?.raw?.message || 'The payout was rejected. Please try again or contact support.', 502);
            }

            isComplete = ['success', 'successful', 'completed'].includes(transferStatus);
            providerMetadata = { provider: 'korapay', provider_reference: providerReference, korapay_status: transferStatus };
        }

        // Persist the provider reference; mark completed only on immediate, confirmed success.
        await transaction(async (client) => {
            await client.query(
                `UPDATE transactions
                 SET status = $1,
                     external_reference = COALESCE($2, external_reference),
                     metadata = metadata || $3::jsonb,
                     ${isComplete ? 'completed_at = NOW(),' : ''}
                     updated_at = NOW()
                 WHERE reference = $4`,
                [
                    isComplete ? 'completed' : 'processing',
                    providerReference,
                    JSON.stringify(providerMetadata),
                    reference,
                ]
            );
        });

        auditFromReq(req, { action: 'bank_transfer', entityType: 'transaction', newValues: { amount: amountValue, currency: transferCurrency, reference, recipient: account_name, bank: bank_name } });

        if (isComplete) {
            notifyPayout(req.user.id, {
                success: true,
                amount: amountValue,
                currency: transferCurrency,
                reference,
                beneficiary: { bankName: bank_name || bank_code, accountNumber: account_number, accountName: account_name },
                destinationLabel: 'bank account',
                typeDetail: `${transferCurrency} Bank Transfer`,
            });
        }

        res.status(200).json({
            success: true,
            message: `Transfer initiated successfully! Reference: ${reference}`,
            data: {
                reference,
                status: isComplete ? 'completed' : 'processing',
                amount: amountValue,
                fee: platformFee,
                // What the recipient actually receives. NOT netAmount — that's the grossed-up
                // figure handed to the provider, which is larger and would overstate the payout.
                net_amount: recipientAmount,
                currency: transferCurrency,
                recipient: { account_name, account_number, bank_name, bank_code },
                provider_reference: providerReference,
            },
        });

    } catch (providerErr) {
        // Provider request failed — reverse the reserved funds and mark the transfer failed.
        const friendlyMessage = providerErr instanceof AppError
            ? providerErr.message
            : useObiex
                ? (providerErr.message || 'The payout was rejected. Please try again or contact support.')
                : getKorapayTransferFailureMessage(providerErr, transferCurrency);
        logger.error(`[Transfer] ${useObiex ? 'Obiex' : 'Korapay'} disburse failed for ${reference}: ${useObiex ? friendlyMessage : getKorapayErrorDetails(providerErr).message}`);

        await transaction(async (client) => {
            await client.query(
                `UPDATE wallets
                 SET balance = balance + $1,
                     available_balance = COALESCE(available_balance, 0) + $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [amountValue, wallet_id]
            );
            await client.query(
                `UPDATE transactions SET status = 'failed', failure_reason = $2, updated_at = NOW() WHERE reference = $1`,
                [reference, friendlyMessage]
            );
        });

        notifyPayout(req.user.id, {
            success: false,
            amount: amountValue,
            currency: transferCurrency,
            reference,
            reason: friendlyMessage,
            beneficiary: { bankName: bank_name || bank_code, accountNumber: account_number, accountName: account_name },
            destinationLabel: 'bank account',
            typeDetail: `${transferCurrency} Bank Transfer`,
        });

        throw new AppError(friendlyMessage, providerErr.statusCode || 502);
    }
});

// ─────────────────────────────────────────────
// Reconcile a single bank_transfer against its provider — shared by the manual
// POST /transfers/verify endpoint and the background sweep (sweepPendingBankTransfers
// below), so a "Processing" transfer resolves itself even if the webhook never arrives
// and the user isn't watching the success screen (the frontend only auto-polls for
// ~30s after submission — real Obiex payouts can settle well after that).
// ─────────────────────────────────────────────
async function reconcileBankTransfer(reference) {
    const txRes = await query(
        `SELECT id, user_id, from_wallet_id, from_amount, from_currency, status, metadata
         FROM transactions
         WHERE reference = $1 AND transaction_type = 'bank_transfer'`,
        [reference]
    );
    if (txRes.rows.length === 0) return { status: 'not_found' };
    const tx = txRes.rows[0];
    const beneficiary = (tx.metadata?.bank_name || tx.metadata?.account_number)
        ? { bankName: tx.metadata?.bank_name, accountNumber: tx.metadata?.account_number, accountName: tx.metadata?.account_name }
        : undefined;
    const typeDetail = `${tx.from_currency} Bank Transfer`;

    // Already finalised — nothing to poll.
    if (['completed', 'failed'].includes(tx.status)) {
        return { status: tx.status, userId: tx.user_id };
    }

    const isObiex = tx.metadata?.provider === 'obiex' || tx.from_currency?.toUpperCase() === 'NGN';

    // Ask the provider for the live disbursement status.
    let providerStatus;
    try {
        if (isObiex) {
            const obiexWithdrawId = tx.metadata?.obiex_withdraw_id;
            if (!obiexWithdrawId) {
                // No provider id recorded yet (e.g. the submit call itself hadn't returned one) —
                // nothing to poll; leave as-is for the webhook to finalize.
                return { status: tx.status, userId: tx.user_id, pending: true };
            }
            const result = await obiex.getTransactionById(obiexWithdrawId);
            providerStatus = String(result?.payout?.status || result?.status || '').toLowerCase();
        } else {
            const result = await korapay.getDisbursementStatus(reference);
            providerStatus = (result.status || '').toLowerCase();
        }
        logger.info(`[Transfer] reconcile ${reference}: provider status = ${providerStatus || 'unknown'}`);
    } catch (err) {
        const message = isObiex ? (err.message || 'unknown error') : getKorapayErrorDetails(err).message;
        logger.warn(`[Transfer] reconcile ${reference} provider query failed: ${message}`);
        // Couldn't reach the provider — leave the transaction as-is.
        return { status: tx.status, userId: tx.user_id, pending: true };
    }

    if (['success', 'successful', 'completed'].includes(providerStatus)) {
        let didFinalize = false;
        await transaction(async (client) => {
            const cur = await client.query(`SELECT status FROM transactions WHERE reference = $1 FOR UPDATE`, [reference]);
            if (['completed', 'failed'].includes(cur.rows[0]?.status)) return;
            await client.query(
                `UPDATE transactions SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE reference = $1`,
                [reference]
            );
            didFinalize = true;
        });
        if (didFinalize) {
            notifyPayout(tx.user_id, {
                success: true,
                amount: tx.from_amount,
                currency: tx.from_currency,
                reference,
                beneficiary,
                destinationLabel: 'bank account',
                typeDetail,
            });
        }
        return { status: 'completed', userId: tx.user_id };
    }

    if (['failed', 'reversed', 'cancelled', 'canceled', 'declined', 'rejected'].includes(providerStatus)) {
        // Reverse the reserved funds (idempotent — only if not already finalised).
        let didFinalize = false;
        await transaction(async (client) => {
            const cur = await client.query(`SELECT status FROM transactions WHERE reference = $1 FOR UPDATE`, [reference]);
            if (['completed', 'failed'].includes(cur.rows[0]?.status)) return;
            await client.query(
                `UPDATE wallets SET balance = balance + $1, available_balance = COALESCE(available_balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
                [tx.from_amount, tx.from_wallet_id]
            );
            await client.query(
                `UPDATE transactions SET status = 'failed', failure_reason = $2, updated_at = NOW() WHERE reference = $1`,
                [reference, 'Payout failed at provider — funds returned']
            );
            didFinalize = true;
        });
        if (didFinalize) {
            notifyPayout(tx.user_id, {
                success: false,
                amount: tx.from_amount,
                currency: tx.from_currency,
                reference,
                reason: 'Payout failed at provider — funds returned',
                beneficiary,
                destinationLabel: 'bank account',
                typeDetail,
            });
        }
        return { status: 'failed', userId: tx.user_id };
    }

    // Still processing.
    return { status: 'processing', userId: tx.user_id };
}

// ─────────────────────────────────────────────
// POST /transfers/verify  — poll the payout provider's status and reconcile it
// (lets a "Processing" transfer resolve itself without waiting on the webhook).
// ─────────────────────────────────────────────
export const verifyTransfer = catchAsync(async (req, res) => {
    const reference = req.body.reference || req.params.reference;
    if (!reference) throw new AppError('reference is required', 400);

    const result = await reconcileBankTransfer(reference);
    if (result.status === 'not_found') throw new AppError('Transfer not found', 404);
    if (result.userId !== req.user.id) throw new AppError('Unauthorized', 403);

    res.status(200).json({ success: true, data: { reference, status: result.status, pending: result.pending } });
});

// ─────────────────────────────────────────────
// Background sweep — auto-reconcile bank transfers stuck in "processing" against Obiex.
// Mirrors CurrencyEngineService.sweepPendingRamps; wired up in server.js on an interval.
// Without this, a transfer whose webhook never arrives (or arrives with a status string
// we don't recognize) stays "Processing" forever once the user leaves the success screen.
// ─────────────────────────────────────────────
export async function sweepPendingBankTransfers(maxAgeMinutes = 2, limit = 50) {
    const rows = (await query(
        `SELECT reference FROM transactions
         WHERE transaction_type = 'bank_transfer' AND status = 'processing'
           AND metadata->>'provider' = 'obiex'
           AND created_at < NOW() - ($1 || ' minutes')::interval
         ORDER BY created_at ASC LIMIT $2`,
        [String(maxAgeMinutes), limit]
    )).rows;
    let changed = 0;
    for (const r of rows) {
        const res = await reconcileBankTransfer(r.reference).catch(() => null);
        if (res && res.status !== 'processing') changed++;
    }
    if (rows.length) logger.info(`[transfer sweep] checked ${rows.length}, resolved ${changed}`);
    return { checked: rows.length, resolved: changed };
}

// ─────────────────────────────────────────────
// GET /transfers/history  — transfer history for user
// ─────────────────────────────────────────────
export const getTransferHistory = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const result = await query(
        `SELECT id, from_amount, from_currency, status, description, reference, metadata, created_at, updated_at
         FROM transactions
         WHERE user_id = $1 AND transaction_type = 'bank_transfer'
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
    );

    const countResult = await query(
        `SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND transaction_type = 'bank_transfer'`,
        [req.user.id]
    );

    res.status(200).json({
        success: true,
        data: {
            transfers: result.rows,
            pagination: {
                page, limit,
                total: parseInt(countResult.rows[0].count),
                pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
            },
        },
    });
});

// ─────────────────────────────────────────────
// GET /transfers/merchant-balances  — Korapay merchant balances (admin only)
// ─────────────────────────────────────────────
export const getMerchantBalances = catchAsync(async (req, res) => {
    try {
        const balances = await korapay.getBalances();

        // Korapay returns an object keyed by currency: { NGN: { available_balance, pending_balance } }
        const normalized = Array.isArray(balances)
            ? balances
            : Object.entries(balances || {}).map(([currency, value]) => ({
                currency: currency.toUpperCase(),
                balance: value?.available_balance ?? value?.balance ?? 0,
                available: value?.available_balance ?? value?.balance ?? 0,
                pending: value?.pending_balance ?? 0,
            }));

        res.status(200).json({ success: true, data: normalized });
    } catch (err) {
        const { message, statusCode } = getKorapayErrorDetails(err);
        logger.error('[Transfer] Merchant balance check failed:', message);
        throw new AppError(message || 'Could not fetch merchant balances', statusCode || 500);
    }
});
