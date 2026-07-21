import crypto from 'crypto';
import { createApiClient } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';
import { circuitBreakers } from '../../../utils/circuitBreaker.js';

/**
 * ObiexAdapter
 *
 * Integration with Obiex Finance (https://obiex.finance) for crypto deposits, withdrawals,
 * and swaps. Docs: https://developer.obiex.finance/api-reference/introduction
 *
 * Unlike Quidax, Obiex is a single pooled broker account — there are no per-user
 * sub-accounts. End-user attribution is done via:
 *   - `uniqueUserIdentifier` when generating a deposit address (Obiex returns the same
 *     address on repeat calls for the same identifier — idempotent).
 *   - Matching the deposit webhook's `address` field back to `wallets.crypto_address`
 *     (Obiex's deposit webhook does NOT carry the uniqueUserIdentifier, only the address).
 * JAXOPAY's own `wallets` table remains the sole ledger of what each user owns — Obiex is
 * only the custody/settlement rail, exactly like the Korapay/Yellow Card integrations.
 *
 * Several public methods intentionally return data shaped like QuidaxAdapter's equivalents
 * (e.g. getSwapQuote, executeSwap, getExchangeRate, getCurrencies) so that crypto.controller.js
 * can switch providers via a single CRYPTO_PROVIDER branch without reshaping downstream code.
 */
