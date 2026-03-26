import { createApiClient } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';
import CryptoJS from 'crypto-js';

/**
 * MexcAdapter
 * 
 * Integration with MEXC Global exchange for live crypto rates and order execution.
 * Handles public ticker data and signed private requests (future use).
 */
class MexcAdapter {
    constructor() {
        this.apiKey = process.env.MEXC_ACCESS_KEY;
        this.secretKey = process.env.MEXC_SECRET_KEY;
        this.baseURL = 'https://api.mexc.com';

        this.client = createApiClient({
            baseURL: this.baseURL,
            headers: {
                'X-MEXC-APIKEY': this.apiKey || '',
                'Content-Type': 'application/json',
            },
            timeout: 10000,
            label: 'MEXC'
        });

        // Price cache for 30s to avoid rate limits
        this._cache = {};
        this._cacheTime = 0;
    }

    /**
     * Get live exchange rate between two assets
     * Supports Crypto (BTC, ETH, etc) and handles multi-hop via USDT
     */
    async getExchangeRate(from, to) {
        from = from.toUpperCase();
        to = to.toUpperCase();

        if (from === to) return 1.0;

        try {
            const prices = await this._getAllPrices();

            // 1. Direct match (e.g. BTCUSDT)
            const directKey = `${from}${to}`;
            if (prices[directKey]) return parseFloat(prices[directKey]);

            // 2. Reverse match (e.g. USDTBTC)
            const reverseKey = `${to}${from}`;
            if (prices[reverseKey]) return 1 / parseFloat(prices[reverseKey]);

            // 3. Multi-hop via USDT (common case for BTC -> ETH or BTC -> NGN if not direct)
            // Most MEXC pairs are XXXUSDT
            const fromUSDT = prices[`${from}USDT`];
            const toUSDT = prices[`${to}USDT`];

            if (fromUSDT && toUSDT) {
                // (1 From / X USDT) / (1 To / Y USDT) = (Y / X) ... wait
                // Price of BTCUSDT is 93000 (1 BTC = 93000 USDT)
                // Price of ETHUSDT is 3000  (1 ETH = 3000 USDT)
                // 1 BTC = 93000 USDT = (93000 / 3000) ETH = 31 ETH
                return parseFloat(fromUSDT) / parseFloat(toUSDT);
            }

            // 4. Special handling for Fiat via GraphFinance/Fallback if MEXC doesn't have the fiat pair
            // MEXC sometimes has P2P or specific fiat pairs but USDT is the safest bridge
            if (from === 'USD' || to === 'USD') {
                const crypto = from === 'USD' ? to : from;
                const price = prices[`${crypto}USDT`];
                if (price) return from === 'USD' ? 1 / parseFloat(price) : parseFloat(price);
            }

            // If we still don't have it, it might be a weird pair or fiat
            // Return null to allow controller to handle fallbacks (like NGN)
            return null;
        } catch (err) {
            logger.error('[MEXC] Rate fetch failed', err.message);
            return null;
        }
    }

    /**
     * Create a spot order on MEXC
     * Supports MARKET and LIMIT orders
     */
    async createOrder({ symbol, side, type = 'MARKET', quantity, quoteOrderQty }) {
        this._ensureCredentials();

        const timestamp = Date.now();
        const params = {
            symbol: symbol.toUpperCase(),
            side: side.toUpperCase(),
            type: type.toUpperCase(),
            timestamp,
            recvWindow: 60000,
        };

        if (quantity) params.quantity = quantity;
        if (quoteOrderQty) params.quoteOrderQty = quoteOrderQty;

        const queryString = this._buildQuery(params);
        const signature = this._sign(queryString);

        try {
            const response = await this.client.post(`/api/v3/order?${queryString}&signature=${signature}`);
            logger.info(`[MEXC] Order created: ${side} ${symbol}`, response.data);
            return response.data;
        } catch (err) {
            const normalized = this._normalizeError(err);
            logger.error(`[MEXC] Order failed: ${err.message}`, normalized);
            throw normalized;
        }
    }

