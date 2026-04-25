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

        // Single authenticated client for ALL Quidax operations.
        // Confirmed via live testing: sub-user creation (POST /users), sub-user wallet
        // addresses, market data — ALL work on the same openapi endpoint with QUIDAX_API_KEY.
        // app.quidax.io returns 401 with both keys — do NOT use it.
        this.client = createApiClient({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 25000,
            label: 'Quidax'
        });

        // accountClient is the same client — kept as alias so sub-user methods are clear
        this.accountClient = this.client;

        // Public client — market data endpoints that don't require auth.
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

    // ─────────────────────────────────────────────────────────────────────────
    // Sub-user management (self-custody model)
    //
    // Each Jaxopay user must have a dedicated Quidax sub-account so that they
    // receive unique deposit addresses. Quidax API: POST /users
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create a Quidax sub-account for a Jaxopay user.
     *
     * Uses accountClient (app.quidax.io) — sub-user management is NOT available
     * on the openapi endpoint. Idempotent: if the email is already registered,
     * we recover the existing record by listing sub-users.
     *
     * @param {string} email       - Jaxopay user's email
     * @param {string} firstName   - User's first name
     * @param {string} lastName    - User's last name
     * @returns {{ id: string|number, sn: string, email: string }}
     */
    async createSubUser(email, firstName, lastName) {
        try {
            const res = await this.accountClient.post('/users', {
                email,
                first_name: firstName || 'User',
                last_name:  lastName  || email.split('@')[0],
            });
            const data = res.data?.data || res.data;
            logger.info(`[Quidax] Sub-user created: id=${data.id} sn=${data.sn} (${email})`);
            logger.debug(`[Quidax] createSubUser response: ${JSON.stringify(data)}`);
            return data;
        } catch (err) {
            const status = err.response?.status;
            const body   = err.response?.data;
            const msg    = body?.message || body?.error || (typeof body === 'string' ? body : '') || err.message || '';
            logger.warn(`[Quidax] createSubUser error (HTTP ${status}) for ${email}: ${msg}`);
            logger.warn(`[Quidax] createSubUser response body: ${JSON.stringify(body)}`);

            // On ANY 4xx: try to recover the existing sub-user.
            // The most common cause is the email already being registered — Quidax's
            // exact error message varies across API versions so we catch all 4xx.
            if (status >= 400 && status < 500) {
                logger.info(`[Quidax] Attempting sub-user recovery by email for ${email}`);
                try {
                    return await this.getSubUserByEmail(email);
                } catch (lookupErr) {
                    logger.warn(`[Quidax] getSubUserByEmail failed for ${email}: ${lookupErr.message}`);
                }
            }
            throw new Error(`Quidax sub-user creation failed (HTTP ${status}): ${msg}`);
        }
    }

    /**
     * Find an existing Quidax sub-user by email address.
     *
     * Paginates through GET /users until the matching record is found.
     * Normalises both sides to lowercase + trimmed whitespace before comparing
     * so encoding quirks don't cause a false miss.
     */
    async getSubUserByEmail(email) {
        const normalised = email.trim().toLowerCase();
        let page = 1;

        while (true) {
            const res = await this.accountClient.get('/users', { params: { page, per_page: 100 } });
            const raw  = res.data?.data ?? res.data;
            const list = Array.isArray(raw) ? raw : (raw?.users ? raw.users : []);

            logger.debug(`[Quidax] getSubUserByEmail page=${page} returned ${list.length} entries`);
            if (list.length > 0) {
                logger.debug(`[Quidax] Sub-user fields sample: ${JSON.stringify(Object.keys(list[0]))}`);
            }

            const found = list.find(u => (u.email || '').trim().toLowerCase() === normalised);
            if (found) {
                logger.info(`[Quidax] Found sub-user: id=${found.id} sn=${found.sn} (${email})`);
                return found;
            }

            if (list.length < 100) break; // No more pages
            page++;
        }

        throw new Error(`[Quidax] Sub-user not found for email: ${email} (searched ${page} page(s))`);
    }

    /**
     * Extract the numeric Quidax user ID from a sub-user object.
     *
     * Quidax returns `id` (number) and `sn` (string, e.g. "USR-123456").
     * The webhook carries `data.user.id` which is the numeric ID, so we MUST
     * store and return the numeric `id` — NOT the sn — to make webhook lookup work.
     *
     * @param {object} subUser - Object returned from createSubUser / getSubUserByEmail
     * @returns {string}       - String representation of the numeric Quidax user ID
     */
    _extractSubUserId(subUser) {
        // id may be a number (12345) or a numeric string ("12345").
        // uid is an alternative field name used by some Quidax API versions.
        // sn ("USR-12345") is only a last resort but WILL break webhook matching.
        const numericId = subUser.id ?? subUser.uid ?? subUser.user_id;
        if (numericId !== null && numericId !== undefined && String(numericId) !== '') {
            return String(numericId);
        }
        // sn fallback — log a prominent warning because webhook deposits won't match
        if (subUser.sn) {
            logger.error(
                `[Quidax] ⚠️  Sub-user object has no numeric id — falling back to sn="${subUser.sn}". ` +
                'Webhook deposit.successful will not be routable to this user. Full object: ' +
                JSON.stringify(subUser)
            );
            return String(subUser.sn);
        }
        throw new Error('[Quidax] Sub-user object has no id, uid, user_id, or sn field: ' + JSON.stringify(subUser));
    }

    /**
     * Get (or generate) a unique deposit address for a Jaxopay sub-user's wallet.
     *
     * Confirmed via live API testing against openapi.quidax.io:
     *
     *  GET  /users/{subId}/wallets/{cur}/addresses  → array; empty [] if no address yet
     *  POST /users/{subId}/wallets/{cur}/addresses  → creates address, returns it immediately
     *      (network query param supported for multi-network coins like USDT)
     *
     * Each sub-user gets unique addresses (different from master account).
     * "me" always returns the master/Jaxopay account addresses — NOT suitable here.
     *
     * @param {string} quidaxUserId  - Quidax sub-user ID (from users.quidax_user_id)
     * @param {string} currency      - lowercase ticker (e.g. "usdt", "sol")
     * @param {string|null} network  - preferred network (e.g. "trc20"). null = Quidax default.
     */
    async getDepositAddressForUser(quidaxUserId, currency, network = null) {
        return this._executeWithCircuitBreaker(async () => {
            const cur = currency.toLowerCase();
            const net = network ? network.toLowerCase() : null;

            // Pick best address from a list, preferring the requested network
            // Network-to-address-format validators — ensure we never return a wrong-network address.
            // e.g. BTC must be a bech32/P2PKH address (starts with 1, 3 or bc1), not 0x.
            const networkValidators = {
                // Network name aliases AND coin ticker aliases (Quidax may return either)
                btc:      (addr) => /^(1|3|bc1)[a-zA-Z0-9]{10,}$/.test(addr),
                bitcoin:  (addr) => /^(1|3|bc1)[a-zA-Z0-9]{10,}$/.test(addr),
                eth:      (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
                erc20:    (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
                bnb:      (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
                bep20:    (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
                polygon:  (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
                matic:    (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
                trx:      (addr) => /^T[a-zA-Z0-9]{32,34}$/.test(addr),
                trc20:    (addr) => /^T[a-zA-Z0-9]{32,34}$/.test(addr),
                tron:     (addr) => /^T[a-zA-Z0-9]{32,34}$/.test(addr),
                sol:      (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr),
                solana:   (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr),
                xrp:      (addr) => /^r[a-zA-Z0-9]{24,34}$/.test(addr),
                ripple:   (addr) => /^r[a-zA-Z0-9]{24,34}$/.test(addr),
                ada:      (addr) => /^addr1/.test(addr),
                cardano:  (addr) => /^addr1/.test(addr),
                doge:     (addr) => /^D[a-zA-Z0-9]{33}$/.test(addr),
                dogecoin: (addr) => /^D[a-zA-Z0-9]{33}$/.test(addr),
                ltc:      (addr) => /^[LM3][a-zA-Z0-9]{26,34}$/.test(addr),
                litecoin: (addr) => /^[LM3][a-zA-Z0-9]{26,34}$/.test(addr),
            };

            const isValidForNetwork = (addr, netId) => {
                if (!addr || !netId) return true; // no validator = accept
                const key = netId.toLowerCase().replace(/\s+network$/i,'').replace(/\s/g,'');
                const validator = networkValidators[key];
                return validator ? validator(addr) : true;
            };

            const pickBest = (list, preferNet) => {
                if (!Array.isArray(list) || list.length === 0) return null;
                const valid = list.filter(a => a.address && a.address.length > 10);
                if (valid.length === 0) return null;

                if (preferNet) {
                    // 1. Exact network name match (case-insensitive, strip spaces)
                    const norm = (s) => (s || '').toLowerCase().replace(/\s+network$/i,'').replace(/\s/g,'');
                    const exact = valid.find(a => norm(a.network) === norm(preferNet));
                    if (exact && isValidForNetwork(exact.address, preferNet)) return exact;

                    // 2. Address format match (e.g. requested trc20 → T... address)
                    const byFormat = valid.find(a => isValidForNetwork(a.address, preferNet));
                    if (byFormat) return byFormat;
                }

                // No network preference — return first address that passes format check for the currency
                const byCurrency = valid.find(a => isValidForNetwork(a.address, cur));
                return byCurrency || valid[0];
            };

            const buildResult = (item, fallbackNet) => ({
                deposit_address: item.address || item.deposit_address,
                address: item.address || item.deposit_address,
                network: item.network || fallbackNet || cur,
                destination_tag: item.destination_tag || item.tag || null,
            });

            // ── Step 0: Check wallet object for deposit_address ─────────────────
            // Most coins (SOL, XRP, BNB, TRX, ADA, DOGE etc.) surface their
            // deposit address directly on GET /wallets/{cur} — no separate /addresses
            // call needed. This mirrors the master-user getDepositAddress Strategy 1.
            // For multi-network coins (USDT/USDC), skip only if the user explicitly
            // requests a different network than the wallet's default.
            try {
                const walletRes = await this.client.get(`/users/${quidaxUserId}/wallets/${cur}`);
                const wallet = walletRes.data?.data || walletRes.data;
                const walletAddr = wallet?.deposit_address || wallet?.address;
                if (walletAddr && walletAddr.length > 10) {
                    const walletNet = (wallet.default_network || wallet.network || '').toLowerCase();
                    // Only skip this shortcut if: a specific network was requested AND the wallet's
                    // default network is a different network for a multi-network coin.
                    const isMultiNetwork = ['usdt', 'usdc'].includes(cur);
                    const networkMismatch = net && isMultiNetwork && walletNet && walletNet !== net;
                    if (!networkMismatch && isValidForNetwork(walletAddr, net || cur)) {
                        logger.info(`[Quidax] ✅ wallet.deposit_address ${quidaxUserId}/${cur}: ${walletAddr}`);
                        return buildResult(
                            { address: walletAddr, network: walletNet || net || cur, destination_tag: wallet.destination_tag || wallet.tag || null },
                            net
                        );
                    }
                }
            } catch (err) {
                logger.warn(`[Quidax] GET /wallets/${cur} for sub-user ${quidaxUserId}: ${err.response?.status} — ${err.response?.data?.message || err.message}`);
            }

            // ── Step 1: Check /addresses array (multi-network coins, existing addresses) ─
            try {
                const res = await this.client.get(`/users/${quidaxUserId}/wallets/${cur}/addresses`);
                const list = Array.isArray(res.data?.data) ? res.data.data :
                             Array.isArray(res.data) ? res.data : [];
                const found = pickBest(list, net);
                if (found) {
                    logger.info(`[Quidax] ✅ existing address ${quidaxUserId}/${cur}: ${found.address}`);
                    return buildResult(found, net);
                }
            } catch (err) {
                logger.warn(`[Quidax] GET /addresses ${quidaxUserId}/${cur}: ${err.response?.status} — ${err.response?.data?.message || err.message}`);
            }

            // ── Step 2: Generate address via POST /addresses ─────────────────────
            logger.info(`[Quidax] Generating address: sub-user ${quidaxUserId}/${cur} network=${net || 'default'}`);

            const attemptPost = async (withNetwork) => {
                const params = (withNetwork && withNetwork !== cur) ? { network: withNetwork } : {};
                const r = await this.client.post(
                    `/users/${quidaxUserId}/wallets/${cur}/addresses`,
                    null,
                    { params }
                );
                const d = r.data?.data || r.data;
                const addr = d?.address || d?.deposit_address;
                if (addr && addr.length > 10) {
                    logger.info(`[Quidax] ✅ generated address ${quidaxUserId}/${cur}: ${addr} (network=${d?.network})`);
                    return buildResult(d, net);
                }
                return null; // address is async (rare)
            };

            try {
                const result = await attemptPost(net);
                if (result) return result;
            } catch (firstErr) {
                const st = firstErr.response?.status;
                const errMsg = firstErr.response?.data?.message || firstErr.response?.data?.error || firstErr.message;
                if (st === 400 || st === 422) {
                    // Network param rejected or single-network coin — retry without network param
                    logger.info(`[Quidax] Network param rejected for ${cur} (${st}: ${errMsg}), retrying without`);
                    try {
                        const result = await attemptPost(null);
                        if (result) return result;
                    } catch (retryErr) {
                        const retryMsg = retryErr.response?.data?.message || retryErr.response?.data?.error || retryErr.message;
                        logger.warn(`[Quidax] POST /addresses retry failed ${quidaxUserId}/${cur} (${retryErr.response?.status}): ${retryMsg}`);
                    }
                } else if (st === 409) {
                    // Address already exists — fetch it (race condition)
                    try {
                        const res = await this.client.get(`/users/${quidaxUserId}/wallets/${cur}/addresses`);
                        const list = Array.isArray(res.data?.data) ? res.data.data : [];
                        const found = pickBest(list, net);
                        if (found) return buildResult(found, net);
                    } catch { /* fall through to pending */ }
                } else {
                    logger.warn(`[Quidax] POST /addresses failed ${quidaxUserId}/${cur} (${st}): ${errMsg}`);
                    logger.debug(`[Quidax] POST /addresses full response:`, JSON.stringify(firstErr.response?.data));
                }
            }

            // ── Step 3: Last-resort re-check wallet object after POST ─────────────
            // POST may have created the address asynchronously and it may now be on the wallet
            try {
                const walletRes = await this.client.get(`/users/${quidaxUserId}/wallets/${cur}`);
                const wallet = walletRes.data?.data || walletRes.data;
                const walletAddr = wallet?.deposit_address || wallet?.address;
                if (walletAddr && walletAddr.length > 10 && isValidForNetwork(walletAddr, net || cur)) {
                    logger.info(`[Quidax] ✅ post-POST wallet.deposit_address ${quidaxUserId}/${cur}: ${walletAddr}`);
                    return buildResult(
                        { address: walletAddr, network: wallet.default_network || wallet.network || net || cur, destination_tag: wallet.destination_tag || null },
                        net
                    );
                }
            } catch { /* ignore */ }

            // Address generation is truly async — webhook wallet.address.generated will arrive
            logger.info(`[Quidax] Address pending (async) for ${quidaxUserId}/${cur}`);
            return { deposit_address: null, address: null, network: net || cur, destination_tag: null, pending: true };

        }, `getDepositAddressForUser:${quidaxUserId}:${currency}`);
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

            // Strategy 1: The fastest and most reliable way: Get the wallet object directly.
            // Quidax places the primary working deposit address inside the wallet object itself.
            try {
                const walletRes = await this.client.get(`/users/${userId}/wallets/${cur}`);
                const wallet = walletRes.data?.data || walletRes.data;
                if (wallet?.deposit_address) {
                    // For massive multi-network coins (USDT, USDC), if the user strictly requests a DIFFERENT network
                    // than the default, we should check addresses array. Otherwise, this is perfect.
                    if (!net || wallet.default_network?.toLowerCase() === net || !['usdt','usdc'].includes(cur)) {
                        return {
                            deposit_address: wallet.deposit_address,
                            address: wallet.deposit_address,
                            network: wallet.default_network || net || cur,
                            destination_tag: wallet.destination_tag || null,
                        };
                    }
                }
            } catch (err) {
                logger.debug(`[Quidax] Wallet fetch failed for ${cur}: ${err.message}`);
            }

            // Helper: Find exact or fallback address
            const findAddress = (list) => {
                if (!Array.isArray(list)) return null;
                const valid = list.filter(a => a.address);
                if (valid.length === 0) return null;
                
                if (net) {
                    // Try exact match first
                    const exact = valid.find(a => a.network?.toLowerCase() === net);
                    if (exact) return exact;
                    
                    // Lenient match: If the coin only has 1 generated network, or the requested network essentially IS the coin
                    if (valid.length === 1 || net === cur) return valid[0];
                }
                return valid[0]; // Fallback to first available
            };

            // Strategy 2: Check plural endpoint for multiple networks (e.g. TRC20 vs ERC20)
            let addresses = [];
            try {
                const res = await this.client.get(`/users/${userId}/wallets/${cur}/addresses`);
                addresses = res.data?.data || res.data || [];
                const found = findAddress(addresses);
                if (found) {
                    return {
                        deposit_address: found.address,
                        address: found.address,
                        network: found.network || net || cur,
                        destination_tag: found.destination_tag || null,
                    };
                }
            } catch { /* proceed to generation */ }

            // Strategy 3: Trigger address generation via POST ONLY if no address exists at all
            try {
                // Do not pass network parameter for single-network coins to prevent 422 errors
                const params = (net && net !== cur) ? { network: net } : {};
                try {
                    await this.client.post(`/users/${userId}/wallets/${cur}/addresses`, null, { params });
                    logger.info(`[Quidax] Address generation POST triggered for ${cur} with ${JSON.stringify(params)}`);
                } catch (firstErr) {
                    const firstStatus = firstErr.response?.status;
                    if (firstStatus === 400 || firstStatus === 422) {
                        // Quidax has a documented quirk where passing explicitly defined single networks (like Cardano or Doge) 
                        // throws a 400 "Blockchain deposits are not available for X". Dropping the parameter generates it successfully.
                        logger.info(`[Quidax] Network parameter rejected for ${cur}. Retrying parameterless generation.`);
                        await this.client.post(`/users/${userId}/wallets/${cur}/addresses`);
                    } else {
                        throw firstErr;
                    }
                }
            } catch (createErr) {
                const status = createErr.response?.status || createErr.statusCode;
                if (status !== 422 && status !== 409) {
                    logger.warn(`[Quidax] Address create error for ${cur}: ${createErr.response?.data?.message || createErr.message}`);
                }
            }

            // Return pending so frontend knows to poll softly while Quidax initializes the blockchain wallet
            return {
                deposit_address: null,
                address: null,
                network: net || cur,
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
