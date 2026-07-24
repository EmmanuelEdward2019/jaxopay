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

// Obiex's bank list uses its own internal codes (e.g. "0002" for 9PSB), not the real NIBSS
// codes Korapay/the UI use (e.g. "120001" for 9PSB) — so the bank the user actually picked
// (a Korapay bank_code — the frontend never sends bank_name) has to be resolved to a real name
// via Korapay's own list first, then re-matched by NAME against Obiex's list to get the code
// withdrawFiat() expects. Deliberately strict: no match → throw, rather than silently guessing
// the wrong bank for a real money transfer.
const normalizeBankName = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function resolveObiexBankCode(korapayBankCode) {
    const [korapayBanks, obiexBanks] = await Promise.all([
        korapay.listBanks('NGN'),
        obiex.getNgnBanks(),
    ]);

    const korapayBank = (korapayBanks || []).find((b) => (b.code || b.nibss_bank_code) === korapayBankCode);
    if (!korapayBank) {
        throw new AppError('Could not identify the selected bank. Please try again.', 422);
    }

    const target = normalizeBankName(korapayBank.name);
    const exact = obiexBanks.find((b) => normalizeBankName(b.name) === target);
    if (exact) return { code: exact.uuid || exact.sortCode, name: korapayBank.name };

    const partial = obiexBanks.find((b) => {
        const n = normalizeBankName(b.name);
        return n.includes(target) || target.includes(n);
    });
    if (partial) return { code: partial.uuid || partial.sortCode, name: korapayBank.name };

    throw new AppError(`"${korapayBank.name}" is not currently supported for Naira withdrawals. Please choose a different bank or contact support.`, 422);
}

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
}

const korapay = new KorapayAdapter();