    /**
     * Get account information (balances)
     */
    async getAccountInfo() {
        this._ensureCredentials();
        const timestamp = Date.now();
        const queryString = `recvWindow=60000&timestamp=${timestamp}`;
        const signature = this._sign(queryString);

        try {
            const response = await this.client.get(`/api/v3/account?${queryString}&signature=${signature}`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get deposit address for a specific coin and network
     */
    async getDepositAddress(coin, network = '') {
        this._ensureCredentials();
        const timestamp = Date.now();
        const params = {
            coin: coin.toUpperCase(),
            timestamp,
            recvWindow: 60000
        };
        if (network) params.network = network;

        const queryString = this._buildQuery(params);
        const signature = this._sign(queryString);

        try {
            const response = await this.client.get(`/api/v3/capital/deposit/address?${queryString}&signature=${signature}`);
            const data = response.data;
            // Normalize: MEXC sometimes uses 'tag' instead of 'memo'
            if (data && data.tag && !data.memo) {
                data.memo = data.tag;
            }
            return data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Request a withdrawal
     */
    async withdraw({ coin, address, amount, network = '', memo = '', remarks = '' }) {
        this._ensureCredentials();
        const timestamp = Date.now();
        const params = {
            coin: coin.toUpperCase(),
            address,
            amount,
            timestamp,
            recvWindow: 60000
        };
        if (network) params.network = network;
        if (memo) params.memo = memo;
        if (remarks) params.remarks = remarks;

        const queryString = this._buildQuery(params);
        const signature = this._sign(queryString);

        try {
            const response = await this.client.post(`/api/v3/capital/withdraw/apply?${queryString}&signature=${signature}`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get deposit history
     */
    async getDepositHistory(coin = null, status = null, limit = 100) {
        this._ensureCredentials();
        const timestamp = Date.now();
        const params = { timestamp, limit, recvWindow: 60000 };
        if (coin) params.coin = coin.toUpperCase();
        if (status !== null) params.status = status;

        const queryString = this._buildQuery(params);
        const signature = this._sign(queryString);

        try {
            const response = await this.client.get(`/api/v3/capital/deposit/hisrec?${queryString}&signature=${signature}`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get withdrawal history
     */
    async getWithdrawalHistory(coin = null, status = null, limit = 100) {
        this._ensureCredentials();
        const timestamp = Date.now();
        const params = { timestamp, limit, recvWindow: 60000 };
        if (coin) params.coin = coin.toUpperCase();
        if (status !== null) params.status = status;

        const queryString = this._buildQuery(params);
        const signature = this._sign(queryString);

        try {
            const response = await this.client.get(`/api/v3/capital/withdraw/history?${queryString}&signature=${signature}`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Get all currency configurations (networks, fees, min amounts)
     */
    async getCurrencyConfig() {
        this._ensureCredentials();
        const timestamp = Date.now();
        const queryString = `recvWindow=60000&timestamp=${timestamp}`;
        const signature = this._sign(queryString);

        try {
            const response = await this.client.get(`/api/v3/capital/config/getall?${queryString}&signature=${signature}`);
            return response.data;
        } catch (err) {
            throw this._normalizeError(err);
        }
    }

    /**
     * Helper to build sorted query string
     */
    _buildQuery(params) {
        return Object.keys(params)
            .sort()
            .map(key => {
                const val = params[key];
                // Strict RFC 3986 encoding: encode everything except alphanumeric and - . _ ~
                // MEXC/Binance are picky about encoded characters like ( ) ! * '
                return `${key}=${encodeURIComponent(val).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
            })
            .join('&');
    }

    /**
     * Internal: Fetches all ticker prices and caches for 15 seconds
     */
    async _getAllPrices() {
        const now = Date.now();
        if (this._cacheTime > now - 15000 && Object.keys(this._cache).length > 0) {
            return this._cache;
        }

        try {
            const response = await this.client.get('/api/v3/ticker/price');
            const data = Array.isArray(response.data) ? response.data : [];

            const priceMap = {};
            data.forEach(item => {
                priceMap[item.symbol] = item.price;
            });

            this._cache = priceMap;
            this._cacheTime = now;
            return priceMap;
        } catch (err) {
            logger.error('[MEXC] Failed to fetch all ticker prices', err.message);
            return this._cache;
        }
    }

    _ensureCredentials() {
        if (!this.apiKey || !this.secretKey) {
            throw { message: 'Crypto exchange service is not configured', statusCode: 503 };
        }
    }

    _normalizeError(err) {
        return {
            message: err.response?.data?.msg || err.message,
            code: err.response?.data?.code,
            statusCode: err.response?.status || 500
        };
    }

    /**
     * Sign a request for private endpoints
     */
    _sign(queryString) {
        return CryptoJS.HmacSHA256(queryString, this.secretKey).toString();
    }
}

export default new MexcAdapter();