class ObiexAdapter {
  constructor() {
    this.apiKey = (process.env.OBIEX_API_KEY || '').trim();
    this.apiSecret = (process.env.OBIEX_API_SECRET || '').trim();
    // Staging by default until OBIEX_BASE_URL is explicitly set to production.
    this.baseURL = (process.env.OBIEX_BASE_URL || 'https://staging.api.obiex.finance/v1').trim().replace(/\/+$/, '');
    // Obiex signs the request path WITH the /v1 prefix — derive it from baseURL so signing
    // stays correct even if OBIEX_BASE_URL is swapped between staging/production.
    this._pathPrefix = (() => {
      try { return new URL(this.baseURL).pathname.replace(/\/+$/, '') || '/v1'; }
      catch { return '/v1'; }
    })();

    logger.info(`[Obiex] Initialising adapter → ${this.baseURL}`);

    this.circuitBreaker = circuitBreakers.obiex;

    this.client = createApiClient({
      baseURL: this.baseURL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
      label: 'Obiex',
    });

    // Sign every request dynamically — the signature is per-method/path/timestamp, so it
    // can't be set once at client-creation time like a static bearer token.
    this.client.interceptors.request.use((req) => {
      if (!this.apiKey || !this.apiSecret) return req;
      const method = (req.method || 'get').toUpperCase();
      // req.url is the path passed to client.request/get/post (relative), e.g. '/trades/quote'.
      // Sign the PATHNAME only — strip any query string defensively (query params should be
      // passed via axios `params`, never concatenated into the url, to avoid a signature mismatch
      // if Obiex's HMAC does not cover query strings, mirroring a real bug hit with another
      // provider's HMAC scheme).
      const urlPath = String(req.url || '').split('?')[0];
      const path = `${this._pathPrefix}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
      const timestamp = Date.now();
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(`${method}${path}${timestamp}`)
        .digest('hex');
      req.headers['X-API-KEY'] = this.apiKey;
      req.headers['X-API-TIMESTAMP'] = String(timestamp);
      req.headers['X-API-SIGNATURE'] = signature;
      return req;
    });

    this._cache = new Map();
    this._cacheTTL = {
      currencies: 10 * 60 * 1000,   // 10 minutes (static data)
      networks: 10 * 60 * 1000,     // 10 minutes (static data)
      rates: 5 * 1000,              // 5 seconds
    };
    setInterval(() => this._clearExpiredCache(), 60 * 1000).unref?.();
  }

  isConfigured() {
    return !!(this.apiKey && this.apiSecret);
  }

  _getFromCache(key, ttl) {
    const cached = this._cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > ttl) { this._cache.delete(key); return null; }
    return cached.data;
  }

  _setCache(key, data) {
    this._cache.set(key, { data, timestamp: Date.now() });
  }

  _clearExpiredCache() {
    const now = Date.now();
    const maxTTL = Math.max(...Object.values(this._cacheTTL));
    for (const [key, value] of this._cache.entries()) {
      if (now - value.timestamp > maxTTL * 2) this._cache.delete(key);
    }
  }

  /** Normalize Obiex's `{message, errors:[{message}]}` error shape into a plain Error. */
  _normalizeError(err) {
    const data = err.response?.data;
    const msg = data?.errors?.[0]?.message || data?.message || err.message || 'Obiex request failed';
    const normalized = new Error(msg);
    normalized.statusCode = err.response?.status || 502;
    normalized.obiexRaw = data;
    // Mark operational so the global error handler trusts this statusCode/message in production
    // instead of masking it as a generic 500 (errorHandler.js only forwards trusted details when
    // isOperational is true — without this flag every Obiex error, even a clean 4xx, was flattened).
    normalized.isOperational = true;
    normalized.status = `${normalized.statusCode}`.startsWith('4') ? 'fail' : 'error';
    return normalized;
  }

  async _request(method, path, body, params) {
    if (!this.isConfigured()) {
      const e = new Error('Obiex is not configured (missing OBIEX_API_KEY/OBIEX_API_SECRET)');
      e.statusCode = 503;
      throw e;
    }
    try {
      // Query params are passed via axios `params` (never concatenated into `path`) so the
      // signed pathname always excludes them — see the signing interceptor's comment.
      const res = await this.circuitBreaker.execute(() =>
        this.client.request({ method, url: path, data: body, params })
      );
      return res.data;
    } catch (err) {
      throw this._normalizeError(err);
    }
  }

  // ── Currencies & networks ─────────────────────────────────────────────────

  /** Quidax-compatible shape: array of {code, name, type:'coin', min_deposit_amount, precision, networks}. */
  async getCurrencies() {
    const cacheKey = 'currencies:tradable';
    const cached = this._getFromCache(cacheKey, this._cacheTTL.currencies);
    if (cached) return cached;

    const data = await this._request('GET', '/currencies/tradeable');
    const list = (data?.data || []).map((c) => ({
      code: String(c.code || '').toUpperCase(),
      name: c.name,
      type: 'coin',
      min_deposit_amount: 0,
      precision: c.maximumDecimalPlaces ?? 8,
      networks: [],
      active: c.active !== false,
      withdrawable: c.withdrawable !== false,
      receivable: c.receivable !== false,
    }));
    this._setCache(cacheKey, list);
    return list;
  }

  /** Raw active-networks map: { USDT: { currencyName, networks: [{networkCode,networkName,minimumDeposit,depositFee,minimumWithdrawal,withdrawalFee,maximumDecimalPlaces}] } } */
  async getActiveNetworksMap() {
    const cacheKey = 'networks:active';
    const cached = this._getFromCache(cacheKey, this._cacheTTL.networks);
    if (cached) return cached;
    const data = await this._request('GET', '/currencies/networks/active');
    const map = data?.data || {};
    this._setCache(cacheKey, map);
    return map;
  }

  /** Quidax-compatible network list for one coin: [{network,name,deposits_enabled,withdraws_enabled,withdrawFee,withdrawMin,depositMin,isDefault,confirmations}] */
  async getNetworksForCurrency(currencyCode) {
    const map = await this.getActiveNetworksMap();
    const entry = map?.[String(currencyCode).toUpperCase()];
    const nets = entry?.networks || [];
    return nets.map((n, i) => ({
      network: n.networkCode,
      name: n.networkName,
      deposits_enabled: true,
      withdraws_enabled: true,
      withdrawFee: String(n.withdrawalFee ?? 0),
      withdrawMin: String(n.minimumWithdrawal ?? 0),
      depositMin: String(n.minimumDeposit ?? 0),
      isDefault: i === 0,
      confirmations: 0,
      precision: n.maximumDecimalPlaces ?? 8,
    }));
  }

  /** Quidax-compatible: {fee: number, currency: string} */
  async getWithdrawFee(currency, network = null) {
    const nets = await this.getNetworksForCurrency(currency);
    const match = network ? nets.find((n) => n.network.toLowerCase() === String(network).toLowerCase()) : nets[0];
    return { fee: parseFloat(match?.withdrawFee ?? 0), currency: String(currency).toUpperCase() };
  }

  // ── Deposit addresses ──────────────────────────────────────────────────────

  /**
   * Idempotent — the same (uniqueUserIdentifier, currency, network) always returns the same
   * address. Returns a shape compatible with what crypto.controller.js's getCryptoDepositAddress
   * already reads: `{ data: { address, network, tag } }` (also checks `deposit_address`).
   */
  async getDepositAddress(userId, currency, network) {
    const body = {
      uniqueUserIdentifier: String(userId),
      currency: String(currency).toUpperCase(),
      network: String(network || currency).toUpperCase(),
    };
    const data = await this._request('POST', '/addresses/broker', body);
    const d = data?.data || {};
    return {
      data: {
        address: d.value || null,
        deposit_address: d.value || null,
        network: d.network || body.network,
        tag: d.memo || null,
        destination_tag: d.memo || null,
      },
    };
  }

  // ── Withdrawals ─────────────────────────────────────────────────────────────

  /**
   * Quidax-parameter-compatible: accepts the same field names withdrawCrypto() already passes
   * (currency, network, fund_uid=address, fund_uid2=memo, amount, reference, transaction_note,
   * narration). Returns {data:{id}, id, status, reference} matching what the caller reads.
   */
  async withdraw({ currency, network, fund_uid, fund_uid2, amount, reference, narration }) {
    const body = {
      destination: {
        address: fund_uid,
        network: String(network || currency).toUpperCase(),
        ...(fund_uid2 ? { memo: fund_uid2 } : {}),
      },
      amount: Number(amount),
      currency: String(currency).toUpperCase(),
      narration: narration || `Jaxopay withdrawal ${reference || ''}`.trim(),
    };
    const data = await this._request('POST', '/wallets/ext/debit/crypto', body);
    const d = data?.data || {};
    return {
      data: { id: d.id || d.reference },
      id: d.id || d.reference,
      status: d.status || 'PENDING',
      reference: d.reference || reference,
      raw: d,
    };
  }

  // ── Swap: quote → accept (mirrors Quidax's create → confirm two-step) ──────

  /**
   * Obiex represents the Naira as the synthetic/wrapped token NGNX, not NGN, on its trading
   * ledger (confirmed against their own examples — every NGN pair shown uses "NGNX"). JAXOPAY's
   * wallets and every other integration use "NGN" throughout, so this translation is applied
   * ONLY at the boundary of Obiex trading calls (quote/swap) — never in deposit/withdraw (those
   * only ever move stablecoins, never fiat) and never anywhere else in the codebase.
   */
  _toObiexCurrency(code) {
    const c = String(code || '').toUpperCase();
    return c === 'NGN' ? 'NGNX' : c;
  }

  _fromObiexCurrency(code) {
    const c = String(code || '').toUpperCase();
    return c === 'NGNX' ? 'NGN' : c;
  }

  /**
   * Quidax-compatible: getSwapQuote({from,to,amount,side}) where side 'from' means `amount` is
   * how much of `from` is being sold (Obiex side SELL), and side 'to' means `amount` is how much
   * of `to` the user wants to receive (Obiex side BUY).
   * Returns: {id, from_currency, to_currency, from_amount, to_amount, quoted_price, expires_at}
   */
  async getSwapQuote({ from, to, amount, side = 'from' }) {
    const obiexSide = side === 'to' ? 'BUY' : 'SELL';
    const body = {
      sourceId: this._toObiexCurrency(from),
      targetId: this._toObiexCurrency(to),
      amount: Number(amount),
      side: obiexSide,
    };
    const data = await this._request('POST', '/trades/quote', body);
    const d = data?.data || {};
    return {
      id: d.id,
      from_currency: this._fromObiexCurrency(d.sourceCode) || String(from).toUpperCase(),
      to_currency: this._fromObiexCurrency(d.targetCode) || String(to).toUpperCase(),
      from_amount: d.amount,
      to_amount: d.amountReceived,
      quoted_price: d.rate,
      expires_at: d.expiryDate,
      expires_in: d.expiresIn,
      raw: d,
    };
  }

  /**
   * Quidax-compatible: a non-binding rate preview (used only for display, never accepted).
   * Obiex has no separate "temporary quote" concept — Create Quote itself has no commitment
   * until accept-quote is called, so an unaccepted quote simply expires on its own (~30s).
   */
  async getTemporarySwapQuote({ from, to, from_amount, to_amount }) {
    const amount = from_amount != null ? from_amount : to_amount;
    const side = from_amount != null ? 'from' : 'to';
    return this.getSwapQuote({ from, to, amount, side });
  }

  /** Obiex has no dedicated refresh endpoint — a "refresh" is simply a new quote. */
  async refreshSwapQuotation(_quotationId, body = {}) {
    const from = body.from_currency;
    const to = body.to_currency;
    if (!from || !to) {
      const e = new Error('from_currency and to_currency are required to refresh an Obiex quote');
      e.statusCode = 400;
      throw e;
    }
    const amount = body.from_amount != null ? body.from_amount : body.to_amount;
    const side = body.from_amount != null ? 'from' : 'to';
    return this.getSwapQuote({ from, to, amount, side });
  }

  /**
   * Executes (accepts) a previously created quote. Quidax-compatible result shape:
   * {id, from_currency, to_currency, from_amount, received_amount, swap_quotation:{...}}
   */
  async executeSwap(quotationId) {
    const data = await this._request('POST', `/trades/quote/${encodeURIComponent(quotationId)}`, {});
    const d = data?.data || {};
    const fromCode = this._fromObiexCurrency(d.pair?.source?.code);
    const toCode = this._fromObiexCurrency(d.pair?.target?.code);
    return {
      id: d.id,
      from_currency: fromCode,
      to_currency: toCode,
      from_amount: d.amount,
      received_amount: d.amountReceived,
      to_amount: d.amountReceived,
      rate: d.rate,
      swap_quotation: {
        from_currency: fromCode,
        to_currency: toCode,
        from_amount: d.amount,
        to_amount: d.amountReceived,
      },
      raw: d,
    };
  }

  /** One-shot create+execute — available for future use; current call sites reuse quote+accept. */
  async instantSwap({ from, to, amount, amountToReceive, side = 'from' }) {
    const body = {
      sourceId: this._toObiexCurrency(from),
      targetId: this._toObiexCurrency(to),
      side: side === 'to' ? 'BUY' : 'SELL',
      ...(amountToReceive != null ? { amountToReceive: Number(amountToReceive) } : { amount: Number(amount) }),
    };
    const data = await this._request('POST', '/trades/swap', body);
    const d = data?.data || {};
    const fromCode = this._fromObiexCurrency(d.pair?.source?.code);
    const toCode = this._fromObiexCurrency(d.pair?.target?.code);
    return {
      id: d.id,
      from_currency: fromCode,
      to_currency: toCode,
      from_amount: d.amount,
      received_amount: d.amountReceived,
      to_amount: d.amountReceived,
      rate: d.rate,
      raw: d,
    };
  }

  // ── Rates ────────────────────────────────────────────────────────────────

  /** Quidax-compatible: returns a plain number (rate of `to` per 1 `from`), or null. */
  async getExchangeRate(from, to) {
    const fromU = String(from).toUpperCase();
    const toU = String(to).toUpperCase();
    if (fromU === toU) return 1;
    const cacheKey = `rate:${fromU}:${toU}`;
    const cached = this._getFromCache(cacheKey, this._cacheTTL.rates);
    if (cached != null) return cached;
    try {
      const quote = await this.getSwapQuote({ from: fromU, to: toU, amount: 1, side: 'from' });
      const rate = Number(quote?.to_amount);
      if (!(rate > 0)) return null;
      this._setCache(cacheKey, rate);
      return rate;
    } catch (e) {
      logger.warn(`[Obiex] getExchangeRate ${fromU}/${toU} failed: ${e.message}`);
      return null;
    }
  }

  // ── Transactions & balances ─────────────────────────────────────────────────

  async getTransactionById(id) {
    const data = await this._request('GET', `/transactions/${encodeURIComponent(id)}`);
    return data?.data || null;
  }

  /** Quidax-compatible name: getSwapTransaction(id) — same lookup as getTransactionById. */
  async getSwapTransaction(id) {
    return this.getTransactionById(id);
  }

  /** List this account's swap transactions (category=SWAP). */
  async getSwapTransactions() {
    const data = await this._request('GET', '/transactions/me', undefined, { category: 'SWAP' });
    return data?.data || [];
  }

  /** The broker's own pooled balance for a currency (NOT per-user) — used for Treasury display. */
  async getWalletBalance(currency) {
    const data = await this._request('GET', `/wallets/${encodeURIComponent(String(currency).toUpperCase())}`);
    return data?.data || null;
  }

  getCircuitBreakerState() {
    return this.circuitBreaker?.getState?.() || { state: 'UNKNOWN' };
  }
}

export default new ObiexAdapter();