// ─────────────────────────────────────────────
// GET /transfers/banks  — ALL banks via Korapay's real NIBSS codes (kept even though NGN
// payouts execute via Obiex — Obiex's bank list uses its own internal codes, not NIBSS codes,
// which breaks account-name resolution below; see resolveObiexBankCode() for how NGN payouts
// still reach Obiex despite the list itself staying on Korapay).
// ─────────────────────────────────────────────
export const listBanks = catchAsync(async (req, res) => {
    const currency = req.query.currency || 'NGN';

    try {
        const banks = await korapay.listBanks(currency);
        const normalized = (banks || []).map((b) => ({
            code: b.code || b.nibss_bank_code,
            name: b.name,
        })).filter((b) => b.code && b.name);
        logger.info(`[Transfer] Fetched ${normalized.length} banks from Korapay (currency=${currency})`);

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
// POST /transfers/resolve  — verify bank account name via Korapay
// ─────────────────────────────────────────────
export const resolveAccount = catchAsync(async (req, res) => {
    const { bank_code, account_number, currency = 'NGN' } = req.body;
    if (!bank_code || !account_number) {
        throw new AppError('bank_code and account_number are required', 400);
    }

    try {
        const data = await korapay.resolveAccount(bank_code, account_number, currency.toUpperCase());

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
        const { message } = getKorapayErrorDetails(err);
        logger.error(`[Transfer] Korapay account resolve failed: ${message}`);
        throw new AppError(`Could not verify bank account: ${message}`, err.statusCode || 502);
    }
});

// ─────────────────────────────────────────────
// POST /transfers/send  — initiate bank transfer via Korapay disbursement
// ─────────────────────────────────────────────
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
             VALUES ($1, $2, 'bank_transfer', $3, $4, $3, 0, 'pending', $5, $6, $7)`,
            [
                req.user.id, wallet_id, amountValue, transferCurrency,
                narration || `Transfer to ${account_name}`,
                reference,
                JSON.stringify({ bank_code, account_number, account_name, bank_name, currency: transferCurrency }),
            ]
        );
    });

    // 2. Call the payout provider — NGN goes through Obiex (real bank-account payout via
    // POST /wallets/ext/debit/fiat), other supported currencies remain on Korapay.
    const useObiex = transferCurrency === 'NGN';
    try {
        let transferStatus, providerReference, providerMetadata, isComplete;

        if (useObiex) {
            // bank_code came from Korapay's (real NIBSS) bank list — Obiex needs its OWN
            // internal bank code for the same bank, resolved by name.
            const resolvedBank = await resolveObiexBankCode(bank_code);
            const resolvedBankName = resolvedBank.name || bank_name;
            logger.info(`[Transfer] Initiating Obiex NGN payout: ${reference} → ${account_name} (${resolvedBankName}/${account_number}) ${amountValue}`);

            const transferData = await obiex.withdrawFiat({
                currency: transferCurrency,
                amount: amountValue,
                accountNumber: account_number,
                accountName: account_name,
                bankName: resolvedBankName,
                bankCode: resolvedBank.code,
                reference,
                narration: narration || `Transfer to ${account_name} via Jaxopay`,
            });

            transferStatus = String(transferData?.status || 'PENDING').toLowerCase();
            providerReference = transferData?.id || null;
            // Obiex settles the bank payout asynchronously and confirms via webhook (see
            // updateObiexWithdrawal) — an accepted submission ("approved"/"pending") is NOT
            // final completion, unlike Korapay which can return an immediate success.
            isComplete = false;
            providerMetadata = { provider: 'obiex', obiex_withdraw_id: providerReference, obiex_reference: reference, obiex_status: transferStatus };

            logger.info(`[Transfer] Obiex response for ${reference}: status=${transferStatus}`);
        } else {
            logger.info(`[Transfer] Initiating Korapay payout: ${reference} → ${account_name} (${bank_code}/${account_number}) ${transferCurrency} ${amountValue}`);

            const transferData = await korapay.disburse({
                reference,
                amount: amountValue,
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
                destination: `${account_name} — ${bank_name || bank_code} (${account_number})`,
                destinationLabel: 'bank account',
            });
        }

        res.status(200).json({
            success: true,
            message: `Transfer initiated successfully! Reference: ${reference}`,
            data: {
                reference,
                status: isComplete ? 'completed' : 'processing',
                amount: amountValue,
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
            destination: `${account_name} — ${bank_name || bank_code} (${account_number})`,
            destinationLabel: 'bank account',
        });

        throw new AppError(friendlyMessage, providerErr.statusCode || 502);
    }
});

// ─────────────────────────────────────────────
// POST /transfers/verify  — poll the payout provider's status and reconcile it
// (lets a "Processing" transfer resolve itself without waiting on the webhook).
// ─────────────────────────────────────────────
export const verifyTransfer = catchAsync(async (req, res) => {
    const reference = req.body.reference || req.params.reference;
    if (!reference) throw new AppError('reference is required', 400);

    const txRes = await query(
        `SELECT id, user_id, from_wallet_id, from_amount, from_currency, status, metadata
         FROM transactions
         WHERE reference = $1 AND transaction_type = 'bank_transfer'`,
        [reference]
    );
    if (txRes.rows.length === 0) throw new AppError('Transfer not found', 404);
    const tx = txRes.rows[0];
    if (tx.user_id !== req.user.id) throw new AppError('Unauthorized', 403);

    // Already finalised — nothing to poll.
    if (['completed', 'failed'].includes(tx.status)) {
        return res.status(200).json({ success: true, data: { reference, status: tx.status } });
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
                return res.status(200).json({ success: true, data: { reference, status: tx.status, pending: true } });
            }
            const result = await obiex.getTransactionById(obiexWithdrawId);
            providerStatus = String(result?.payout?.status || result?.status || '').toLowerCase();
        } else {
            const result = await korapay.getDisbursementStatus(reference);
            providerStatus = (result.status || '').toLowerCase();
        }
        logger.info(`[Transfer] verify ${reference}: provider status = ${providerStatus || 'unknown'}`);
    } catch (err) {
        const message = isObiex ? (err.message || 'unknown error') : getKorapayErrorDetails(err).message;
        logger.warn(`[Transfer] verify ${reference} provider query failed: ${message}`);
        // Couldn't reach the provider — leave the transaction as-is.
        return res.status(200).json({ success: true, data: { reference, status: tx.status, pending: true } });
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
            notifyPayout(req.user.id, {
                success: true,
                amount: tx.from_amount,
                currency: tx.from_currency,
                reference,
            });
        }
        return res.status(200).json({ success: true, data: { reference, status: 'completed' } });
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
            notifyPayout(req.user.id, {
                success: false,
                amount: tx.from_amount,
                currency: tx.from_currency,
                reference,
                reason: 'Payout failed at provider — funds returned',
            });
        }
        return res.status(200).json({ success: true, data: { reference, status: 'failed' } });
    }

    // Still processing.
    return res.status(200).json({ success: true, data: { reference, status: 'processing' } });
});

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
