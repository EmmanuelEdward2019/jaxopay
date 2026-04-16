import { createApiClient } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';
import { circuitBreakers } from '../../../utils/circuitBreaker.js';

/**
 * QuidaxAdapter
 *
 * Integration with Quidax for crypto/fiat wallets, swaps, and trading.
 * Docs: https://docs.quidax.io
 *
 * Features:
 * - Circuit breaker pattern for resilience
 * - Response caching for frequently accessed data
 * - Automatic retries with exponential backoff
 * - Comprehensive error handling
 */
class QuidaxAdapter {
    constructor() {
        // Trim keys to prevent hidden-whitespace auth failures
        this.secretKey = (process.env.QUIDAX_SECRET_KEY || '').trim();
        this.apiKey    = (process.env.QUIDAX_API_KEY || process.env.QUIDAX_PUBLIC_KEY || '').trim();
        // Strip trailing slash so axios combineURLs works correctly with all path formats
        this.baseURL   = (process.env.QUIDAX_BASE_URL || 'https://app.quidax.io/api/v1').trim().replace(/\/+$/, '');

        logger.info(`[Quidax] Initialising adapter → ${this.baseURL}`);

        // Authenticated client — used for user-scoped operations (swap, wallets, orders, etc.)
        // Quidax OpenAPI requires: Authorization: Bearer {API_KEY}
        // (NOT the secret key — confirmed by Quidax support)
        this.client = createApiClient({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 20000,
            label: 'Quidax'
        });

        // Public client — market data endpoints that don't require auth.
        // Keeps market-data 401s from tripping the shared circuit breaker.
        this.publicClient = createApiClient({
            baseURL: this.baseURL,
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
            label: 'QuidaxPublic'
        });

        this.circuitBreaker = circuitBreakers.quidax;

        // In-memory cache with TTL - OPTIMIZED for lower latency
        this._cache = new Map();
        this._cacheTTL = {
            currencies: 10 * 60 * 1000,     // 10 minutes (static data)
            markets: 10 * 60 * 1000,        // 10 minutes (static data)
            ticker: 15 * 1000,              // 15 seconds (price data)
            orderBook: 3 * 1000,            // 3 seconds (frequent updates)
            rates: 5 * 1000,                // 5 seconds (exchange rates)
        };

        // Cached Quidax authenticated user UID.
        // On openapi.quidax.io the literal string "me" is NOT supported —
        // the actual UID returned by GET /users/me must be used.
        this._quidaxUserId = null;

        // Start periodic cache cleanup
        this._startCacheCleanup();
    }

    // Periodic cache cleanup to prevent memory leaks
    _startCacheCleanup() {
        setInterval(() => {
            this._clearExpiredCache();
        }, 60 * 1000); // Run every minute
    }

    // Cache helper methods
    _getCacheKey(method, ...args) {
        return `${method}:${args.join(':')}`;
    }

    _getFromCache(key, ttl) {
        const cached = this._cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > ttl) {
            this._cache.delete(key);
            return null;
        }

