import { query, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import yellowCard from '../orchestration/adapters/fx/YellowCardService.js';

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

        return await transaction(async (client) => {
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
            const convertedAmount = amount * rate;

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
         (user_id, provider, type, from_currency, to_currency, amount, converted_amount, exchange_rate, status)
         VALUES ($1, '${FX_PROVIDER_NAME}', 'swap', $2, $3, $4, $5, $6, 'PROCESSING')
         RETURNING id`,
                [userId, fromCurrency, toCurrency, amount, convertedAmount, rate]
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
                status: providerStatus
            };
        });
    }

    async sendInternationalPayment(userId, payload) {
        const {
            fromCurrency, amount, targetCurrency, recipientName, recipientBank, accountNumber, recipientCountry,
            networkId, networkName, networkAccountType, networkChannelIds,
        } = payload;

        // Remitter (sender) details required by Yellow Card, from the user's profile + KYC.
        const sender = await this._buildSender(userId);

        // Convert BEFORE opening a DB transaction — never hold a pooled connection
        // during external API calls (that caused 502s on the server).
        let convertedAmount = amount;
        let rate = 1;
        if (fromCurrency !== targetCurrency) {
            const rateData = await this.getRate(fromCurrency, targetCurrency);
            rate = parseFloat(rateData.rate);
            convertedAmount = amount * rate;
        }

        // 1) Short transaction: lock + debit the wallet, record a PROCESSING fx tx. No external calls.
        const record = await transaction(async (client) => {
            const w = await client.query(
                `SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = $2 AND is_active = true FOR UPDATE`,
                [userId, fromCurrency]
            );
            if (w.rows.length === 0) throw new AppError(`No active ${fromCurrency} wallet found`, 404);
            if (parseFloat(w.rows[0].balance) < amount) throw new AppError('Insufficient funds for this transfer.', 400);

            await client.query(
                `UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
                [amount, w.rows[0].id]
            );

            const fxTxn = await client.query(
                `INSERT INTO fx_transactions
          (user_id, provider, type, from_currency, to_currency, amount, converted_amount, exchange_rate, recipient_details, status)
          VALUES ($1, '${FX_PROVIDER_NAME}', 'international_payment', $2, $3, $4, $5, $6, $7, 'PROCESSING')
          RETURNING id`,
                [userId, fromCurrency, targetCurrency, amount, convertedAmount, rate, JSON.stringify({
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
                reason: 'other',
            });
            providerStatus = res.status || 'SUCCESS';
            providerTxnId = res.id || null;
        } catch (error) {
            logger.error('[CurrencyEngine] Transfer failed at provider:', error.message || error);
            providerError = error.message || 'Transfer failed at provider';
            providerStatus = 'FAILED';
        }

        // 3) Reconcile (short queries). Refund on failure.
        if (providerStatus === 'FAILED') {
            await transaction(async (client) => {
                await client.query(`UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2`, [amount, record.walletId]);
                await client.query(`UPDATE fx_transactions SET status = 'FAILED' WHERE id = $1`, [record.txnId]);
            });
            throw new AppError(providerError || 'International transfer failed. Your wallet has been refunded.', 400);
        }

        await query(
            `UPDATE fx_transactions SET status = $1, provider_txn_id = $2 WHERE id = $3`,
            [providerStatus, providerTxnId, record.txnId]
        );

        return { transactionId: record.txnId, status: providerStatus, amount, convertedAmount };
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
            `SELECT id, user_id, from_currency, amount, status, provider_txn_id FROM fx_transactions
             WHERE provider_txn_id = $1 OR id::text = $1 ORDER BY created_at DESC LIMIT 1`,
            [String(idOrRef)]
        )).rows[0];
        if (!row) return null;

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
                    [row.amount, row.user_id, row.from_currency]
                );
                await client.query(`UPDATE fx_transactions SET status = 'FAILED' WHERE id = $1`, [row.id]);
            });
            logger.info(`[YC reconcile] payout ${row.provider_txn_id} FAILED → refunded ${row.amount} ${row.from_currency} to user ${row.user_id}`);
            return 'FAILED';
        }

        if (DONE.includes(ycStatus)) {
            await query(`UPDATE fx_transactions SET status = 'COMPLETED' WHERE id = $1 AND status NOT IN ('FAILED','REVERSED')`, [row.id]);
            return 'COMPLETED';
        }
        return ycStatus || row.status; // still pending
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
        const idType = idt.includes('passport') ? 'passport' : (idt.includes('driver') || idt.includes('licen')) ? 'license' : 'passport';
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

        // Nigerian senders require an additional ID (BVN/NIN) on the new /send + Direct Settlement endpoints.
        if (country === 'NG') {
            const extra = docs.find((x) => {
                const t = String(x.document_type || '').toLowerCase();
                return t.includes('bvn') || t.includes('nin') || t.includes('national');
            });
            if (extra) {
                const t = String(extra.document_type).toLowerCase();
                sender.additionalIdType = t.includes('bvn') ? 'bvn' : 'nin';
                sender.additionalIdNumber = extra.document_number;
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
     * Whether a user can on/off-ramp crypto. Nigerian users must have a verified BVN or NIN
     * (Yellow Card's Direct Settlement requires it). Returns { country, required, verified }.
     */
    async getRampKycStatus(userId) {
        const prof = (await query('SELECT country FROM user_profiles WHERE user_id = $1', [userId])).rows[0] || {};
        const country = String(prof.country || 'NG').toUpperCase().slice(0, 2);
        if (country !== 'NG') return { country, required: false, verified: true, pending: false };
        // Only an APPROVED BVN/NIN/national ID unlocks the ramp. A submitted-but-unreviewed ID
        // shows as pending (blocked) until SmileID or compliance approves it.
        const rows = (await query(
            `SELECT status::text AS status FROM kyc_documents
             WHERE user_id = $1 AND document_number IS NOT NULL AND (status IS NULL OR status::text <> 'rejected')
               AND (LOWER(document_type) LIKE '%bvn%' OR LOWER(document_type) LIKE '%nin%' OR LOWER(document_type) LIKE '%national%')`,
            [userId]
        )).rows;
        const verified = rows.some((r) => r.status === 'approved');
        const pending = !verified && rows.length > 0;
        return { country, required: true, verified, pending };
    }

    /** Throws BVN_NIN_REQUIRED / BVN_NIN_PENDING (403) if the user isn't cleared to ramp. */
    async assertRampKyc(userId) {
        const s = await this.getRampKycStatus(userId);
        if (s.required && !s.verified) {
            if (s.pending) {
                throw new AppError('Your BVN/NIN is under review. You can buy or sell crypto once it is approved.', 403, 'BVN_NIN_PENDING');
            }
            throw new AppError('To buy or sell crypto, please verify your BVN or NIN first.', 403, 'BVN_NIN_REQUIRED');
        }
        return s;
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
        if (details.mode === 'internal' && credit > 0) {
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
        return await transaction(async (client) => {
            const r = (await client.query(`SELECT * FROM fx_transactions WHERE id=$1 FOR UPDATE`, [rampId])).rows[0];
            if (!r) throw new AppError('Ramp not found', 404);
            if (String(r.status).toUpperCase() !== 'PENDING') throw new AppError(`Ramp is ${r.status}, not pending`, 400);
            const out = await this._creditRampDestination(client, r);
            return { rampId, status: 'COMPLETED', ...out };
        });
    }

    /** Ops manually rejects a pending ramp → refund the user's source wallet + mark FAILED. */
    async failRampSettlement(rampId, reason = 'settlement_failed') {
        return await transaction(async (client) => {
            const r = (await client.query(`SELECT * FROM fx_transactions WHERE id=$1 FOR UPDATE`, [rampId])).rows[0];
            if (!r) throw new AppError('Ramp not found', 404);
            if (String(r.status).toUpperCase() !== 'PENDING') throw new AppError(`Ramp is ${r.status}, not pending`, 400);
            const out = await this._refundRampSource(client, r, reason);
            return { rampId, status: 'FAILED', ...out };
        });
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
                    return { rampId: row.id, status: 'COMPLETED', ...out };
                }
                const out = await this._refundRampSource(client, cur, `yc_${ycStatus.toLowerCase()}`);
                logger.info(`[ramp reconcile] ${row.provider_txn_id} → FAILED (auto: ${ycStatus}), refunded ${out.refunded} ${out.currency}`);
                return { rampId: row.id, status: 'FAILED', ...out };
            });
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
