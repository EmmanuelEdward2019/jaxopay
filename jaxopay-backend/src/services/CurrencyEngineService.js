import { query, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import yellowCard from '../orchestration/adapters/fx/YellowCardService.js';
import { sendTransactionEmails } from './email.service.js';
import { getFeeConfig, computeFee } from './feeConfig.service.js';

/** Human label for a ramp's fx_transactions.type — onramp buys crypto with fiat, offramp sells it. */
function rampTypeLabel(type) {
    if (type === 'crypto_onramp') return 'Crypto Buy';
    if (type === 'crypto_offramp') return 'Crypto Sell';
    return 'Crypto Ramp';
}

/** Fire a receipt email for a swap/ramp result — best-effort, never blocks the caller. */
async function notifyRampResult(userId, { type, amount, currency, reference, status, details }) {
    try {
        const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [userId]
        );
        if (userRes.rows.length > 0) {
            sendTransactionEmails({ type, amount, currency, reference, status, details }, userRes.rows[0])
                .catch((e) => logger.error('[ramp] notification email error:', e.message));
        }
    } catch (e) {
        logger.error('[ramp] notify error:', e.message);
    }
}

// Cross-border FX/payments provider — Yellow Card.
const FX_PROVIDER_NAME = 'yellowcard';
const fx = yellowCard;

/**
 * Turn Yellow Card's raw amount-cap error ("amount must be less than 3635 USD") into a clear
 * message. In sandbox this cap is applied to the RAW amount (not the USD value), so a tiny NGN
 * amount can trip it — we explain that and name the limit. Returns null if it doesn't match.
 */
function mapYcAmountError(rawMsg) {
    const m = /amount must be less than\s+([\d,.]+)/i.exec(String(rawMsg || ''));
    if (!m) return null;
    const limit = m[1];
    if (/sandbox/i.test(process.env.YELLOWCARD_BASE_URL || '')) {
        return `Amount too high for the test environment. Yellow Card's sandbox caps each transaction at about ${limit} — applied to the raw amount, not the USD value — so please use a smaller amount (under ~3,600 NGN) while testing.`;
    }
    return `This amount exceeds the current per-transaction limit of ${limit}. Please enter a smaller amount.`;
}

class CurrencyEngineService {
    async getRate(fromCurrency, toCurrency) {
        fromCurrency = fromCurrency.toUpperCase();
        toCurrency = toCurrency.toUpperCase();

        try {
            // 1. Fetch from the active FX provider (Yellow Card)
            const rateData = await fx.getExchangeRate(fromCurrency, toCurrency);

            if (!rateData || !rateData.rate) {
                throw new AppError('RATE_UNAVAILABLE', 400);
            }

            return rateData;
        } catch (error) {
            logger.error('[CurrencyEngine] Failed to fetch rate', error.message);
            // 2. Here we could retry or fallback to Korapay FX
            throw new AppError('RATE_UNAVAILABLE', 503);
        }
    }

    async swapCurrency(userId, fromCurrency, toCurrency, amount) {
        if (amount <= 0) throw new AppError('Invalid amount', 400);

        // This is the Yellow Card swap — Nigerian users need both BVN and NIN verified first.
        await this.assertNigerianId(userId);

        const result = await transaction(async (client) => {
            // 1. Fetch Wallets
            const wallets = await client.query(
                `SELECT id, currency, balance FROM wallets 
         WHERE user_id = $1 AND currency IN ($2, $3) AND is_active = true 
         FOR UPDATE`,
                [userId, fromCurrency, toCurrency]
            );

            const fromWallet = wallets.rows.find(w => w.currency === fromCurrency);
            let toWallet = wallets.rows.find(w => w.currency === toCurrency);

            if (!fromWallet) throw new AppError(`No active ${fromCurrency} wallet found. Fund it first.`, 404);

            if (parseFloat(fromWallet.balance) < amount) {
                throw new AppError('Insufficient funds for this swap.', 400);
            }

            // Auto-create the destination wallet if the user doesn't have one yet
            // (so USDT/USDC ↔ fiat swaps work without pre-provisioning wallets).
            if (!toWallet) {
                const CRYPTO = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'TRX', 'LTC', 'DOGE', 'ADA', 'DOT'];
                const walletType = CRYPTO.includes(toCurrency) ? 'crypto' : 'fiat';
                const created = await client.query(
                    `INSERT INTO wallets (user_id, currency, wallet_type, balance, available_balance, is_active)
                     VALUES ($1, $2, $3, 0, 0, true)
                     ON CONFLICT (user_id, currency) DO UPDATE SET is_active = true
                     RETURNING id, currency, balance`,
                    [userId, toCurrency, walletType]
                );
                toWallet = created.rows[0];
            }

            // 2. Get Exchange Rate
            const rateData = await this.getRate(fromCurrency, toCurrency);
            const rate = parseFloat(rateData.rate);
            const rawConvertedAmount = amount * rate;

            // Platform spread — taken from the credited (destination) side, same convention as
            // the crypto swap spread. 0% until an admin sets a real value in Rates & Fees.
            const swapFeeCfg = await getFeeConfig('yc_currency_swap', toCurrency);
            const platformFee = computeFee(swapFeeCfg, rawConvertedAmount);
            const convertedAmount = Math.max(0, rawConvertedAmount - platformFee);

            // 3. Debit / Credit Wallets internally first
            await client.query(
                `UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
                [amount, fromWallet.id]
            );

            await client.query(
                `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
                [convertedAmount, toWallet.id]
            );

            // 4. Create FX Transaction DB record
            const fxTxn = await client.query(
                `INSERT INTO fx_transactions
         (user_id, provider, type, from_currency, to_currency, amount, converted_amount, exchange_rate, fee_amount, status)
         VALUES ($1, '${FX_PROVIDER_NAME}', 'swap', $2, $3, $4, $5, $6, $7, 'PROCESSING')
         RETURNING id`,
                [userId, fromCurrency, toCurrency, amount, convertedAmount, rate, platformFee]
            );

            const txnId = fxTxn.rows[0].id;

            let providerStatus = 'SUCCESS';
            let providerTxnId = null;

            // 5. Call the FX provider (Failover & Retry handling)
            try {
                let attempts = 0;
                let success = false;
                let providerRes;

                while (attempts < 3 && !success) {
                    try {
                        providerRes = await fx.swapCurrency({
                            fromCurrency,
                            toCurrency,
                            amount,
                            userId
                        });
                        success = true;
                    } catch (e) {
                        attempts++;
                        if (attempts >= 3) throw e;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }

                providerTxnId = providerRes.id || `MOCK-${Date.now()}`;
            } catch (providerError) {
                logger.error('[CurrencyEngine] Swap Failed at Provider', providerError.message);
                providerStatus = 'FAILED';
                // A full implementation might queue for reconciliation or reverse internally 
                // For simplicity, we flag as FAILED but keep internal swap valid (pretending Jaxopay absorbed risk)
            }

            // 6. Update FX Transaction
            await client.query(
                `UPDATE fx_transactions SET status = $1, provider_txn_id = $2 WHERE id = $3`,
                [providerStatus, providerTxnId, txnId]
            );

            return {
                transactionId: txnId,
                fromCurrency,
                toCurrency,
                amount,
                convertedAmount,
                rate,
                fee: platformFee,
                status: providerStatus
            };
        });

        // The internal wallet swap is authoritative regardless of the provider call's outcome
        // (see the comment above — JAXOPAY absorbs the provider-side risk), so the user's own
        // wallets did change either way; notify accordingly.
        notifyRampResult(userId, {
            type: 'Swap', amount: result.convertedAmount, currency: toCurrency,
            reference: result.transactionId, status: 'completed', details: `Currency Swap: ${fromCurrency} → ${toCurrency}`,
        });

        return result;
    }