        return cached.data;
    }

    _setCache(key, data) {
        this._cache.set(key, {
            data,
            timestamp: Date.now(),
        });
    }

    _clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this._cache.entries()) {
            // Check if any TTL applies (use minimum for safety)
            const minTTL = Math.min(...Object.values(this._cacheTTL));
            if (now - value.timestamp > minTTL * 2) {
                this._cache.delete(key);
            }
        }
    }

    /**
     * Return the Quidax user ID for authenticated endpoints.
     * Quidax docs confirm "me" is valid for the main authenticated user.
     */
    async _getAuthUserId() {
        return 'me';
    }

    /**
     * Execute request with circuit breaker and retry logic
     */
    async _executeWithCircuitBreaker(operation, operationName) {
        return this.circuitBreaker.execute(async () => {
            let lastError;
            const maxRetries = 2;

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    return await operation();
                } catch (error) {
                    lastError = error;

                    // Don't retry on 4xx errors (client errors).
                    // Raw Axios errors expose the HTTP status on error.response.status;
                    // normalized errors may use error.statusCode — check both.
                    const httpStatus = error.statusCode || error.response?.status;
                    if (httpStatus >= 400 && httpStatus < 500) {
                        throw error;
                    }

                    if (attempt < maxRetries - 1) {
                        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                        logger.warn(`[Quidax] Retrying ${operationName} after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            throw lastError;
        });
    }

    /**
     * Get summary of all wallets for the authenticated user
     */
    async getAllWallets() {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.get(`/users/${userId}/wallets`);
            return response.data;
        }, 'getAllWallets');
    }

    /**
     * Get a specific currency wallet
     */
    async getWallet(currency) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.get(`/users/${userId}/wallets/${currency.toLowerCase()}`);
            return response.data;
        }, 'getWallet');
    }

    /**
     * Get deposit address for a currency and network.
     *
     * Quidax API flow (per docs):
     *   Strategy A: GET /wallets/{currency}/address — returns the default deposit address
     *   Strategy B: GET /wallets/{currency}/addresses — returns all addresses for all networks
     *   Strategy C: POST /wallets/{currency}/addresses?network={net} — trigger address generation
     *   Strategy D: Use deposit_address from the wallet object itself
     *
     * @param {string} currency - lowercase currency ticker (e.g. "usdt")
     * @param {string} [network] - network id from wallet.networks (e.g. "trc20"). If omitted, uses default.
     */
    async getDepositAddress(currency, network = null) {
        const userId = await this._getAuthUserId();

        return this._executeWithCircuitBreaker(async () => {
            const cur = currency.toLowerCase();
            const net = network ? network.toLowerCase() : null;

            // Helper: find matching address from a list
            const findAddress = (list) => {
                if (!Array.isArray(list)) return null;
                if (net) {
                    return list.find(a => a.network?.toLowerCase() === net && a.address) || null;
                }
                return list.find(a => a.address) || null;
            };

            // Strategy A: Try fetching the default address (singular endpoint)
            // Docs: GET /users/{user_id}/wallets/{currency}/address
            try {
                const res = await this.client.get(`/users/${userId}/wallets/${cur}/address`);
                const addrData = res.data?.data || res.data;
                if (addrData?.address) {
                    // If network was requested but this is a different one, fall through to plural
                    if (!net || addrData.network?.toLowerCase() === net) {
                        return {
                            deposit_address: addrData.address,
                            address: addrData.address,
                            network: addrData.network || net || cur,
                            destination_tag: addrData.destination_tag || null,
                        };
                    }
                }
            } catch (err) {
                logger.debug(`[Quidax] Default address endpoint failed for ${cur}: ${err.message}`);
            }

            // Strategy B: Fetch all addresses for this currency (plural endpoint)
            // Docs: GET /users/{user_id}/wallets/{currency}/addresses
            let addresses = [];
            try {
                const res = await this.client.get(`/users/${userId}/wallets/${cur}/addresses`);
                addresses = res.data?.data || res.data || [];
                if (!Array.isArray(addresses)) addresses = [];
            } catch {
                addresses = [];
            }

            const existing = findAddress(addresses);
            if (existing) {
                return {
                    deposit_address: existing.address,
                    address: existing.address,
                    network: existing.network,
                    destination_tag: existing.destination_tag || null,
                };
            }

            // Strategy C: Trigger address generation via POST
            // Docs: POST /users/{user_id}/wallets/{currency}/addresses?network={net}
            try {
                const params = net ? { network: net } : {};
                await this.client.post(`/users/${userId}/wallets/${cur}/addresses`, null, { params });
                logger.info(`[Quidax] Address generation triggered for ${cur}/${net || 'default'}`);
            } catch (createErr) {
                const status = createErr.response?.status || createErr.statusCode;
                if (status !== 422 && status !== 409) {
                    logger.warn(`[Quidax] Address create for ${cur}/${net}: ${createErr.message}`);
                }
            }

            // Poll until the address appears (max ~10 s)
            const delays = [1000, 2000, 3000, 4000];
            for (const delay of delays) {
                await new Promise(resolve => setTimeout(resolve, delay));

                // Try singular endpoint first (faster)
                try {
                    const res = await this.client.get(`/users/${userId}/wallets/${cur}/address`);
                    const addrData = res.data?.data || res.data;
                    if (addrData?.address && (!net || addrData.network?.toLowerCase() === net)) {
                        return {
                            deposit_address: addrData.address,
                            address: addrData.address,
                            network: addrData.network || net || cur,
                            destination_tag: addrData.destination_tag || null,
                        };
                    }
                } catch { /* fall through to plural */ }

                // Try plural endpoint
                try {
                    const res = await this.client.get(`/users/${userId}/wallets/${cur}/addresses`);
                    const list = res.data?.data || res.data || [];
                    const found = findAddress(Array.isArray(list) ? list : []);
                    if (found) {
                        return {
                            deposit_address: found.address,
                            address: found.address,
                            network: found.network,
                            destination_tag: found.destination_tag || null,
                        };
                    }
                } catch { /* continue polling */ }
            }

            // Strategy D: Last resort — check the wallet object itself for deposit_address
            try {
                const walletRes = await this.client.get(`/users/${userId}/wallets/${cur}`);
                const wallet = walletRes.data?.data || walletRes.data;
                if (wallet?.deposit_address) {
                    return {
                        deposit_address: wallet.deposit_address,
                        address: wallet.deposit_address,
                        network: wallet.default_network || net || cur,
                        destination_tag: wallet.destination_tag || null,
                    };
                }
            } catch { /* fall through */ }

            // Return pending — frontend will retry at 5-second intervals
            return {
                deposit_address: null,
                address: null,
                network: net,
                destination_tag: null,
                pending: true,
            };
        }, 'getDepositAddress');
    }

    /**
     * Request a withdrawal (Crypto or Fiat)
     */
    async withdraw({ currency, amount, fund_uid, fund_uid2 = '', network = '' }) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const body = {
                currency: currency.toLowerCase(),
                amount: String(amount),
                fund_uid: fund_uid,
            };
            if (fund_uid2) body.fund_uid2 = fund_uid2;
            if (network) body.network = network.toLowerCase();

            const response = await this.client.post(`/users/${userId}/withdraws`, body);
            return response.data?.data || response.data;
        }, 'withdraw');
    }

    /**
     * SWAP: Temporary quotation — preview rate WITHOUT creating a real swap.
     * Endpoint: POST /users/{id}/temporary_swap_quotation
     */
    async getTemporarySwapQuote({ from, to, from_amount, to_amount }) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const body = {
                from_currency: from.toLowerCase(),
                to_currency: to.toLowerCase(),
            };
            if (from_amount != null) body.from_amount = String(from_amount);
            if (to_amount != null) body.to_amount = String(to_amount);

            const response = await this.client.post(`/users/${userId}/temporary_swap_quotation`, body);
            return response.data?.data || response.data;
        }, 'getTemporarySwapQuote');
    }

    /**
     * SWAP: Create a real quotation (valid 15s). Returns id for confirm/refresh.
     * Endpoint: POST /users/{id}/swap_quotation
     */
    async getSwapQuote({ from, to, amount, side = 'from' }) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const body = {
                from_currency: from.toLowerCase(),
                to_currency: to.toLowerCase(),
            };
            if (side === 'from') body.from_amount = String(amount);
            else body.to_amount = String(amount);

            logger.info(`[Quidax] Creating swap quotation: ${from}->${to} amount=${amount} (userId=${userId})`);
            const response = await this.client.post(`/users/${userId}/swap_quotation`, body);
            return response.data?.data || response.data;
        }, 'getSwapQuote');
    }

    /**
     * SWAP: Confirm/Execute a quotation by ID.
     * Endpoint: POST /users/{id}/swap_quotation/{quotation_id}/confirm
     */
    async executeSwap(quotationId) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.post(`/users/${userId}/swap_quotation/${quotationId}/confirm`);
            return response.data?.data || response.data;
        }, 'executeSwap');
    }

    /**
     * SWAP: Refresh an expired quotation (valid 15s).
     * Endpoint: POST /users/{id}/swap_quotation/{quotation_id}/refresh
     * Body (optional): { from_currency, to_currency, from_amount OR to_amount }
     */
    async refreshSwapQuotation(quotationId, body = {}) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.post(
                `/users/${userId}/swap_quotation/${quotationId}/refresh`,
                Object.keys(body).length > 0 ? body : undefined
            );
            return response.data?.data || response.data;
        }, 'refreshSwapQuotation');
    }

    /**
     * SWAP: Fetch a single swap transaction by ID (for polling status).
     * Endpoint: GET /users/{id}/swap_transactions/{transaction_id}
     * Returns: { id, status: "initiated"|"completed"|"failed", received_amount, execution_price, ... }
     */
    async getSwapTransaction(transactionId) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.get(`/users/${userId}/swap_transactions/${transactionId}`);
            return response.data?.data || response.data;
        }, 'getSwapTransaction');
    }

    /**
     * Markets: Get Order Book (with caching) — public endpoint
     */
    async getOrderBook(market, limit = 50) {
        const cacheKey = this._getCacheKey('orderBook', market, limit);
        const cached = this._getFromCache(cacheKey, this._cacheTTL.orderBook);
        if (cached) return cached;

        const response = await this.publicClient.get(`/markets/${market.toLowerCase()}/order_book`, {
            params: { asks_limit: limit, bids_limit: limit }
        });
        const payload = response.data?.data || response.data;
        this._setCache(cacheKey, payload);
        return payload;
    }

    /**
     * Get market trade history (Recent trades) (with caching) — public endpoint
     * Quidax v3: GET /trades/{pair} (NOT /markets/{pair}/trades)
     */
    async getMarketTrades(market, limit = 50) {
        const cacheKey = this._getCacheKey('marketTrades', market, limit);
        const cached = this._getFromCache(cacheKey, this._cacheTTL.orderBook);
        if (cached) return cached;

        const response = await this.publicClient.get(`/trades/${market.toLowerCase()}`, {
            params: { limit }
        });
        const payload = response.data?.data || response.data;
        this._setCache(cacheKey, payload);
        return payload;
    }

    /**
     * Get market ticker summary (with caching) — public endpoint
     * Quidax v3: individual ticker per market is NOT supported;
     * fetch all tickers and extract the requested market.
     */
    async getMarketTicker(market) {
        const cacheKey = this._getCacheKey('marketTicker', market);
        const cached = this._getFromCache(cacheKey, this._cacheTTL.ticker);
        if (cached) return cached;

        const allTickers = await this.getTicker24h();
        const m = market.toLowerCase();
        const payload = allTickers?.[m] || null;
        if (payload) this._setCache(cacheKey, payload);
        return payload;
    }

    /**
     * Get market depth (asks/bids aggregated) — public endpoint
     * Quidax v3: GET /markets/{pair}/depth
     */
    async getMarketDepth(market) {
        const cacheKey = this._getCacheKey('depth', market);
        const cached = this._getFromCache(cacheKey, this._cacheTTL.orderBook);
        if (cached) return cached;

        const response = await this.publicClient.get(`/markets/${market.toLowerCase()}/depth`);
        const payload = response.data?.data || response.data;
        this._setCache(cacheKey, payload);
        return payload;
    }

    /**
     * Get all supported markets (with caching) — public endpoint
     */
    async getMarkets() {
        const cacheKey = 'markets:global';
        const cached = this._getFromCache(cacheKey, this._cacheTTL.markets);
        if (cached) {
            logger.debug('[Quidax] Returning cached markets');
            return cached;
        }

        const response = await this.publicClient.get('/markets', { timeout: 10000 });
        const payload = response.data?.data || response.data;
        this._setCache(cacheKey, payload);
        logger.debug('[Quidax] Fetched and cached markets from API');
        return payload;
    }

    /**
     * Get 24-hour ticker statistics (with caching) — public endpoint
     * Quidax v3: only GET /markets/tickers works (no per-market endpoint).
     * If a specific market is requested, extract it from the full response.
     */
    async getTicker24h(market = null) {
        const cacheKey = 'ticker24h:all';
        let allData = this._getFromCache(cacheKey, this._cacheTTL.ticker);

        if (!allData) {
            const response = await this.publicClient.get('/markets/tickers');
            allData = response.data?.data || response.data;
            this._setCache(cacheKey, allData);
        }

        if (market) {
            return allData?.[market.toLowerCase()] || null;
        }
        return allData;
    }

    /**
     * Get candlestick/kline data for charts (with caching)
     */
    async getKlineData(market, interval = '1h', limit = 100) {
        const cacheKey = this._getCacheKey('kline', market, interval, limit);
        const cached = this._getFromCache(cacheKey, this._cacheTTL.ticker);
        if (cached) return cached;

        const response = await this.publicClient.get(`/markets/${market.toLowerCase()}/k`, {
            params: { period: interval, limit }
        });
        const payload = response.data?.data || response.data;
        this._setCache(cacheKey, payload);
        return payload;
    }

    /**
     * Get user's orders
     */
    async getUserOrders(market = null, status = null) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const params = {};
            if (market) params.market = market.toLowerCase();
            if (status) params.state = status.toLowerCase();

            const response = await this.client.get(`/users/${userId}/orders`, { params });
            return response.data;
        }, 'getUserOrders');
    }

    /**
     * Get a single order by ID
     */
    async getOrder(orderId) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.get(`/users/${userId}/orders/${orderId}`);
            return response.data;
        }, 'getOrder');
    }

    /**
     * Cancel an order
     */
    async cancelOrder(orderId) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.post(`/users/${userId}/orders/${orderId}/cancel`);
            return response.data;
        }, 'cancelOrder');
    }

    /**
     * Get user's wallets
     */
    async getUserWallets() {
        return this.getAllWallets();
    }

    /**
     * Get withdrawal fee estimate (with caching)
     */
    async getWithdrawFee(currency, network = null) {
        const cacheKey = this._getCacheKey('withdrawFee', currency, network || 'default');
        const cached = this._getFromCache(cacheKey, this._cacheTTL.markets);
        if (cached) return cached;

        return this._executeWithCircuitBreaker(async () => {
            const currencies = await this.getCurrencies();
            const currencyData = currencies.find(c => c.code.toLowerCase() === currency.toLowerCase());

            if (!currencyData) {
                throw new Error('Currency not found');
            }

            let fee = '0';
            if (network && currencyData.networks) {
                const networkData = currencyData.networks.find(n => n.network.toLowerCase() === network.toLowerCase());
                fee = networkData?.withdraw_fee || '0';
            } else {
                fee = currencyData.withdraw_fee || '0';
            }

            const result = { fee: parseFloat(fee), currency: currency.toUpperCase() };
            this._setCache(cacheKey, result);
            return result;
        }, 'getWithdrawFee');
    }

    /**
     * Get all supported currencies (with caching) — public endpoint
     */
    async getCurrencies() {
        const cacheKey = 'currencies:global';
        const cached = this._getFromCache(cacheKey, this._cacheTTL.currencies);
        if (cached) {
            logger.debug('[Quidax] Returning cached currencies');
            return cached;
        }

        const response = await this.publicClient.get('/currencies', { timeout: 10000 });
        const payload = response.data?.data || response.data;
        this._setCache(cacheKey, payload);
        logger.debug('[Quidax] Fetched and cached currencies from API');
        return payload;
    }

    /**
     * Trading: Create Order (Limit or Market)
     */
    async createOrder({ market, side, type, volume, price, total }) {
        const userId = await this._getAuthUserId();
        return this._executeWithCircuitBreaker(async () => {
            const body = {
                market: market.toLowerCase(),
                side: side.toLowerCase(),
                ord_type: type.toLowerCase(),
            };
            if (volume) body.volume = String(volume);
            if (price) body.price = String(price);
            if (total) body.total = String(total);

            const response = await this.client.post(`/users/${userId}/orders`, body);
            return response.data;
        }, 'createOrder');
    }

    /**
     * Get live exchange rate (with caching) — uses all-tickers endpoint
     */
    async getExchangeRate(from, to) {
        const cacheKey = this._getCacheKey('exchangeRate', from, to);
        const cached = this._getFromCache(cacheKey, this._cacheTTL.rates);
        if (cached) return cached;

        try {
            const allTickers = await this.getTicker24h();
            const markets = [`${from.toLowerCase()}${to.toLowerCase()}`, `${to.toLowerCase()}${from.toLowerCase()}`];

            for (const market of markets) {
                const tickerData = allTickers?.[market];
                if (!tickerData) continue;

                let lastPrice = parseFloat(tickerData?.ticker?.last || 0);
                if (lastPrice <= 0) continue;

                if (market.startsWith(to.toLowerCase())) {
                    const result = 1 / lastPrice;
                    this._setCache(cacheKey, result);
                    return result;
                }
                this._setCache(cacheKey, lastPrice);
                return lastPrice;
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
        return this._executeWithCircuitBreaker(async () => {
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
        }, 'initiateFiatDeposit');
    }

    /**
     * SWAP: Get all swap transactions for user
     * Endpoint: GET /users/{id}/swap_transactions
     */
    async getSwapTransactions(userId = 'me') {
        return this._executeWithCircuitBreaker(async () => {
            const response = await this.client.get(`/users/${userId}/swap_transactions`);
            return response.data?.data || response.data;
        }, 'getSwapTransactions');
    }

    /**
     * Get circuit breaker state (for health checks)
     */
    getCircuitBreakerState() {
        return this.circuitBreaker.getState();
    }

    /**
     * Clear the cache (useful for testing or manual refresh)
     */
    clearCache() {
        this._cache.clear();
        logger.info('[QuidaxAdapter] Cache cleared');
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
