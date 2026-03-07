import { createApiClient } from '../../../utils/apiClient.js';
import { query } from '../../../config/database.js';
import logger from '../../../utils/logger.js';

class GraphFinanceService {
    constructor() {
        this.apiKey = process.env.GRAPH_API_KEY;
        this.env = process.env.GRAPH_ENV || 'sandbox';
        this.baseURL = this.env === 'sandbox'
            ? 'https://sandbox.graph.finance/api'
            : 'https://api.graph.finance';

        this.client = createApiClient({
            baseURL: this.baseURL,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
            retries: 2,
            retryDelay: 1000,
            label: 'GraphFinance'
        });
    }

    async _logApi(endpoint, request, response, status, errorMsg = null) {
        try {
            await query(`
        INSERT INTO api_logs (provider, endpoint, request_payload, response_payload, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['GraphFinance', endpoint, JSON.stringify(request), response ? JSON.stringify(response) : null, status, errorMsg]);
        } catch (e) {
            logger.error('[GraphFinance] Failed to log API call', e);
        }
    }

    async getExchangeRate(fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return { from: fromCurrency, to: toCurrency, rate: 1.0, timestamp: new Date().toISOString() };

        // Fallback static rates for robust demo functionality if the API goes down
        const getFallbackRate = (from, to) => {
            const rates = {
                'USD_NGN': 1650.0, 'NGN_USD': 1 / 1650.0,
                'GBP_NGN': 2100.0, 'NGN_GBP': 1 / 2100.0,
                'EUR_NGN': 1750.0, 'NGN_EUR': 1 / 1750.0,
                'USD_EUR': 0.92, 'EUR_USD': 1.08,
                'USD_GBP': 0.78, 'GBP_USD': 1.28,
            };
            return rates[`${from}_${to}`] || 1.0;
        };

        if (!this.apiKey) {
            return {
                from: fromCurrency, to: toCurrency,
                rate: getFallbackRate(fromCurrency, toCurrency),
                timestamp: new Date().toISOString()
            };
        }

        // Check cache
        const cachedKey = `graph_rate_${fromCurrency}_${toCurrency}`;
        if (global[cachedKey] && global[cachedKey].timestamp > Date.now() - 120000) {
            return global[cachedKey].data;
        }

        try {
            // Using Graph API endpoints
            const response = await this.client.get('/fx/rates', {
                params: { from: fromCurrency, to: toCurrency }
            });

            const data = {
                from: fromCurrency,
                to: toCurrency,
                rate: response.data?.rate || response.data?.data?.rate || getFallbackRate(fromCurrency, toCurrency),
                timestamp: new Date().toISOString()
            };

            global[cachedKey] = { data, timestamp: Date.now() };

            await this._logApi('/fx/rates', { fromCurrency, toCurrency }, response.data, 200);
            return data;
        } catch (error) {
            // Graceful fallback to prevent application breakage
            logger.warn('[GraphFinance] Failed to fetch live rate. Using fallback.');
            const data = {
                from: fromCurrency, to: toCurrency,
                rate: getFallbackRate(fromCurrency, toCurrency),
                timestamp: new Date().toISOString()
            };
            global[cachedKey] = { data, timestamp: Date.now() };
            return data;
        }
    }

    async swapCurrency(payload) {
        try {
            const response = await this.client.post('/swaps', payload);
            await this._logApi('/swaps', payload, response.data, 200);
            return response.data;
        } catch (error) {
            const status = error.response ? error.response.status : 500;
            await this._logApi('/swaps', payload, error.response?.data, status, error.message);
            throw error;
        }
    }

    async sendInternationalPayment(payload) {
        try {
            const response = await this.client.post('/transfers/international', payload);
            await this._logApi('/transfers/international', payload, response.data, 200);
            return response.data;
        } catch (error) {
            const status = error.response ? error.response.status : 500;
            await this._logApi('/transfers/international', payload, error.response?.data, status, error.message);
            throw error;
        }
    }

    async getWalletBalances() {
        try {
            const response = await this.client.get('/wallets/balances');
            await this._logApi('/wallets/balances', null, response.data, 200);
            return response.data; // Expected: { NGN: 2000000, USD: 12000 ... }
        } catch (error) {
            const status = error.response ? error.response.status : 500;
            await this._logApi('/wallets/balances', null, error.response?.data, status, error.message);
            throw error;
        }
    }

    async checkTransactionStatus(transactionId) {
        try {
            const response = await this.client.get(`/transactions/${transactionId}/status`);
            await this._logApi(`/transactions/${transactionId}/status`, null, response.data, 200);
            return response.data; // Expected: { status: 'SUCCESS' }
        } catch (error) {
            const status = error.response ? error.response.status : 500;
            await this._logApi(`/transactions/${transactionId}/status`, null, error.response?.data, status, error.message);
            throw error;
        }
    }
}

export default new GraphFinanceService();
