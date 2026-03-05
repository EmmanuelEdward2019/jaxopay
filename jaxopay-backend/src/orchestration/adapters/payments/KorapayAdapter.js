import BaseAdapter from '../../interfaces/BaseAdapter.js';
import { createApiClient, normalizeError } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';

/**
 * KorapayAdapter — Full integration
 *
 * Supports:
 *   - Pay-in (checkout / direct charge initialization)
 *   - Payouts / Disbursements
 *   - Transaction status queries
 *   - Balance checks
 *   - Environment separation (sandbox vs live via KORAPAY_BASE_URL)
 *
 * Auth: Bearer <SECRET_KEY> on all server calls
 * Docs: https://docs.korapay.com
 */
class KorapayAdapter extends BaseAdapter {
    constructor(config = {}) {
        super(config);
        this.name = 'Korapay';
        this.publicKey = process.env.KORAPAY_PUBLIC_KEY;
        this.secretKey = process.env.KORAPAY_SECRET_KEY;

        // Default to live; set KORAPAY_BASE_URL=https://api.korapay.com/merchant/api/v1 for sandbox/test
        const baseURL = process.env.KORAPAY_BASE_URL || 'https://api.korapay.com/merchant/api/v1';

        this.client = createApiClient({
            baseURL,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 20000,
            retries: 2,
            retryDelay: 1500,
            label: 'Korapay',
        });
    }

    _ensureKeys() {
        if (!this.secretKey || this.secretKey.includes('your_')) {
            throw { message: 'Korapay secret key not configured', statusCode: 503 };
        }
    }

    /* ─── Pay-in: Initialize Checkout ─────────────────────────── */
    async initializeCharge({ amount, currency, reference, customer, redirectUrl, notificationUrl, merchantBearsCost = true }) {
        this._ensureKeys();
        const payload = {
            amount,
            currency: currency || 'NGN',
            reference,
            redirect_url: redirectUrl,
            notification_url: notificationUrl,
            merchant_bears_cost: merchantBearsCost,
            customer: {
                name: customer?.name || customer?.email,
                email: customer?.email,
            },
        };

        const res = await this.client.post('/charges/initialize', payload);
        return {
            success: res.data?.status === true,
            checkoutUrl: res.data?.data?.checkout_url,
            reference: res.data?.data?.reference || reference,
            raw: res.data,
        };
    }

    /* ─── Pay-in: Verify Charge ───────────────────────────────── */
    async verifyCharge(reference) {
        this._ensureKeys();
        const res = await this.client.get(`/charges/${reference}`);
        const data = res.data?.data || {};
        return {
            success: data.status === 'success',
            status: data.status,
            amount: data.amount,
            currency: data.currency,
            reference: data.reference,
            paidAt: data.paid_at,
            raw: res.data,
        };
    }

    /* ─── Payout / Disbursement ────────────────────────────────── */
    async disburse({ reference, amount, currency, bankCode, accountNumber, accountName, narration, customerEmail }) {
        this._ensureKeys();
        const payload = {
            reference,
            destination: {
                type: 'bank_account',
                amount,
                currency: currency || 'NGN',
                narration: narration || 'Jaxopay payout',
                bank_account: {
                    bank: bankCode,
                    account: accountNumber,
                },
                customer: {
                    name: accountName,
                    email: customerEmail || '',
                },
            },
        };

        const res = await this.client.post('/transactions/disburse', payload);
        return {
            success: res.data?.status === true,
            status: res.data?.data?.status,
            reference: res.data?.data?.reference || reference,
            providerReference: res.data?.data?.provider_reference,
            raw: res.data,
        };
    }

    /* ─── List Banks ──────────────────────────────────────────── */
    async listBanks(currency = 'NGN') {
        this._ensureKeys();
        const res = await this.client.get('/misc/banks', { params: { currency } });
        return res.data?.data || [];
    }

    /* ─── Resolve Bank Account ────────────────────────────────── */
    async resolveAccount(bankCode, accountNumber, currency = 'NGN') {
        this._ensureKeys();
        const res = await this.client.post('/misc/banks/resolve', {
            bank: bankCode,
            account: accountNumber,
            currency,
        });
        return res.data?.data || {};
    }

    /* ─── Balance Check ───────────────────────────────────────── */
    async getBalances() {
        this._ensureKeys();
        const res = await this.client.get('/merchant/balances');
        return res.data?.data || [];
    }

    /* ─── Transaction History ─────────────────────────────────── */
    async getTransactions({ page = 1, limit = 20 } = {}) {
        this._ensureKeys();
        const res = await this.client.get('/merchant/transactions', {
            params: { page, limit },
        });
        return res.data?.data || [];
    }

    /* ─── Generic execute (for OrchestrationLayer compatibility) */
    async execute({ amount, currency, userId, metadata, type = 'payment' }) {
        this._ensureKeys();

        if (type === 'payout') {
            return await this.disburse({
                reference: metadata.reference,
                amount,
                currency,
                bankCode: metadata.destination?.bank,
                accountNumber: metadata.destination?.account,
                accountName: metadata.destination?.name,
                narration: metadata.narration,
                customerEmail: metadata.customer?.email,
            });
        }

        return await this.initializeCharge({
            amount,
            currency,
            reference: metadata.reference,
            customer: metadata.customer,
            redirectUrl: metadata.redirectUrl,
            notificationUrl: metadata.callbackUrl,
        });
    }

    /* ─── Status Check (for OrchestrationLayer compatibility) ── */
    async status(reference) {
        return await this.verifyCharge(reference);
    }

    /* ─── Error handling ──────────────────────────────────────── */
    handleProviderError(error) {
        throw normalizeError(error, 'Korapay');
    }

    /* ─── Health check ────────────────────────────────────────── */
    async checkHealth() {
        try {
            this._ensureKeys();
            await this.client.get('/misc/banks', { params: { currency: 'NGN' }, timeout: 8000 });
            return true;
        } catch {
            return false;
        }
    }
}

export default KorapayAdapter;
