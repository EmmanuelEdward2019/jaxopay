import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import QuidaxAdapter from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import { getSpendableBalance } from '../utils/walletBalance.js';

// ─────────────────────────────────────────────
// GET /transfers/banks  — ALL banks from Quidax live API
// ─────────────────────────────────────────────
export const listBanks = catchAsync(async (req, res) => {
    const currency = req.query.currency || 'NGN';

    try {
        const banks = await QuidaxAdapter.getBanks(currency);
        logger.info(`[Transfer] Fetched ${banks?.length || 0} banks from Quidax (currency=${currency})`);

        if (!banks || banks.length === 0) {
            throw new AppError('No banks returned. Please try again.', 503);
        }

        res.status(200).json({ success: true, data: banks, total: banks.length });

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

        logger.warn(`[Transfer] Quidax bank list failed: ${err.message}`);
        return res.status(200).json({ success: true, data: fallbackBanks, total: fallbackBanks.length, fallback: true });
    }
});

// ─────────────────────────────────────────────
// POST /transfers/resolve  — verify bank account name
// ─────────────────────────────────────────────
export const resolveAccount = catchAsync(async (req, res) => {
    const { bank_code, account_number, currency = 'NGN' } = req.body;
    if (!bank_code || !account_number) {
        throw new AppError('bank_code and account_number are required', 400);
    }

    try {
        const data = await QuidaxAdapter.verifyBankAccount(account_number, bank_code);
        res.status(200).json({
            success: true,
            data: {
                account_name: data?.account_name || data?.name,
                bank_name: data?.bank_name,
                account_number: data?.account_number || account_number,
                bank_code: data?.bank_code || bank_code,
            }
        });
    } catch (err) {
        logger.error(`[Transfer] Quidax account resolve failed: ${err.message}`);

        if (process.env.NODE_ENV === 'production') {
            throw new AppError(`Could not verify bank account: ${err.message}`, 502);
        }

        // Return mock data only outside production so local testing is not blocked.
        res.status(200).json({
            success: true,
            data: {
                account_name: "Mock Fallback User",
                bank_name: "Mock Bank",
                account_number: account_number,
                bank_code: bank_code,
            }
        });
    }
});

// ─────────────────────────────────────────────
// POST /transfers/send  — initiate bank transfer via Quidax
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

    // Supported fiat withdrawal currencies by Quidax
    const DISBURSE_SUPPORTED = new Set(['NGN', 'GHS']);
    if (!DISBURSE_SUPPORTED.has(transferCurrency)) {
        throw new AppError(
            `Bank transfers in ${transferCurrency} are not currently available via Quidax. Supported: NGN, GHS.`,
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

    // 2. Call Quidax API
    try {
        logger.info(`[Transfer] Adding fiat bank account to Quidax for user...`);
        // First add the bank account to get the fund_uid
        const beneficiary = await QuidaxAdapter.addFiatBankAccount('me', {
            currency: transferCurrency,
            bank_code: bank_code,
            account_number: account_number,
            account_name: account_name
        });
        const fund_uid = beneficiary.id;

        logger.info(`[Transfer] Initiating Quidax payout: ${reference} → ${account_name} (${bank_code}/${account_number}) ${transferCurrency} ${amountValue}`);

        const transferData = await QuidaxAdapter.withdraw({
            userId: 'me', // Withdraw from master wallet for fiat? Or sub-user? If user's wallet is aggregated in Jaxopay DB, we withdraw from master wallet.
            currency: transferCurrency,
            amount: amountValue,
            fund_uid: fund_uid,
            reference: reference,
            transaction_note: narration || `Transfer to ${account_name} via Jaxopay`
        });

        const transferStatus = transferData?.status || 'processing';

        logger.info(`[Transfer] Quidax response for ${reference}: ${transferStatus}`);

        // If immediately successful, release lockings and complete transaction
        if (['success', 'successful', 'completed'].includes(transferStatus?.toLowerCase())) {
            await transaction(async (client) => {
                await client.query(
                    `UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE reference = $1`,
                    [reference]
                );
            });
        }

        res.status(200).json({
            success: true,
            message: `Transfer initiated successfully! Reference: ${reference}`,
            data: {
                reference,
                status: transferStatus,
                amount: amountValue,
                currency: transferCurrency,
                recipient: { account_name, account_number, bank_name, bank_code },
                provider_reference: transferData?.id || null,
            },
        });

    } catch (quidaxErr) {
        // Quidax request failed — reverse the locked funds
        logger.error(`[Transfer] Quidax disburse failed: ${quidaxErr.message}`);

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
                `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE reference = $1`,
                [reference]
            );
        });

        throw new AppError(`Failed to process transfer: ${quidaxErr.message}`, 502);
    }
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
// GET /transfers/merchant-balances  — Quidax merchant balances (admin only)
// ─────────────────────────────────────────────
export const getMerchantBalances = catchAsync(async (req, res) => {
    try {
        const wallets = await QuidaxAdapter.getUserWallets();
        // filter only fiat or map it
        const balances = wallets.map(w => ({
            currency: w.currency.toUpperCase(),
            balance: w.balance,
            available: w.balance,
        }));
        res.status(200).json({ success: true, data: balances });
    } catch (err) {
        logger.error('[Transfer] Merchant balance check failed:', err.message);
        throw new AppError(
            err.message || 'Could not fetch merchant balances',
            err.statusCode || 500
        );
    }
});
