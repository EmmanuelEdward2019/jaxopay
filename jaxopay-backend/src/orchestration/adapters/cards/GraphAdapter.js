import BaseAdapter from '../../interfaces/BaseAdapter.js';
import { createApiClient, normalizeError } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';

/**
 * GraphAdapter — Graph.Finance Virtual Cards Integration
 *
 * Supports:
 *   - Create virtual cards (Visa/Mastercard)
 *   - Fund cards
 *   - Get card details
 *   - Get card secure data (PAN, CVV)
 *   - Freeze / Unfreeze cards
 *   - Terminate cards
 *
 * Auth: Bearer <API_KEY> on all requests
 * Amounts: Subunits (multiply by 100 — e.g. $10 → 1000)
 */
class GraphAdapter extends BaseAdapter {
    constructor(config = {}) {
        super(config);
        this.name = 'GraphFinance';
        this.apiKey = process.env.GRAPH_API_KEY;

        const baseURL = process.env.GRAPH_BASE_URL || 'https://api.usegraph.com';

        this.client = createApiClient({
            baseURL,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
            retries: 1,
            retryDelay: 2000,
            label: 'Graph',
        });
    }

    _ensureKey() {
        if (!this.apiKey || this.apiKey.includes('your_')) {
            throw { message: 'Graph Finance API key not configured. Please add GRAPH_API_KEY to .env', statusCode: 503 };
        }
    }

    /* ─── Create Card ─────────────────────────────────────────── */
    async createCard(params) {
        this._ensureKey();

        // Graph: amount in subunits (cents)
        const amountSubunits = Math.round((params.amount || 10) * 100);

        const billing_address = {
            line1: (params.billingAddress?.line1 || '123 Main Street').substring(0, 50),
            city: params.billingAddress?.city || 'Lagos',
            state: params.billingAddress?.state || 'LA',
            country: params.billingAddress?.country || 'NG',
            postal_code: params.billingAddress?.postal_code || '100001',
        };

        const payload = {
            person_id: params.customerId,
            type: params.type || 'VIRTUAL',
            brand: params.brand || 'VISA',
            currency: params.currency || 'USD',
            amount: amountSubunits,
            billing_address,
        };

        logger.info('[Graph] createCard payload:', JSON.stringify(payload));

        try {
            const res = await this.client.post('/cards', payload);
            logger.info('[Graph] createCard response:', JSON.stringify(res.data).slice(0, 500));
            return this._normalizeCardResponse(res.data);
        } catch (err) {
            const apiErrors = err.response?.data?.errors || err.response?.data?.message || err.response?.data;
            logger.error('[Graph] createCard failed:', JSON.stringify(apiErrors));
            this.handleProviderError(err);
        }
    }

    /* ─── Fund Card ───────────────────────────────────────────── */
    async fundCard(cardId, amount) {
        this._ensureKey();
        try {
            const res = await this.client.post(`/cards/${cardId}/fund`, { amount: Math.round(amount * 100) });
            return this._normalizeCardResponse(res.data);
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    /* ─── Get Card ────────────────────────────────────────────── */
    async getCard(cardId) {
        this._ensureKey();
        try {
            const res = await this.client.get(`/cards/${cardId}`);
            return this._normalizeCardResponse(res.data);
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    /* ─── Get Secure Data (PAN, CVV, Expiry) ──────────────────── */
    async getSecureCardData(cardId) {
        this._ensureKey();
        try {
            // Graph Finance returns secure info on the main card endpoint
            const res = await this.client.get(`/cards/${cardId}`);
            const d = res.data?.data || res.data;
            return {
                pan: d.pan || d.card_number || null,
                cvv: d.cvv || d.cvv2 || null,
                expiry: d.expiry || (d.expiry_month && d.expiry_year ? `${d.expiry_month}/${d.expiry_year}` : null),
                billing_address: d.billing_address || null,
            };
        } catch (e) {
            logger.warn('[Graph] getSecureCardData failed:', e.response?.data || e.message);
            return null;
        }
    }

    /* ─── Freeze Card ─────────────────────────────────────────── */
    async freezeCard(cardId) {
        this._ensureKey();
        try {
            const res = await this.client.post(`/cards/${cardId}/freeze`, {});
            return this._normalizeCardResponse(res.data);
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    /* ─── Unfreeze Card ───────────────────────────────────────── */
    async unfreezeCard(cardId) {
        this._ensureKey();
        try {
            const res = await this.client.post(`/cards/${cardId}/unfreeze`, {});
            return this._normalizeCardResponse(res.data);
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    /* ─── Terminate Card ──────────────────────────────────────── */
    async terminateCard(cardId) {
        this._ensureKey();
        try {
            const res = await this.client.delete(`/cards/${cardId}`);
            return { success: true, raw: res.data };
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    /* ─── List Cards ──────────────────────────────────────────── */
    async listCards(params = {}) {
        this._ensureKey();
        try {
            const res = await this.client.get('/cards', { params });
            return res.data?.data || [];
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    /* ─── Exchange Rates ──────────────────────────────────────── */
    async getExchangeRate(fromCurrency, toCurrency, amount = 100) {
        this._ensureKey();
        try {
            const res = await this.client.get('/rates', {
                params: { from: fromCurrency, to: toCurrency, amount },
            });
            return res.data?.data || res.data;
        } catch (err) {
            logger.warn('[Graph] getExchangeRate failed:', err.message);
            return null;
        }
    }

    /* ─── Normalize Card Response ─────────────────────────────── */
    _normalizeCardResponse(data) {
        const d = data?.data || data;
        const expiry = d.expiry_month && d.expiry_year
            ? `${String(d.expiry_month).padStart(2, '0')}/${d.expiry_year}`
            : (d.expiry || null);
        return {
            success: d.status === 'active' || !!d.id,
            cardId: d.id,
            status: d.status,
            details: {
                maskedPan: d.masked_pan || (d.last_four ? `**** **** **** ${d.last_four}` : null),
                pan: d.pan || null,
                expiry,
                expiryMonth: d.expiry_month || null,
                expiryYear: d.expiry_year || null,
                cvv: d.cvv || null,
                balance: d.balance,
                billingAddress: d.billing_address || null,
                cardholderName: d.cardholder_name || d.name_on_card || null,
            },
            raw: d,
        };
    }

    /* ─── Error Handling ──────────────────────────────────────── */
    handleProviderError(error) {
        throw normalizeError(error, 'Graph Finance');
    }

    /* ─── Health Check ────────────────────────────────────────── */
    async checkHealth() {
        try {
            this._ensureKey();
            await this.client.get('/cards', { params: { limit: 1 }, timeout: 8000 });
            return true;
        } catch {
            return false;
        }
    }
}

export default GraphAdapter;