    /**
     * Preview the fee sendInternationalPayment will actually charge, without moving any money —
     * read-only, so both frontends can disclose "Fee: X%" / "You'll pay: Y" before the user
     * confirms. Deliberately mirrors sendInternationalPayment's own fee-then-convert steps exactly
     * (same getFeeConfig/computeFee, same getRate call), so this can never drift out of sync with
     * what gets charged — no fee math duplicated on the client.
     */
    async getInternationalTransferFeeQuote(fromCurrency, targetCurrency, amount) {
        const intlFeeCfg = await getFeeConfig('yc_international_transfer', fromCurrency);
        const fee = computeFee(intlFeeCfg, amount);
        const totalDebit = amount + fee;

        let convertedAmount = amount;
        let rate = 1;
        if (fromCurrency !== targetCurrency) {
            const rateData = await this.getRate(fromCurrency, targetCurrency);
            rate = parseFloat(rateData.rate);
            convertedAmount = amount * rate;
        }
        return {
            rate,
            convertedAmount, // full, undiminished — what the recipient receives
            fee,
            feePercent: intlFeeCfg?.fee_type === 'percentage' ? Number(intlFeeCfg.fee_value) : null,
            totalDebit, // amount + fee — what gets deducted from the sender's wallet
            fromCurrency,
            targetCurrency,
        };
    }

