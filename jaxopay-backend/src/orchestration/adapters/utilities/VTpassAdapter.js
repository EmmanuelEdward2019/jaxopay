import BaseAdapter from '../../interfaces/BaseAdapter.js';
import { createApiClient, normalizeError } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';

/**
 * VTpassAdapter — Bill Payments & Utilities
 *
 * Supports:
 *   - Airtime top-ups
 *   - Data bundles
 *   - Cable TV (DSTV, GOtv, Startimes)
 *   - Electricity (Prepaid & Postpaid)
 *   - Internet (Smile, Spectranet)
 *   - Meter/Smartcard verification
 *   - Transaction requery
 *
 * Auth: Basic Auth → Authorization: Basic base64(publicKey:secretKey)
 * Sandbox: https://sandbox.vtpass.com/api (NODE_ENV !== 'production')
 * Live:    https://api-service.vtpass.com/api
 *
 * Sandbox test meter numbers:
 *   Prepaid:  1111111111111
 *   Postpaid: 1010101010101
 */
class VTpassAdapter extends BaseAdapter {
    constructor(config = {}) {
        super(config);
        this.name = 'VTpass';
        this.publicKey = process.env.VTPASS_PUBLIC_KEY;
        this.apiKey = process.env.VTPASS_API_KEY;
        this.publicKey = process.env.VTPASS_PUBLIC_KEY;
        this.secretKey = process.env.VTPASS_SECRET_KEY;

        const isProd = process.env.NODE_ENV === 'production';
        const baseURL = isProd
            ? 'https://api-service.vtpass.com/api'
            : 'https://sandbox.vtpass.com/api';

        this.isSandbox = !isProd;

        this.client = createApiClient({
            baseURL,
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000,
            retries: 1,
            retryDelay: 2000,
            label: `VTpass${isProd ? '' : '-Sandbox'}`,
        });

        // Add interceptor to inject the right auth headers based on request method
        this.client.interceptors.request.use(config => {
            if (this.apiKey) {
                config.headers['api-key'] = this.apiKey;
            }
            if (config.method === 'post' || config.method === 'put' || config.method === 'patch') {
                if (this.secretKey) config.headers['secret-key'] = this.secretKey;
            } else {
                if (this.publicKey) config.headers['public-key'] = this.publicKey;
            }

            // Fallback to basic auth using Username:Password if PK and SK happen to be email/password
            if (!this.apiKey && this.publicKey?.includes('@')) {
                const authToken = Buffer.from(`${this.publicKey}:${this.secretKey}`).toString('base64');
                config.headers['Authorization'] = `Basic ${authToken}`;
            }
            return config;
        });
    }

    _hasCredentials() {
        return !!(
            this.publicKey && this.secretKey &&
            !this.publicKey.includes('your_') &&
            !this.secretKey.includes('your_')
        );
    }

    _ensureCredentials() {
        if (!this._hasCredentials()) {
            throw { message: 'VTpass credentials not configured', statusCode: 503 };
        }
    }

    /* ─── Category → VTpass identifier mapping ─────────────────── */
    _toIdentifier(category) {
        return {
            airtime: 'airtime',
            data: 'data',
            cable_tv: 'tv-subscription',
            electricity: 'electricity-bill',
            internet: 'data',   // Smile & Spectranet live under 'data' on VTpass
            education: 'education',
        }[category] || null;
    }

    _fieldsForCategory(category) {
        if (category === 'electricity') return ['meter_number'];
        if (category === 'cable_tv') return ['smartcard_number'];
        if (['airtime', 'data'].includes(category)) return ['phone'];
        return ['account_number'];
    }

    /* ─── Internal: Fetch services from VTpass ─────────────────── */
    async _getServices(identifier) {
        const res = await this.client.get('/services', {
            params: { identifier },
            timeout: 12000,
        });
        if (res.data?.response_description !== '000' && res.data?.code !== '000') {
            throw new Error(`VTpass /services error: ${res.data?.response_description}`);
        }
        return Array.isArray(res.data?.content) ? res.data.content : [];
    }

    /* ─── Internal: Fetch variations for a service ─────────────── */
    async _getVariations(serviceID) {
        try {
            const res = await this.client.get('/service-variations', {
                params: { serviceID },
                timeout: 12000,
            });
            return res.data?.content?.variations || [];
        } catch (err) {
            logger.warn(`[VTpass] _getVariations(${serviceID}) failed:`, err.message);
            return [];
        }
    }

