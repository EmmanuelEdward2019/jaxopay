import { createApiClient } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';

/**
 * QuidaxAdapter
 * 
 * Integration with Quidax for crypto/fiat wallets, swaps, and trading.
 * Docs: https://docs.quidax.io
 */
class QuidaxAdapter {
    constructor() {
        this.secretKey = process.env.QUIDAX_SECRET_KEY;
        this.apiKey = process.env.QUIDAX_API_KEY || process.env.QUIDAX_PUBLIC_KEY;
        this.baseURL = process.env.QUIDAX_BASE_URL || 'https://api.quidax.com/v1';

        this.client = createApiClient({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'X-Quidax-Api-Key': this.apiKey, // Sometimes used instead of Bearer or alongside
                'Content-Type': 'application/json',
            },
            timeout: 15000,
            label: 'Quidax'
        });

        this._rateCache = {};
        this._cacheTime = 0;
    }

    /**
     * Get summary of all wallets for the authenticated user
     */
    async getAllWallets(userId = 'me') {
        try {
            const response = await this.client.get(`/users/${userId}/wallets`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get a specific currency wallet
     */
    async getWallet(currency, userId = 'me') {
        try {
            const response = await this.client.get(`/users/${userId}/wallets/${currency.toLowerCase()}`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get deposit address for a currency
     */
    async getDepositAddress(currency, userId = 'me') {
        try {
            // First try to fetch existing
            const response = await this.client.get(`/users/${userId}/wallets/${currency.toLowerCase()}/address`);
            return response.data;
        } catch (err) {
            // If none exists, create one
            if (err.statusCode === 404) {
                try {
                    const createRes = await this.client.post(`/users/${userId}/wallets/${currency.toLowerCase()}/addresses`);
                    return createRes.data;
                } catch (createErr) {
                    throw this._normalizeError(createErr);
                }
            }
            throw this._normalizeError(err);
        }
    }

    /**
     * Request a withdrawal (Crypto or Fiat)
     * For Fiat, fund_uid should be the beneficiary_id
     */
    async withdraw({ currency, amount, fund_uid, fund_uid2 = '', network = '', userId = 'me' }) {
        try {
            const body = {
                currency: currency.toLowerCase(),
                amount: String(amount),
                fund_uid: fund_uid, // address or beneficiary_id
            };
            if (fund_uid2) body.fund_uid2 = fund_uid2; // destination tag / memo
            if (network) body.network = network.toLowerCase();

            const response = await this.client.post(`/users/${userId}/withdraws`, body);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * SWAP: Get Quote
     */
    async getSwapQuote({ from, to, amount, side = 'from', userId = 'me' }) {
        try {
            const body = {
                from_currency: from.toLowerCase(),
                to_currency: to.toLowerCase(),
            };
            if (side === 'from') body.from_amount = String(amount);
            else body.to_amount = String(amount);

            const response = await this.client.post(`/users/${userId}/swap_quotes`, body);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * SWAP: Confirm/Execute
     */
    async executeSwap(quoteId, userId = 'me') {
        try {
            const response = await this.client.post(`/users/${userId}/swaps/${quoteId}/confirm`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Markets: Get Order Book
     */
    async getOrderBook(market, limit = 50) {
        try {
            const response = await this.client.get(`/markets/${market.toLowerCase()}/order_book`, {
                params: { asks_limit: limit, bids_limit: limit }
            });
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }
    /**
     * Get market trade history (Recent trades)
     */
    async getMarketTrades(market, limit = 50) {
        try {
            const response = await this.client.get(`/markets/${market.toLowerCase()}/trades`, {
                params: { limit }
            });
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get market ticker summary
     */
    async getMarketTicker(market) {
        try {
            const response = await this.client.get(`/markets/${market.toLowerCase()}/tickers`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get all supported markets
     */
    async getMarkets() {
        try {
            const response = await this.client.get('/markets');
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get all supported currencies (with network info)
     */
    async getCurrencies() {
        try {
            const response = await this.client.get('/currencies');
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Trading: Create Order (Limit or Market)
     */
    async createOrder({ market, side, type, volume, price, total, userId = 'me' }) {
        try {
            const body = {
                market: market.toLowerCase(),
                side: side.toLowerCase(), // buy / sell
                ord_type: type.toLowerCase(), // limit / market
            };
            if (volume) body.volume = String(volume);
            if (price) body.price = String(price);
            if (total) body.total = String(total); // used for market buy total spend

            const response = await this.client.post(`/users/${userId}/orders`, body);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get live exchange rate (Ticker)
     */
    async getExchangeRate(from, to) {
        try {
            // Quidax markets are usually btcngn, usdtngn, etc.
            // Try direct market first
            const markets = [`${from.toLowerCase()}${to.toLowerCase()}`, `${to.toLowerCase()}${from.toLowerCase()}`];
            
            for (const market of markets) {
                try {
                    const response = await this.client.get(`/markets/${market}/tickers`);
                    let lastPrice = parseFloat(response.data?.ticker?.last || 0);
                    
                    // If we found the inverse market, flip the price
                    if (market.startsWith(to.toLowerCase())) {
                        return lastPrice > 0 ? 1 / lastPrice : 0;
                    }
                    return lastPrice;
                } catch (e) {
                    continue;
                }
            }
            return null;
        } catch (err) {
            return null; 
        }
    }

    /**
     * Initiate Fiat Deposit (On-Ramp) via Kora/Bank
     */
    async initiateFiatDeposit({ currency, amount, first_name, last_name, email }) {
        try {
            const body = {
                from_currency: currency.toUpperCase(),
                to_currency: currency.toUpperCase(),
                from_amount: String(amount),
                customer: {
                    first_name,
                    last_name,
                    email
                }
            };
            const response = await this.client.post(`/custodial/on_ramp_transactions/initiate`, body);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    _normalizeError(err) {
        const data = err.response?.data;
        return {
            message: data?.message || data?.error?.message || err.message,
            code: data?.code || data?.status,
            statusCode: err.response?.status || 500,
            raw: data
        };
    }
}

export default new QuidaxAdapter();