    async sendInternationalPayment(userId, payload) {
        const {
            fromCurrency, amount, targetCurrency, recipientName, recipientBank, accountNumber, recipientCountry,
            networkId, networkName, networkAccountType, networkChannelIds,
        } = payload;

        // Nigerian users must have both BVN and NIN verified before any Yellow Card-routed
        // transaction. No-op for non-Nigerian profiles.
        await this.assertNigerianId(userId);

        // Remitter (sender) details required by Yellow Card, from the user's profile + KYC.
        const sender = await this._buildSender(userId);

        // Platform fee — a percentage of the amount being sent, charged ON TOP of the sender's
        // debit (not deducted from the payout): the recipient always receives the full converted
        // amount, undiminished, and the sender pays `amount + fee` from their own wallet. 0% until
        // an admin sets a real value in Rates & Fees.
        const intlFeeCfg = await getFeeConfig('yc_international_transfer', fromCurrency);
        const platformFee = computeFee(intlFeeCfg, amount);
        const totalDebit = amount + platformFee;

        // Convert BEFORE opening a DB transaction — never hold a pooled connection
        // during external API calls (that caused 502s on the server).
        let convertedAmount = amount;
        let rate = 1;
        if (fromCurrency !== targetCurrency) {
            const rateData = await this.getRate(fromCurrency, targetCurrency);
            rate = parseFloat(rateData.rate);
            convertedAmount = amount * rate;
        }

        // 1) Short transaction: lock + debit the wallet (amount + fee), record a PROCESSING fx tx.
        // No external calls inside here.
        const record = await transaction(async (client) => {
            const w = await client.query(
                `SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = $2 AND is_active = true FOR UPDATE`,
                [userId, fromCurrency]
            );
            if (w.rows.length === 0) throw new AppError(`No active ${fromCurrency} wallet found`, 404);
            const balance = parseFloat(w.rows[0].balance);
            if (balance < totalDebit) {
                throw new AppError(
                    platformFee > 0
                        ? `Insufficient balance. Sending ${amount} ${fromCurrency} plus a ${platformFee.toFixed(2)} ${fromCurrency} transfer fee requires ${totalDebit.toFixed(2)} ${fromCurrency}, but your balance is ${balance.toFixed(2)} ${fromCurrency}.`
                        : 'Insufficient funds for this transfer.',
                    400
                );
            }

            await client.query(
                `UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
                [totalDebit, w.rows[0].id]
            );

            const fxTxn = await client.query(
                `INSERT INTO fx_transactions
          (user_id, provider, type, from_currency, to_currency, amount, converted_amount, exchange_rate, fee_amount, recipient_details, status)
          VALUES ($1, '${FX_PROVIDER_NAME}', 'international_payment', $2, $3, $4, $5, $6, $7, $8, 'PROCESSING')
          RETURNING id`,
                [userId, fromCurrency, targetCurrency, amount, convertedAmount, rate, platformFee, JSON.stringify({
                    name: recipientName, bank: networkName || recipientBank, account: accountNumber, country: recipientCountry, networkId
                })]
            );
            return { txnId: fxTxn.rows[0].id, walletId: w.rows[0].id };
        });

        // 2) Call the provider (Yellow Card) OUTSIDE any DB transaction. Payout is in the DESTINATION currency.
        let providerStatus = 'PROCESSING';
        let providerTxnId = null;
        let providerError = null;
        try {
            const res = await fx.sendInternationalPayment({
                amount: convertedAmount,
                currency: targetCurrency,
                destinationCountry: recipientCountry,
                recipientName,
                accountNumber,
                networkId,
                networkName,
                networkAccountType,
                networkChannelIds,
                sender,
                customerUID: String(userId),
                reason: 'other',
            });
            providerStatus = res.status || 'SUCCESS';
            providerTxnId = res.id || null;
        } catch (error) {
            logger.error('[CurrencyEngine] Transfer failed at provider:', error.message || error);
            providerError = error.message || 'Transfer failed at provider';
            providerStatus = 'FAILED';
        }

        // 3) Reconcile (short queries). Refund the FULL debit (amount + fee) on failure — the fee
        // was collected up front, not deducted from the payout, so it must come back too.
        if (providerStatus === 'FAILED') {
            await transaction(async (client) => {
                await client.query(`UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2`, [totalDebit, record.walletId]);
                await client.query(`UPDATE fx_transactions SET status = 'FAILED' WHERE id = $1`, [record.txnId]);
            });
            notifyRampResult(userId, {
                type: 'International Transfer', amount: totalDebit, currency: fromCurrency,
                reference: record.txnId, status: 'failed',
                details: `International Transfer to ${recipientName} (${recipientCountry}) — Failed: ${providerError || 'Transfer failed at provider'}. Your wallet has been refunded ${totalDebit.toFixed(2)} ${fromCurrency}.`,
            });
            throw new AppError(providerError || 'International transfer failed. Your wallet has been refunded.', 400);
        }

        await query(
            `UPDATE fx_transactions SET status = $1, provider_txn_id = $2 WHERE id = $3`,
            [providerStatus, providerTxnId, record.txnId]
        );

        notifyRampResult(userId, {
            type: 'International Transfer', amount: convertedAmount, currency: targetCurrency,
            reference: record.txnId, status: 'completed',
            details: `International Transfer to ${recipientName} (${recipientCountry}) via ${networkName || recipientBank || 'bank'} — Account ${accountNumber}`,
        });

        return { transactionId: record.txnId, status: providerStatus, amount, fee: platformFee, totalDebit, convertedAmount };
    }

    // ── Payment Collection (receive money from a payer abroad, Yellow Card /receive) ──
    //
    // Structurally simpler than swap/transfer/ramp: there is no pre-debit, so there is no
    // refund-on-failure path — resolution is purely additive (credit on success, no-op on
    // failure/expiry). The fee is deducted from what the user is credited, not added on top:
    // unlike international transfer there's no second party's payout to protect from a
    // deduction — the JAXOPAY user IS the recipient, so they simply bear the fee directly.

    // Collected funds always settle to a stablecoin balance (not the user's local fiat wallet) —
    // matches Yellow Card's own "hold in USD stablecoins, protect against local devaluation" model,
    // and the existing crypto ramp's internal-credit pattern. The user later swaps to local
    // currency or withdraws externally using the ALREADY-EXISTING Currency Swap / crypto withdraw
    // features — Payment Collection's own job stops at crediting the stablecoin wallet.
    static COLLECTION_STABLECOINS = ['USDT', 'USDC'];

    /**
     * Preview the fee submitPaymentCollection will actually charge, without submitting anything —
     * mirrors getInternationalTransferFeeQuote's role. amountLocal is what the user wants to
     * receive, in their OWN stablecoin wallet (userCurrency — 'USDT' or 'USDC').
     */
    async getPaymentCollectionFeeQuote(userCurrency, amountLocal) {
        if (!CurrencyEngineService.COLLECTION_STABLECOINS.includes(String(userCurrency || '').toUpperCase())) {
            throw new AppError('userCurrency must be USDT or USDC', 400);
        }
        const feeCfg = await getFeeConfig('yc_payment_collection', userCurrency);
        const fee = computeFee(feeCfg, Number(amountLocal));
        const netAmount = Math.max(0, Number(amountLocal) - fee);
        return {
            amount: Number(amountLocal),
            fee,
            feePercent: feeCfg?.fee_type === 'percentage' ? Number(feeCfg.fee_value) : null,
            netAmount,
            userCurrency,
        };
    }

    /**
     * Build Yellow Card's `recipient` (payer KYC) object for a payment collection. Verified
     * against sandbox: Yellow Card silently requires BOTH BVN and NIN for a Nigerian payer
     * (idType/idNumber = bvn, additionalIdType/additionalIdNumber = nin) — a single ID is
     * rejected with a generic "Full KYC information is required" error, exactly mirroring the
     * same undocumented quirk _buildSender already works around for the JAXOPAY user's OWN
     * identity. Kept in one place here rather than duplicated in the web/RN forms.
     */
    _buildCollectionRecipient(payer, payerCountry) {
        const country = String(payerCountry || '').toUpperCase().slice(0, 2);
        const recipient = {
            name: payer?.name,
            country,
            address: payer?.address || 'N/A',
            dob: payer?.dob,
            email: payer?.email,
            phone: this._toE164(payer?.phone, country),
        };
        if (country === 'NG') {
            if (!payer?.bvn || !payer?.nin) {
                throw new AppError("The payer's BVN and NIN are both required for Nigerian payers.", 400);
            }
            recipient.idType = 'bvn';
            recipient.idNumber = payer.bvn;
            recipient.additionalIdType = 'nin';
            recipient.additionalIdNumber = payer.nin;
        } else {
            if (!payer?.idType || !payer?.idNumber) {
                throw new AppError("The payer's ID type and number are required.", 400);
            }
            recipient.idType = payer.idType;
            recipient.idNumber = payer.idNumber;
        }
        return recipient;
    }

    /**
     * Submit a receive request: JAXOPAY collects money FROM a payer abroad on the user's behalf.
     * The user specifies how much they want to receive in their OWN wallet currency; we convert
     * that (gross, before our fee) to USD to tell Yellow Card how much to collect from the payer,
     * and store the fee-deducted net amount (already in userCurrency) so reconciliation can credit
     * it directly with no further conversion — see reconcilePaymentCollection. For a momo channel,
     * the "source account" IS the payer's phone number (verified against sandbox — a placeholder
     * account number is rejected as not being international-format), so we derive it from
     * payer.phone rather than asking the frontend to collect it twice.
     * @param {object} payload userCurrency('USDT'|'USDC' — the stablecoin credited), amountLocal,
     *   payerCountry, payerCurrency, channelType('bank'|'momo'),
     *   payer {name,address,dob,email,phone,idType?,idNumber?,bvn?,nin?},
     *   networkId (bank or momo network to route through), accountNumber (payer's bank account
     *   number — required only for channelType 'bank'; momo uses payer.phone instead)
     */
    async submitPaymentCollection(userId, payload) {
        const { userCurrency, amountLocal, payerCountry, payerCurrency, channelType, payer, networkId, accountNumber } = payload;
        if (!CurrencyEngineService.COLLECTION_STABLECOINS.includes(String(userCurrency || '').toUpperCase())) {
            throw new AppError('userCurrency must be USDT or USDC', 400);
        }
        if (!(Number(amountLocal) > 0)) throw new AppError('Invalid amount', 400);
        if (!['bank', 'momo'].includes(channelType)) throw new AppError('channelType must be bank or momo', 400);
        if (!payerCountry || !payerCurrency) throw new AppError('Payer country and currency are required', 400);
        if (!payer?.name || !payer?.phone || !payer?.email) throw new AppError('Payer details are incomplete', 400);
        if (channelType === 'bank' && !accountNumber) throw new AppError("The payer's bank account number is required", 400);

        // Nigerian users must have both BVN and NIN verified before any Yellow Card-routed
        // transaction — same gate every other cross-border method in this file uses.
        await this.assertNigerianId(userId);

        const recipient = this._buildCollectionRecipient(payer, payerCountry);
        const source = channelType === 'momo'
            ? { accountType: 'momo', accountNumber: recipient.phone, networkId }
            : { accountType: 'bank', accountNumber, networkId };

        const feeCfg = await getFeeConfig('yc_payment_collection', userCurrency);
        const fee = computeFee(feeCfg, Number(amountLocal));
        const netLocal = Math.max(0, Number(amountLocal) - fee);

        const rateData = await this.getRate(userCurrency, 'USD');
        const rate = parseFloat(rateData.rate);
        const usdAmount = Number((Number(amountLocal) * rate).toFixed(2));

        let res;
        try {
            res = await fx.submitReceiveRequest({
                payerCountry, payerCurrency, channelType, usdAmount,
                payer: recipient, source, customerUID: String(userId), reason: 'other',
            });
        } catch (e) {
            throw new AppError(mapYcAmountError(e.message) || e.message || 'Could not submit the payment collection request.', e.statusCode || 400);
        }

        const insertRes = await query(
            `INSERT INTO fx_transactions
             (user_id, provider, type, from_currency, to_currency, amount, converted_amount, exchange_rate, fee_amount, provider_txn_id, recipient_details, status)
             VALUES ($1,'${FX_PROVIDER_NAME}','payment_collection',$2,$3,$4,$5,$6,$7,$8,$9,'PENDING') RETURNING id`,
            [userId, payerCurrency, userCurrency, amountLocal, netLocal, rate, fee, String(res.id),
                JSON.stringify({ payer: recipient, channelType, sequenceId: res.sequenceId, bankInfo: res.bankInfo, reference: res.reference, expiresAt: res.expiresAt, usdAmount })]
        );
        const txnId = insertRes.rows[0].id;

        return {
            transactionId: txnId, status: 'PENDING', channelType,
            amount: Number(amountLocal), fee, netAmount: netLocal, userCurrency,
            bankInfo: res.bankInfo, reference: res.reference, expiresAt: res.expiresAt,
        };
    }

    /**
     * Reconcile a payment collection against Yellow Card's authoritative status:
     *  - completed → credit the user's wallet with the already-computed, fee-deducted
     *    converted_amount (no re-conversion needed — see submitPaymentCollection) + mark COMPLETED.
     *  - failed/expired → mark terminal. No refund — nothing was ever debited.
     * Idempotent (row lock + terminal-status guard, same pattern as reconcileYcPayment/reconcileRamp).
     */
    async reconcilePaymentCollection(idOrRef) {
        if (!idOrRef) return null;
        const row = (await query(
            `SELECT id, user_id, to_currency, converted_amount, status, provider_txn_id FROM fx_transactions
             WHERE type = 'payment_collection' AND (provider_txn_id = $1 OR id::text = $1)
             ORDER BY created_at DESC LIMIT 1`,
            [String(idOrRef)]
        )).rows[0];
        if (!row) return null;

        const TERMINAL = ['FAILED', 'COMPLETED', 'EXPIRED'];
        if (TERMINAL.includes(String(row.status).toUpperCase())) return row.status;
        if (!row.provider_txn_id) return row.status;

        let ycStatus;
        try {
            const s = await fx.checkReceiveStatus(row.provider_txn_id);
            ycStatus = String(s?.status || '').toUpperCase();
        } catch (e) {
            logger.warn('[collection reconcile] status fetch failed:', e.message);
            return null;
        }

        const FAILED = ['FAILED', 'CANCELLED', 'CANCELED', 'REJECTED', 'DECLINED'];
        const DONE = ['COMPLETE', 'COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'PAID', 'PROCESSED', 'SETTLED'];

        if (DONE.includes(ycStatus)) {
            const credited = Number(row.converted_amount) || 0;
            if (!(credited > 0)) {
                logger.error(`[collection reconcile] Refusing to complete ${row.id}: converted_amount is ${row.converted_amount}`);
                return row.status;
            }
            await transaction(async (client) => {
                const cur = (await client.query('SELECT status FROM fx_transactions WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
                if (TERMINAL.includes(String(cur?.status).toUpperCase())) return;
                // Always a stablecoin wallet — see COLLECTION_STABLECOINS / submitPaymentCollection.
                await client.query(
                    `INSERT INTO wallets (user_id, currency, wallet_type, balance, available_balance, is_active)
                     VALUES ($1,$2,'crypto',$3,$3,true)
                     ON CONFLICT (user_id,currency) DO UPDATE SET balance = wallets.balance + $3, available_balance = COALESCE(wallets.available_balance,0) + $3, is_active = true, updated_at = NOW()`,
                    [row.user_id, row.to_currency, credited]
                );
                await client.query(`UPDATE fx_transactions SET status = 'COMPLETED' WHERE id = $1`, [row.id]);
            });
            logger.info(`[collection reconcile] ${row.provider_txn_id} → COMPLETED, credited ${credited} ${row.to_currency} to user ${row.user_id}`);
            notifyRampResult(row.user_id, {
                type: 'Payment Collection', amount: credited, currency: row.to_currency,
                reference: row.id, status: 'completed', details: `Payment Collection: received ${credited} ${row.to_currency}`,
            });
            return 'COMPLETED';
        }

        if (FAILED.includes(ycStatus) || ycStatus === 'EXPIRED') {
            const finalStatus = ycStatus === 'EXPIRED' ? 'EXPIRED' : 'FAILED';
            await query(`UPDATE fx_transactions SET status = $1 WHERE id = $2 AND status NOT IN ('COMPLETED','FAILED','EXPIRED')`, [finalStatus, row.id]);
            return finalStatus;
        }
        return ycStatus || row.status; // still pending
    }

    /** Sweep stale PENDING payment collections and reconcile against Yellow Card (safety net for closed screens/missed webhooks). */
    async sweepPendingPaymentCollections(maxAgeMinutes = 2, limit = 50) {
        const rows = (await query(
            `SELECT id FROM fx_transactions
             WHERE type = 'payment_collection' AND status = 'PENDING' AND provider_txn_id IS NOT NULL
               AND created_at < NOW() - ($1 || ' minutes')::interval
             ORDER BY created_at ASC LIMIT $2`,
            [String(maxAgeMinutes), limit]
        )).rows;
        let changed = 0;
        for (const r of rows) {
            const res = await this.reconcilePaymentCollection(r.id).catch(() => null);
            if (res && res !== 'PENDING') changed++;
        }
        if (rows.length) logger.info(`[collection sweep] checked ${rows.length}, resolved ${changed}`);
        return { checked: rows.length, resolved: changed };
    }

    async getWalletBalances() {
        return await fx.getWalletBalances();
    }

    async checkStatus(idOrRef) {
        // Checking status also reconciles: refund on failure, mark completed on success.
        const status = await this.reconcileYcPayment(idOrRef).catch(() => null);
        return { id: idOrRef, status: status || 'PROCESSING' };
    }

    /**
     * Reconcile a Yellow Card payout against its authoritative status:
     *  - failed/cancelled/reversed  → refund the sender's wallet + mark FAILED
     *  - completed/success          → mark COMPLETED
     * Accepts either the fx_transaction id OR the YC provider payment id.
     * Idempotent (only acts while the fx row is still non-terminal). Safe to call
     * from a webhook, a status poll, or a scheduled reconciler.
     */
    async reconcileYcPayment(idOrRef) {
        if (!idOrRef) return null;
        const row = (await query(
            `SELECT id, user_id, from_currency, amount, fee_amount, type, status, provider_txn_id FROM fx_transactions
             WHERE provider_txn_id = $1 OR id::text = $1 ORDER BY created_at DESC LIMIT 1`,
            [String(idOrRef)]
        )).rows[0];
        if (!row) return null;

        // international_payment charges amount + fee up front (the fee is added to the sender's
        // debit, not deducted from the payout) — a refund must return both. Every other fx type
        // (e.g. currency_swap) still deducts its fee from the payout side, so refunding `amount`
        // alone remains correct there; do not widen this to all types without also changing that
        // debit model.
        const refundAmount = row.type === 'international_payment'
            ? parseFloat(row.amount) + parseFloat(row.fee_amount || 0)
            : parseFloat(row.amount);

        const TERMINAL = ['FAILED', 'COMPLETED', 'SUCCESS', 'REVERSED'];
        if (TERMINAL.includes(String(row.status).toUpperCase())) return row.status;
        if (!row.provider_txn_id) return row.status; // never reached the provider — nothing to reconcile

        let ycStatus;
        try {
            const s = await fx.checkTransactionStatus(row.provider_txn_id);
            ycStatus = String(s?.status || '').toUpperCase();
        } catch (e) {
            logger.warn('[YC reconcile] status fetch failed:', e.message);
            return null;
        }

        const FAILED = ['FAILED', 'CANCELLED', 'CANCELED', 'REJECTED', 'DECLINED', 'EXPIRED', 'REVERSED'];
        const DONE = ['COMPLETE', 'COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'PAID', 'PROCESSED', 'SETTLED'];

        if (FAILED.includes(ycStatus)) {
            await transaction(async (client) => {
                // Lock + re-check so a concurrent webhook/poll can't double-refund.
                const cur = (await client.query('SELECT status FROM fx_transactions WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
                if (TERMINAL.includes(String(cur?.status).toUpperCase())) return;
                await client.query(
                    `UPDATE wallets SET balance = balance + $1, available_balance = COALESCE(available_balance,0) + $1, updated_at = NOW()
                     WHERE user_id = $2 AND currency = $3`,
                    [refundAmount, row.user_id, row.from_currency]
                );
                await client.query(`UPDATE fx_transactions SET status = 'FAILED' WHERE id = $1`, [row.id]);
            });
            logger.info(`[YC reconcile] payout ${row.provider_txn_id} FAILED → refunded ${refundAmount} ${row.from_currency} to user ${row.user_id}`);
            return 'FAILED';
        }

        if (DONE.includes(ycStatus)) {
            await query(`UPDATE fx_transactions SET status = 'COMPLETED' WHERE id = $1 AND status NOT IN ('FAILED','REVERSED')`, [row.id]);
            return 'COMPLETED';
        }
        return ycStatus || row.status; // still pending
    }

    /**
     * Sweep stale non-terminal international_payment rows and reconcile against Yellow Card —
     * safety net for a missed webhook, or a transfer that resolves after the frontend's ~17s
     * post-submit poll window has already closed (normal for a real cross-border payout).
     * Confirmed missing 2026-09-01: several real transfers sat at Yellow Card's own initial
     * "created" status indefinitely because nothing ever re-checked them after that window —
     * the crypto ramp and Payment Collection already had an equivalent sweep, this type didn't.
     */
    async sweepPendingInternationalPayments(maxAgeMinutes = 2, limit = 50) {
        const rows = (await query(
            `SELECT id FROM fx_transactions
             WHERE type = 'international_payment' AND status NOT IN ('FAILED','COMPLETED','SUCCESS','REVERSED')
               AND provider_txn_id IS NOT NULL AND created_at < NOW() - ($1 || ' minutes')::interval
             ORDER BY created_at ASC LIMIT $2`,
            [String(maxAgeMinutes), limit]
        )).rows;
        let changed = 0;
        for (const r of rows) {
            const res = await this.reconcileYcPayment(r.id).catch(() => null);
            if (res && !['PENDING', 'PROCESSING', 'CREATED'].includes(String(res).toUpperCase())) changed++;
        }
        if (rows.length) logger.info(`[intl transfer sweep] checked ${rows.length}, resolved ${changed}`);
        return { checked: rows.length, resolved: changed };
    }

    // ── Payout destination metadata (Yellow Card) ───────────────────────────────
    async getPayoutCountries() {
        if (FX_PROVIDER_NAME !== 'yellowcard' || typeof fx.getPayoutCountries !== 'function') return [];
        return await fx.getPayoutCountries();
    }

    async getPayoutNetworks(country) {
        if (!country) throw new AppError('country is required', 400);
        if (FX_PROVIDER_NAME !== 'yellowcard' || typeof fx.getPayoutNetworks !== 'function') return [];
        return await fx.getPayoutNetworks(country);
    }

    /** Supported stablecoins + networks for on/off-ramp (from Yellow Card crypto channels). */
    async getRampOptions(localCurrency = 'NGN') {
        if (FX_PROVIDER_NAME !== 'yellowcard' || typeof fx.getStablecoinRampOptions !== 'function') return [];
        return await fx.getStablecoinRampOptions(localCurrency);
    }

    /** Build the Yellow Card `sender` (remitter) object from the user's profile + KYC. */
    async _buildSender(userId) {
        const prof = (await query(
            `SELECT p.first_name, p.last_name, p.date_of_birth, p.address_line1, p.city, p.country, u.email, u.phone
             FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`,
            [userId]
        )).rows[0] || {};
        const docs = (await query(
            `SELECT document_type, document_number FROM kyc_documents
             WHERE user_id = $1 AND document_number IS NOT NULL ORDER BY created_at DESC`,
            [userId]
        )).rows;
        const kyc = docs[0] || {};

        // Yellow Card requires a real sender identity. A proper first + last name is
        // mandatory (it rejects email fallbacks with "bad sender name").
        const first = String(prof.first_name || '').trim();
        const last = String(prof.last_name || '').trim();
        if (!first || !last) {
            throw new AppError('Please add your full legal name (first and last) in your profile before sending an international transfer.', 400, 'PROFILE_INCOMPLETE');
        }

        let dob = '01/01/1990';
        const d = prof.date_of_birth ? new Date(prof.date_of_birth) : null;
        if (d && !isNaN(d.getTime())) {
            dob = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
        }
        const idt = String(kyc.document_type || '').toLowerCase();
        // Yellow Card rejects 'passport' as the sender idType for NG Direct Settlement/crypto flows
        // ("Passport is not an accepted form of identification in this case" — YC support, 2026-07-17).
        // Only report passport when the doc genuinely is one; default to national_id otherwise.
        const idType = idt.includes('passport') ? 'passport'
            : (idt.includes('driver') || idt.includes('licen')) ? 'license'
                : 'national_id';
        const country = String(prof.country || 'NG').toUpperCase().slice(0, 2);

        const sender = {
            name: `${first} ${last}`,
            country,
            phone: this._toE164(prof.phone, country),
            address: prof.address_line1 || prof.city || 'N/A',
            dob,
            email: prof.email || '',
            idNumber: kyc.document_number || 'N0000000',
            idType,
        };

        // Nigerian senders send BOTH BVN and NIN to Yellow Card, not just one — BVN as the
        // primary idType/idNumber (Yellow Card has specifically flagged BVN as required) and NIN
        // in the additionalIdType/additionalIdNumber slot. Both are asserted as approved by
        // assertNigerianId() before any code path reaches this function, so both should be on
        // file here; the national-ID fallback only applies if NIN somehow isn't found.
        if (country === 'NG') {
            const findDoc = (pred) => docs.find((x) => pred(String(x.document_type || '').toLowerCase()));
            const bvnDoc = findDoc((t) => t.includes('bvn'));
            const ninDoc = findDoc((t) => t.includes('nin'));
            const nationalDoc = findDoc((t) => t.includes('national'));

            if (bvnDoc) {
                sender.idType = 'bvn';
                sender.idNumber = bvnDoc.document_number;
            }
            if (ninDoc) {
                sender.additionalIdType = 'nin';
                sender.additionalIdNumber = ninDoc.document_number;
            } else if (nationalDoc) {
                sender.additionalIdType = 'national_id';
                sender.additionalIdNumber = nationalDoc.document_number;
            }
        }
        return sender;
    }

    /**
     * JAXOPAY's own crypto receiving address for an internal on-ramp (buy), by network. Configure
     * real custody addresses via env for production:
     *   YELLOWCARD_TREASURY_WALLET_<NETWORK>  (e.g. _POLYGON, _TRC20, _ERC20)
     *   YELLOWCARD_TREASURY_EVM               (shared address for all EVM chains)
     *   YELLOWCARD_TREASURY_WALLET            (single fallback)
     * In sandbox, valid-format placeholders are used so buying works out of the box for testing.
     */
    _treasuryWalletFor(network) {
        const net = String(network || '').toUpperCase();
        const EVM = ['POLYGON', 'ERC20', 'BSC', 'BEP20', 'CELO', 'ARBITRUM', 'OPTIMISM', 'BASE', 'AVAXC', 'MATIC'];
        const specific = process.env[`YELLOWCARD_TREASURY_WALLET_${net}`];
        if (specific) return specific.trim();
        if (EVM.includes(net) && process.env.YELLOWCARD_TREASURY_EVM) return process.env.YELLOWCARD_TREASURY_EVM.trim();
        if (process.env.YELLOWCARD_TREASURY_WALLET) return process.env.YELLOWCARD_TREASURY_WALLET.trim();
        // Sandbox-only fallbacks — never used against production Yellow Card.
        if (/sandbox/i.test(process.env.YELLOWCARD_BASE_URL || '')) {
            if (EVM.includes(net)) return '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
            if (net === 'TRC20' || net === 'TRON') return 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';
            if (net === 'SOL' || net === 'SOLANA') return '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
            return '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
        }
        return null;
    }

    /**
     * JAXOPAY's own settlement bank for an internal off-ramp (sell → user's wallet). Yellow Card pays
     * the fiat here, then we credit the user's in-app balance. Configure for production via:
     *   YELLOWCARD_SETTLEMENT_<COUNTRY>_NETWORK_ID / _ACCOUNT / _NAME  (e.g. _NG_NETWORK_ID)
     * In sandbox, falls back to the first available bank payout network + a sandbox-success account.
     */
    async _settlementBankFor(country) {
        const c = String(country || 'NG').toUpperCase();
        const networkId = process.env[`YELLOWCARD_SETTLEMENT_${c}_NETWORK_ID`];
        if (networkId) {
            return {
                networkId: networkId.trim(),
                accountNumber: (process.env[`YELLOWCARD_SETTLEMENT_${c}_ACCOUNT`] || '').trim(),
                recipientName: (process.env[`YELLOWCARD_SETTLEMENT_${c}_NAME`] || 'JAXOPAY').trim(),
                networkName: (process.env[`YELLOWCARD_SETTLEMENT_${c}_BANK`] || '').trim(),
                networkAccountType: 'bank',
            };
        }
        if (/sandbox/i.test(process.env.YELLOWCARD_BASE_URL || '')) {
            try {
                const nets = await fx.getPayoutNetworks(c);
                const bank = (nets || []).find((n) => n.accountType !== 'phone') || (nets || [])[0];
                if (bank) return { networkId: bank.id || bank.code, accountNumber: '1111111111', recipientName: 'JAXOPAY Settlement', networkName: bank.name, networkAccountType: 'bank' };
            } catch (e) { logger.warn(`[ramp] settlement bank resolve failed: ${e.message}`); }
        }
        return null;
    }

    /** Normalize a local phone to E.164 (Yellow Card requires international format). */
    _toE164(phone, country) {
        const CODES = { NG: '234', GH: '233', KE: '254', ZA: '27', UG: '256', TZ: '255', RW: '250', ZM: '260', MW: '265', BW: '267', CM: '237', CI: '225', SN: '221', TG: '228', BF: '226', CD: '243', CG: '242', GB: '44', US: '1' };
        let p = String(phone || '').replace(/[^\d+]/g, '');
        if (!p) return '';
        if (p.startsWith('+')) return p;
        const code = CODES[String(country || 'NG').toUpperCase()] || '234';
        if (p.startsWith('00' + code)) return '+' + p.slice(2);
        if (p.startsWith(code)) return '+' + p;
        if (p.startsWith('0')) p = p.slice(1);
        return '+' + code + p;
    }

    /**
     * Whether a Nigerian user has BOTH BVN and NIN verified — required before any Yellow
     * Card-routed transaction (crypto ramp, NGN deposit, international transfer). BVN is
     * deliberately NOT part of the KYC tier ladder (it doesn't exist outside Nigeria), so this
     * check is separate from tier and only applies when the user's profile country is NG.
     * Returns { country, required, bvnVerified, ninVerified, bvnPending, ninPending, verified }.
     */
    async getNigerianIdStatus(userId) {
        const prof = (await query('SELECT country FROM user_profiles WHERE user_id = $1', [userId])).rows[0] || {};
        const country = String(prof.country || 'NG').toUpperCase().slice(0, 2);
        if (country !== 'NG') {
            return { country, required: false, bvnVerified: true, ninVerified: true, bvnPending: false, ninPending: false, verified: true };
        }
        // Only an APPROVED document unlocks the gate. A submitted-but-unreviewed ID shows as
        // pending (blocked) until SmileID or compliance approves it.
        const rows = (await query(
            `SELECT LOWER(document_type) AS document_type, status::text AS status FROM kyc_documents
             WHERE user_id = $1 AND document_number IS NOT NULL AND (status IS NULL OR status::text <> 'rejected')
               AND (LOWER(document_type) LIKE '%bvn%' OR LOWER(document_type) LIKE '%nin%')`,
            [userId]
        )).rows;
        const bvnRows = rows.filter((r) => r.document_type.includes('bvn'));
        const ninRows = rows.filter((r) => r.document_type.includes('nin'));
        const bvnVerified = bvnRows.some((r) => r.status === 'approved');
        const ninVerified = ninRows.some((r) => r.status === 'approved');
        const bvnPending = !bvnVerified && bvnRows.length > 0;
        const ninPending = !ninVerified && ninRows.length > 0;
        return { country, required: true, bvnVerified, ninVerified, bvnPending, ninPending, verified: bvnVerified && ninVerified };
    }

    /** Throws BVN_NIN_REQUIRED / BVN_NIN_PENDING (403) if a Nigerian user is missing BVN or NIN. */
    async assertNigerianId(userId) {
        const s = await this.getNigerianIdStatus(userId);
        if (!s.required || s.verified) return s;
        const missing = [];
        if (!s.bvnVerified) missing.push('BVN');
        if (!s.ninVerified) missing.push('NIN');
        const anyPending = (s.bvnPending && !s.bvnVerified) || (s.ninPending && !s.ninVerified);
        if (anyPending) {
            throw new AppError(`Your ${missing.join(' and ')} verification is under review. This will unlock once approved.`, 403, 'BVN_NIN_PENDING');
        }
        throw new AppError(`Please verify your ${missing.join(' and ')} first — both are required for Nigerian users before this transaction.`, 403, 'BVN_NIN_REQUIRED');
    }

    /** Back-compat alias — crypto ramp uses the same Nigerian BVN+NIN gate as everything else. */
    async getRampKycStatus(userId) {
        return this.getNigerianIdStatus(userId);
    }

    /** Back-compat alias — see assertNigerianId. */
    async assertRampKyc(userId) {
        return this.assertNigerianId(userId);
    }

    // ── Crypto on/off-ramp (Yellow Card Direct Settlement, manual-ops settlement) ──

    /**
     * OFF-RAMP: sell USDT/USDC → fiat. Debits the user's crypto wallet now; on ops confirmation,
     * internal mode credits the user's fiat wallet (external mode pays the recipient bank).
     * @param {object} p cryptoCurrency, cryptoNetwork, cryptoAmount, mode('internal'|'external'),
     *   destinationCountry='NG', fiatCurrency='NGN', recipientName, accountNumber, networkId,
     *   networkName, networkAccountType, networkChannelIds, refundAddress?
     */
    async cryptoRampWithdraw(userId, p) {
        const mode = p.mode === 'external' ? 'external' : 'internal';
        const cryptoCurrency = String(p.cryptoCurrency || '').toUpperCase();
        const fiatCurrency = String(p.fiatCurrency || 'NGN').toUpperCase();
        const country = String(p.destinationCountry || 'NG').toUpperCase().slice(0, 2);
        const cryptoAmount = Number(p.cryptoAmount);
        if (!cryptoCurrency || !p.cryptoNetwork || !(cryptoAmount > 0)) throw new AppError('Invalid crypto withdrawal request', 400);

        // Where the Naira lands: external → a recipient bank the user provides; internal → the user's
        // own JAXOPAY wallet (Yellow Card settles the fiat into JAXOPAY's own account behind the scenes,
        // so no user bank details are needed).
        let dest;
        if (mode === 'external') {
            if (!p.networkId || !p.accountNumber || !p.recipientName) throw new AppError('Recipient bank details are required', 400);
            dest = { recipientName: p.recipientName, accountNumber: p.accountNumber, networkId: p.networkId, networkAccountType: p.networkAccountType, networkChannelIds: p.networkChannelIds, networkName: p.networkName };
        } else {
            dest = await this._settlementBankFor(country);
            if (!dest) {
                logger.error(`[ramp] No JAXOPAY settlement bank configured for ${country} — set YELLOWCARD_SETTLEMENT_${country}_NETWORK_ID + _ACCOUNT.`);
                throw new AppError('Selling crypto to your wallet is temporarily unavailable. Please try again shortly.', 503, 'RAMP_SETTLEMENT_UNCONFIGURED');
            }
        }

        await this.assertRampKyc(userId);
        const sender = await this._buildSender(userId);

        // 1) short tx: debit the user's crypto wallet + record a PENDING ramp
        const rec = await transaction(async (client) => {
            const w = await client.query(
                `SELECT id, balance FROM wallets WHERE user_id=$1 AND currency=$2 AND is_active=true FOR UPDATE`,
                [userId, cryptoCurrency]
            );
            if (!w.rows.length) throw new AppError(`No active ${cryptoCurrency} wallet found`, 404);
            if (parseFloat(w.rows[0].balance) < cryptoAmount) throw new AppError(`Insufficient ${cryptoCurrency} balance`, 400);
            await client.query(`UPDATE wallets SET balance=balance-$1, updated_at=NOW() WHERE id=$2`, [cryptoAmount, w.rows[0].id]);
            const ins = await client.query(
                `INSERT INTO fx_transactions (user_id, provider, type, from_currency, to_currency, amount, converted_amount, exchange_rate, recipient_details, status)
                 VALUES ($1,'yellowcard','crypto_offramp',$2,$3,$4,0,0,$5,'PENDING') RETURNING id`,
                [userId, cryptoCurrency, fiatCurrency, cryptoAmount, JSON.stringify({ mode, cryptoNetwork: p.cryptoNetwork, recipientName: dest.recipientName, accountNumber: dest.accountNumber, networkName: dest.networkName, country })]
            );
            return { id: ins.rows[0].id, walletId: w.rows[0].id };
        });

        // 2) submit YC off-ramp (outside the tx)
        let res;
        try {
            res = await fx.submitCryptoWithdrawal({
                destinationCountry: country, currency: fiatCurrency,
                recipientName: dest.recipientName, accountNumber: dest.accountNumber, networkId: dest.networkId,
                networkAccountType: dest.networkAccountType, networkChannelIds: dest.networkChannelIds,
                sender, customerUID: String(userId), cryptoCurrency, cryptoNetwork: p.cryptoNetwork,
                cryptoAmount, refundAddress: p.refundAddress,
            });
        } catch (e) {
            await transaction(async (client) => {
                await client.query(`UPDATE wallets SET balance=balance+$1, updated_at=NOW() WHERE id=$2`, [cryptoAmount, rec.walletId]);
                await client.query(`UPDATE fx_transactions SET status='FAILED' WHERE id=$1`, [rec.id]);
            });
            throw new AppError(mapYcAmountError(e.message) || e.message || 'Crypto withdrawal failed. Your balance was refunded.', e.statusCode || 400);
        }

        let convertedFiat = Number(res.raw?.convertedAmount ?? res.raw?.amount ?? 0);
        let rate = Number(res.raw?.rate || 0);
        if (!(convertedFiat > 0)) {
            try {
                const r = await fx.getExchangeRate(cryptoCurrency, fiatCurrency);
                rate = Number(r?.rate) || rate;
                convertedFiat = Number((cryptoAmount * rate).toFixed(2));
            } catch (e) { logger.warn(`[ramp] withdraw rate lookup failed: ${e.message}`); }
        }
        await query(
            `UPDATE fx_transactions SET provider_txn_id=$1, converted_amount=$2, exchange_rate=$3,
             recipient_details = COALESCE(recipient_details,'{}'::jsonb) || $4::jsonb WHERE id=$5`,
            [String(res.id), convertedFiat, rate, JSON.stringify({ walletAddress: res.walletAddress, yc_status: res.status }), rec.id]
        );

        return {
            rampId: rec.id, providerId: res.id, status: 'PENDING', mode,
            cryptoCurrency, cryptoNetwork: p.cryptoNetwork, cryptoAmount,
            fiatCurrency, convertedFiat,
            walletAddress: res.walletAddress, expiresAt: res.expiresAt,
            instruction: `Send ${cryptoAmount} ${cryptoCurrency} on ${p.cryptoNetwork} to ${res.walletAddress}`,
        };
    }

    /**
     * ON-RAMP: buy USDT/USDC with fiat. Debits the user's fiat wallet now; on ops confirmation,
     * internal mode credits the user's crypto wallet (external mode delivers to their wallet address).
     * @param {object} p cryptoCurrency, cryptoNetwork, fiatAmount, mode, fiatCurrency='NGN',
     *   country='NG', walletAddress (external destination; internal uses JAXOPAY's), walletTag?
     */
    async cryptoRampDeposit(userId, p) {
        const mode = p.mode === 'external' ? 'external' : 'internal';
        const cryptoCurrency = String(p.cryptoCurrency || '').toUpperCase();
        const fiatCurrency = String(p.fiatCurrency || 'NGN').toUpperCase();
        const country = String(p.country || 'NG').toUpperCase().slice(0, 2);
        const fiatAmount = Number(p.fiatAmount);
        if (!cryptoCurrency || !p.cryptoNetwork || !(fiatAmount > 0)) throw new AppError('Invalid crypto deposit request', 400);

        // Internal buy → crypto is delivered to JAXOPAY's own treasury wallet (then we credit the
        // user's in-app balance). External buy → the user supplies their own wallet address.
        let walletAddress;
        if (mode === 'external') {
            walletAddress = String(p.walletAddress || '').trim();
            if (!walletAddress) throw new AppError('Please enter the destination wallet address.', 400);
        } else {
            walletAddress = this._treasuryWalletFor(p.cryptoNetwork);
            if (!walletAddress) {
                logger.error(`[ramp] No treasury wallet configured for network ${p.cryptoNetwork} — set YELLOWCARD_TREASURY_WALLET_${String(p.cryptoNetwork).toUpperCase()} (or _EVM).`);
                throw new AppError('Buying crypto is temporarily unavailable. Please try again shortly.', 503, 'RAMP_TREASURY_UNCONFIGURED');
            }
        }

        await this.assertRampKyc(userId);
        const recipient = await this._buildSender(userId); // recipient KYC (same shape)

        // 1) short tx: debit the user's fiat wallet + record PENDING
        const rec = await transaction(async (client) => {
            const w = await client.query(
                `SELECT id, balance FROM wallets WHERE user_id=$1 AND currency=$2 AND is_active=true FOR UPDATE`,
                [userId, fiatCurrency]
            );
            if (!w.rows.length) throw new AppError(`No active ${fiatCurrency} wallet found`, 404);
            if (parseFloat(w.rows[0].balance) < fiatAmount) throw new AppError(`Insufficient ${fiatCurrency} balance`, 400);
            await client.query(`UPDATE wallets SET balance=balance-$1, updated_at=NOW() WHERE id=$2`, [fiatAmount, w.rows[0].id]);
            const ins = await client.query(
                `INSERT INTO fx_transactions (user_id, provider, type, from_currency, to_currency, amount, converted_amount, exchange_rate, recipient_details, status)
                 VALUES ($1,'yellowcard','crypto_onramp',$2,$3,$4,0,0,$5,'PENDING') RETURNING id`,
                [userId, fiatCurrency, cryptoCurrency, fiatAmount, JSON.stringify({ mode, cryptoNetwork: p.cryptoNetwork, walletAddress, country })]
            );
            return { id: ins.rows[0].id, walletId: w.rows[0].id };
        });

        // 2) submit YC on-ramp
        let res;
        try {
            res = await fx.submitCryptoDeposit({
                country, currency: fiatCurrency, amount: fiatAmount, customerUID: String(userId),
                walletAddress, cryptoCurrency, cryptoNetwork: p.cryptoNetwork, walletTag: p.walletTag,
                recipient,
            });
        } catch (e) {
            await transaction(async (client) => {
                await client.query(`UPDATE wallets SET balance=balance+$1, updated_at=NOW() WHERE id=$2`, [fiatAmount, rec.walletId]);
                await client.query(`UPDATE fx_transactions SET status='FAILED' WHERE id=$1`, [rec.id]);
            });
            throw new AppError(mapYcAmountError(e.message) || e.message || 'Crypto deposit failed. Your balance was refunded.', e.statusCode || 400);
        }

        // Yellow Card's collection response echoes a local (fee-adjusted fiat) figure for cryptoAmount
        // in sandbox, so derive the crypto credit from the live rate — the authoritative amount.
        let cryptoAmount = Number(res.cryptoAmount || 0);
        let rate = 0;
        try {
            const r = await fx.getExchangeRate(fiatCurrency, cryptoCurrency);
            rate = Number(r?.rate) || 0;
            const computed = Number((fiatAmount * rate).toFixed(8));
            if (computed > 0) cryptoAmount = computed;
        } catch (e) { logger.warn(`[ramp] deposit rate lookup failed: ${e.message}`); }

        await query(
            `UPDATE fx_transactions SET provider_txn_id=$1, converted_amount=$2, exchange_rate=$3,
             recipient_details = COALESCE(recipient_details,'{}'::jsonb) || $4::jsonb WHERE id=$5`,
            [String(res.id), cryptoAmount, rate, JSON.stringify({ bankInfo: res.bankInfo, yc_status: res.status, yc_cryptoAmount: res.cryptoAmount }), rec.id]
        );

        return {
            rampId: rec.id, providerId: res.id, status: 'PENDING', mode,
            fiatCurrency, fiatAmount, cryptoCurrency, cryptoNetwork: p.cryptoNetwork, cryptoAmount,
            bankInfo: res.bankInfo, walletAddress,
            instruction: res.bankInfo ? `Pay ${fiatAmount} ${fiatCurrency} to ${res.bankInfo.accountName} · ${res.bankInfo.name} · ${res.bankInfo.accountNumber}` : null,
        };
    }

    // Shared credit/refund bodies (used by manual admin actions AND automatic reconciliation).
    async _creditRampDestination(client, r) {
        const details = r.recipient_details || {};
        const credit = Number(r.converted_amount) || 0;
        if (details.mode === 'internal') {
            // Internal mode means the payout is JAXOPAY's own wallet, not an external bank/crypto
            // address — so a missing/zero converted_amount here means we're about to mark this
            // ramp COMPLETED without ever crediting anything. Previously this fell through
            // silently (the `credit > 0` check just skipped the INSERT and the status update
            // still ran unconditionally below) — the transaction showed "Completed" with nothing
            // ever landing in the user's wallet. Refuse instead, so the ramp stays PENDING/retryable
            // and the caller (reconcileRamp's sweep, or the ops confirm action) surfaces the failure
            // instead of silently lying about success.
            if (!(credit > 0)) {
                logger.error(`[ramp] Refusing to complete ramp ${r.id}: internal mode but converted_amount is ${r.converted_amount}`);
                throw new AppError(`Cannot complete ramp: credit amount is ${credit}`, 500, 'RAMP_CREDIT_AMOUNT_INVALID');
            }
            const walletType = r.type === 'crypto_onramp' ? 'crypto' : 'fiat';
            await client.query(
                `INSERT INTO wallets (user_id, currency, wallet_type, balance, available_balance, is_active)
                 VALUES ($1,$2,$3,$4,$4,true)
                 ON CONFLICT (user_id,currency) DO UPDATE SET balance=wallets.balance+$4, available_balance=COALESCE(wallets.available_balance,0)+$4, is_active=true, updated_at=NOW()`,
                [r.user_id, r.to_currency, walletType, credit]
            );
        }
        await client.query(`UPDATE fx_transactions SET status='COMPLETED' WHERE id=$1`, [r.id]);
        return { credited: details.mode === 'internal' ? credit : 0, toCurrency: r.to_currency };
    }

    async _refundRampSource(client, r, reason) {
        const refund = Number(r.amount) || 0;
        const walletType = r.type === 'crypto_onramp' ? 'fiat' : 'crypto'; // source that was debited
        if (refund > 0) {
            await client.query(
                `INSERT INTO wallets (user_id, currency, wallet_type, balance, available_balance, is_active)
                 VALUES ($1,$2,$3,$4,$4,true)
                 ON CONFLICT (user_id,currency) DO UPDATE SET balance=wallets.balance+$4, available_balance=COALESCE(wallets.available_balance,0)+$4, is_active=true, updated_at=NOW()`,
                [r.user_id, r.from_currency, walletType, refund]
            );
        }
        await client.query(
            `UPDATE fx_transactions SET status='FAILED', recipient_details = COALESCE(recipient_details,'{}'::jsonb) || $2::jsonb WHERE id=$1`,
            [r.id, JSON.stringify({ fail_reason: reason })]
        );
        return { refunded: refund, currency: r.from_currency };
    }

    /** Ops manually confirms the settlement leg → credit the destination (internal) + mark COMPLETED. */
    async confirmRampSettlement(rampId) {
        const result = await transaction(async (client) => {
            const r = (await client.query(`SELECT * FROM fx_transactions WHERE id=$1 FOR UPDATE`, [rampId])).rows[0];
            if (!r) throw new AppError('Ramp not found', 404);
            if (String(r.status).toUpperCase() !== 'PENDING') throw new AppError(`Ramp is ${r.status}, not pending`, 400);
            const out = await this._creditRampDestination(client, r);
            return { rampId, status: 'COMPLETED', ...out, userId: r.user_id, rampType: r.type, fromCurrency: r.from_currency };
        });
        notifyRampResult(result.userId, {
            type: rampTypeLabel(result.rampType), amount: result.credited, currency: result.toCurrency,
            reference: rampId, status: 'completed',
            details: `${rampTypeLabel(result.rampType)}: ${result.fromCurrency} → ${result.toCurrency}`,
        });
        return result;
    }

    /** Ops manually rejects a pending ramp → refund the user's source wallet + mark FAILED. */
    async failRampSettlement(rampId, reason = 'settlement_failed') {
        const result = await transaction(async (client) => {
            const r = (await client.query(`SELECT * FROM fx_transactions WHERE id=$1 FOR UPDATE`, [rampId])).rows[0];
            if (!r) throw new AppError('Ramp not found', 404);
            if (String(r.status).toUpperCase() !== 'PENDING') throw new AppError(`Ramp is ${r.status}, not pending`, 400);
            const out = await this._refundRampSource(client, r, reason);
            return { rampId, status: 'FAILED', ...out, userId: r.user_id, rampType: r.type, toCurrency: r.to_currency };
        });
        notifyRampResult(result.userId, {
            type: rampTypeLabel(result.rampType), amount: result.refunded, currency: result.currency,
            reference: rampId, status: 'failed',
            details: `${rampTypeLabel(result.rampType)} Failed: ${reason} (${result.currency} → ${result.toCurrency})`,
        });
        return result;
    }

    /**
     * Automatically reconcile a ramp against Yellow Card's real transaction status (no admin click):
     * YC settled → auto-credit; YC expired/failed/refund → auto-refund. Idempotent. Returns the
     * ramp's current status. Optionally scoped to a userId (returns null if it isn't theirs).
     */
    async reconcileRamp(idOrRef, userId = null) {
        if (!idOrRef) return null;
        const row = (await query(
            `SELECT id, user_id, type, from_currency, to_currency, amount, converted_amount, status, provider_txn_id, recipient_details
             FROM fx_transactions
             WHERE (id::text = $1 OR provider_txn_id = $1) AND type IN ('crypto_onramp','crypto_offramp')
             ORDER BY created_at DESC LIMIT 1`,
            [String(idOrRef)]
        )).rows[0];
        if (!row) return null;
        if (userId && String(row.user_id) !== String(userId)) return null;

        const TERMINAL = ['FAILED', 'COMPLETED', 'SUCCESS', 'REVERSED'];
        if (TERMINAL.includes(String(row.status).toUpperCase())) return { rampId: row.id, status: String(row.status).toUpperCase() };
        if (!row.provider_txn_id || typeof fx.checkRampStatus !== 'function') return { rampId: row.id, status: String(row.status).toUpperCase() };

        let ycStatus;
        try {
            const s = await fx.checkRampStatus(row.provider_txn_id, row.type);
            ycStatus = String(s?.status || '').toUpperCase();
        } catch (e) {
            logger.warn(`[ramp reconcile] status fetch failed for ${row.provider_txn_id}: ${e.message}`);
            return { rampId: row.id, status: String(row.status).toUpperCase() };
        }

        const FAILED = ['EXPIRED', 'FAILED', 'CANCELLED', 'CANCELED', 'REJECTED', 'DECLINED', 'REVERSED', 'PENDING_REFUND', 'REFUNDED', 'REFUND'];
        const DONE = ['COMPLETE', 'COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'PAID', 'PROCESSED', 'SETTLED'];

        if (DONE.includes(ycStatus) || FAILED.includes(ycStatus)) {
            const result = await transaction(async (client) => {
                const cur = (await client.query(`SELECT * FROM fx_transactions WHERE id=$1 FOR UPDATE`, [row.id])).rows[0];
                if (TERMINAL.includes(String(cur.status).toUpperCase())) return { rampId: row.id, status: String(cur.status).toUpperCase() };
                if (DONE.includes(ycStatus)) {
                    const out = await this._creditRampDestination(client, cur);
                    logger.info(`[ramp reconcile] ${row.provider_txn_id} → COMPLETED (auto), credited ${out.credited} ${out.toCurrency}`);
                    return { rampId: row.id, status: 'COMPLETED', ...out, userId: cur.user_id };
                }
                const out = await this._refundRampSource(client, cur, `yc_${ycStatus.toLowerCase()}`);
                logger.info(`[ramp reconcile] ${row.provider_txn_id} → FAILED (auto: ${ycStatus}), refunded ${out.refunded} ${out.currency}`);
                return { rampId: row.id, status: 'FAILED', ...out, userId: cur.user_id };
            });
            if (result.userId) {
                const label = rampTypeLabel(row.type);
                notifyRampResult(result.userId, {
                    type: label,
                    amount: result.status === 'COMPLETED' ? result.credited : result.refunded,
                    currency: result.status === 'COMPLETED' ? result.toCurrency : result.currency,
                    reference: row.id,
                    status: result.status === 'COMPLETED' ? 'completed' : 'failed',
                    details: result.status === 'COMPLETED'
                        ? `${label}: ${row.from_currency} → ${row.to_currency}`
                        : `${label} Failed: ${ycStatus} (${row.from_currency} → ${row.to_currency})`,
                });
            }
            return result;
        }
        return { rampId: row.id, status: 'PENDING', ycStatus };
    }

    /** Sweep stale PENDING ramps and reconcile them against Yellow Card (safety net for closed screens). */
    async sweepPendingRamps(maxAgeMinutes = 2, limit = 50) {
        const rows = (await query(
            `SELECT id FROM fx_transactions
             WHERE type IN ('crypto_onramp','crypto_offramp') AND status='PENDING' AND provider_txn_id IS NOT NULL
               AND created_at < NOW() - ($1 || ' minutes')::interval
             ORDER BY created_at ASC LIMIT $2`,
            [String(maxAgeMinutes), limit]
        )).rows;
        let changed = 0;
        for (const r of rows) {
            const res = await this.reconcileRamp(r.id).catch(() => null);
            if (res && res.status !== 'PENDING') changed++;
        }
        if (rows.length) logger.info(`[ramp sweep] checked ${rows.length}, resolved ${changed}`);
        return { checked: rows.length, resolved: changed };
    }
}

export default new CurrencyEngineService();