    /* ─── Get Providers ────────────────────────────────────────── */
    async getProviders(category) {
        const identifier = this._toIdentifier(category);
        if (!identifier) return [];
        this._ensureCredentials();

        logger.info(`[VTpass] Fetching providers: identifier=${identifier}, category=${category}`);
        const services = await this._getServices(identifier);
        logger.info(`[VTpass] Got ${services.length} services for ${identifier}`);

        // Which categories get per-provider variations
        const fetchVariations = ['electricity', 'cable_tv', 'data', 'internet'].includes(category);

        // Filter internet providers
        const INTERNET_IDS = ['smile-direct', 'spectranet', 'spectranet-vtu', 'swift'];
        let filtered = services;
        if (category === 'internet') {
            filtered = services.filter(s => INTERNET_IDS.some(id => s.serviceID?.toLowerCase().includes(id.split('-')[0])));
        } else if (category === 'data') {
            filtered = services.filter(s => !INTERNET_IDS.some(id => s.serviceID?.toLowerCase().includes(id.split('-')[0])));
        }

        const providers = await Promise.all(
            filtered.map(async (svc) => {
                let variations = [];
                if (fetchVariations) {
                    variations = await this._getVariations(svc.serviceID);
                }
                return {
                    id: svc.serviceID,
                    name: svc.name,
                    image_url: svc.image || null,
                    convinience_fee: svc.convinience_fee || null,
                    fields: this._fieldsForCategory(category),
                    variations,
                };
            })
        );

        return providers;
    }

    /* ─── Validate (Meter/Smartcard/Account Verification) ──────── */
    async validate(params) {
        this._ensureCredentials();

        const body = {
            serviceID: params.serviceID,
            billersCode: params.billersCode || params.account_number,
            type: params.type || 'prepaid',
        };

        logger.info(`[VTpass] Verifying: serviceID=${body.serviceID}, billersCode=${body.billersCode}, type=${body.type}`);

        try {
            const res = await this.client.post('/merchant-verify', body, { timeout: 20000 });
            const data = res.data;

            if (data.code !== '000') {
                const msg = data.content?.error || data.response_description || 'Meter/account verification failed';
                throw { message: `VTpass: ${msg}`, statusCode: 400 };
            }

            if (data.content?.WrongBillersCode === true || data.content?.WrongBillersCode === 'true') {
                throw { message: 'Invalid meter number. Please check and try again.', statusCode: 400 };
            }

            return data;
        } catch (err) {
            if (err.statusCode) throw err;
            logger.error('[VTpass] validate error:', err.response?.data || err.message);
            const msg = err.response?.data?.content?.error
                || err.response?.data?.response_description
                || 'Meter verification failed. Check the number and try again.';
            throw { message: msg, statusCode: 502 };
        }
    }

    /* ─── Execute (Pay Bill) ───────────────────────────────────── */
    async execute(params) {
        this._ensureCredentials();

        const body = {
            request_id: params.request_id || `JX${Date.now()}`,
            serviceID: params.serviceID,
            billersCode: params.billersCode,
            variation_code: params.variation_code || '',
            amount: String(params.amount),
            phone: params.phone || params.billersCode,
        };

        logger.info(`[VTpass] Paying: serviceID=${body.serviceID}, billersCode=${body.billersCode}, amount=${body.amount}, variation=${body.variation_code}`);

        try {
            const res = await this.client.post('/pay', body, { timeout: 30000 });
            return this._normalizePayment(res.data);
        } catch (err) {
            logger.error('[VTpass] execute error:', err.response?.data || err.message);
            this.handleProviderError(err);
        }
    }

    /* ─── Status / Requery ─────────────────────────────────────── */
    async status(request_id) {
        this._ensureCredentials();
        try {
            const res = await this.client.post('/requery', { request_id }, { timeout: 15000 });
            return this._normalizePayment(res.data);
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    /* ─── Normalize Payment Response ───────────────────────────── */
    _normalizePayment(data) {
        const txn = data?.content?.transactions || {};
        const success = data?.code === '000' && txn.status === 'delivered';

        // Extract token — electricity returns purchased_code or token
        const token = data?.purchased_code || data?.token
            || txn?.token || txn?.Token
            || null;

        return {
            success,
            code: data?.code,
            transactionId: data?.requestId || txn?.transactionId,
            status: txn?.status || (success ? 'delivered' : 'failed'),
            reference: data?.requestId,
            token,
            units: data?.units || null,
            raw: data,
        };
    }

    /* ─── Error Handling ───────────────────────────────────────── */
    handleProviderError(error) {
        throw normalizeError(error, 'VTpass');
    }

    /* ─── Health Check ─────────────────────────────────────────── */
    async checkHealth() {
        try {
            this._ensureCredentials();
            await this.client.get('/services', { params: { identifier: 'airtime' }, timeout: 8000 });
            return true;
        } catch {
            return false;
        }
    }
}

export default VTpassAdapter;
