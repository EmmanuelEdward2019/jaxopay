import crypto from 'crypto';
import { createApiClient } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';
import { circuitBreakers } from '../../../utils/circuitBreaker.js';

// Same set duplicated in crypto.controller.js / kycLimits.service.js / swapMarkup.service.js —
// not imported from swapMarkup.service.js here specifically because that file imports this
// adapter (obiex), so importing back would be a circular dependency.
const FIAT_CURRENCIES = new Set(['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR', 'CAD', 'CNY', 'AUD', 'JPY']);
const isFiat = (code) => FIAT_CURRENCIES.has(String(code || '').toUpperCase());

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
      // req.url is the path passed to client.request/get/post (relative), e.g. '/trades/quote',
      // and INCLUDES the query string when one is present (see _request() — params are appended
      // to the url directly, not passed via axios's separate `params` option). Sign it as-is:
      // confirmed empirically that Obiex's HMAC DOES cover the query string — GET requests with
      // query params (e.g. /ngn-payments/accounts/resolve?sortCode=..&accountNumber=..) return
      // 401 "Unable to verify authorization token" if it's excluded from the signed content.
      const urlPath = String(req.url || '');
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

    // Tracks whether a quotation was created against a "reversed" trade pair (buying the
    // caller's `from` currency's counterpart — see _resolvePairOrientation) so executeSwap()
    // can correctly relabel its from/to using the ORIGINAL caller intent, not Obiex's canonical
    // pair orientation. Quotes expire in ~30s, so a short 5-minute sweep is generous headroom.
    this._quoteOrientation = new Map(); // quotationId -> { reversed, from, to }
    setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [id, entry] of this._quoteOrientation.entries()) {
        if (entry._storedAt < cutoff) this._quoteOrientation.delete(id);
      }
    }, 60 * 1000).unref?.();
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
    // isOperational (below) marks this as trusted, so the global error handler forwards this
    // message straight to the end user in production — never let the provider's own name leak
    // into it (this fallback used to read 'Obiex request failed' verbatim).
    const msg = data?.errors?.[0]?.message || data?.message || err.message || 'Request could not be completed. Please try again.';
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
      logger.error('[Obiex] Adapter called without OBIEX_API_KEY/OBIEX_API_SECRET configured');
      const e = new Error('This service is temporarily unavailable. Please try again shortly.');
      e.statusCode = 503;
      throw e;
    }
    try {
      // Query params are appended directly to `url` (not passed via axios's separate `params`
      // option) so the signing interceptor — which reads `req.url` — sees the exact same string
      // that gets sent, guaranteeing the signed content and the actual request always match.
      const qs = params && Object.keys(params).length > 0
        ? `?${new URLSearchParams(params).toString()}`
        : '';
      const res = await this.circuitBreaker.execute(() =>
        this.client.request({ method, url: `${path}${qs}`, data: body })
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
    const list = (data?.data || []).map((c) => {
      // Obiex lists the Naira as NGNX (see _fromObiexCurrency above), not NGN — this was
      // returning that raw code untranslated, so even after fixing the type below, the entry
      // still couldn't match CryptoScreen.tsx's `['NGN','GHS'].includes(s.coin)` filter (looking
      // for 'NGN', getting 'NGNX') and isFiat('NGNX') itself fell through to 'coin' anyway
      // (FIAT_CURRENCIES lists 'NGN', not 'NGNX'). Translate first, then classify.
      const code = this._fromObiexCurrency(c.code);
      return {
        code,
        name: c.name,
        // Was hardcoded 'coin' for every entry Obiex returns — crypto.controller.js's
        // getSupportedCryptos maps type==='coin' to 'crypto' and anything else to 'fiat', so this
        // silently meant NOTHING ever came back as fiat, even though NGN/GHS are both real
        // tradeable currencies on Obiex. That broke CryptoScreen.tsx's availableCoins filter for
        // fiat pairs (`s.type === 'fiat' && ['NGN','GHS'].includes(s.coin)`) — the code to show
        // those pairs already existed, it just never had anything to find.
        type: isFiat(code) ? 'fiat' : 'coin',
        min_deposit_amount: 0,
        precision: c.maximumDecimalPlaces ?? 8,
        networks: [],
        active: c.active !== false,
        withdrawable: c.withdrawable !== false,
        receivable: c.receivable !== false,
      };
    });
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

  /** Bank list for Naira withdrawal — { name, uuid (=bank code), sortCode }. Cached 10 min. */
  async getNgnBanks() {
    const cacheKey = 'ngn:banks';
    const cached = this._getFromCache(cacheKey, this._cacheTTL.currencies);
    if (cached) return cached;
    const data = await this._request('GET', '/ngn-payments/banks');
    const list = data?.data || [];
    this._setCache(cacheKey, list);
    return list;
  }

  /**
   * Resolve a Naira account number to its holder's name — GET /ngn-payments/accounts/resolve.
   * sortCode is the SAME code returned by getNgnBanks() (uuid/sortCode), so the bank the user
   * picks from getNgnBanks() can be resolved and paid out using one consistent code throughout.
   * Returns { account_name, account_number } (Korapay-shaped, for drop-in compatibility).
   */
  async resolveNgnAccount(sortCode, accountNumber) {
    const data = await this._request('GET', '/ngn-payments/accounts/resolve', undefined, {
      sortCode, accountNumber,
    });
    const d = data?.data || {};
    return {
      account_name: d.accountName || null,
      account_number: d.accountNumber || accountNumber,
    };
  }

  /**
   * Real Nigerian bank-account payout (NOT a crypto/address withdrawal) — POST /wallets/ext/debit/fiat.
   * destination: { accountNumber, accountName, bankName, bankCode } (bankCode from getNgnBanks()'s
   * `uuid`/`sortCode` field). Returns a Quidax-shaped {data:{id}, id, status, reference}.
   * `currency` is translated NGN->NGNX like every other Obiex trading/wallet call — Obiex rejects
   * a literal "NGN" here with "Currency NGN not available for withdrawal".
   */
  async withdrawFiat({ currency = 'NGN', amount, accountNumber, accountName, bankName, bankCode, reference, narration }) {
    // Obiex caps narration at 40 chars — our own default (which embeds the recipient's name)
    // can easily exceed that, and any free-text narration a user typed isn't bounded either.
    const rawNarration = narration || `Jaxopay withdrawal ${reference || ''}`.trim();
    const body = {
      destination: { accountNumber, accountName, bankName, bankCode },
      amount: Number(amount),
      currency: this._toObiexCurrency(currency),
      narration: String(rawNarration).slice(0, 40),
    };
    const data = await this._request('POST', '/wallets/ext/debit/fiat', body);
    const d = data?.data || {};
    return {
      data: { id: d.id || d.reference },
      id: d.id || d.reference,
      status: d.payout?.status || 'PENDING',
      reference: d.reference || reference,
      fee: d.payout?.fee,
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
   * Obiex registers each trade pair in ONE canonical (source, target) orientation (per
   * `GET /trades/pairs` — e.g. source=BTC/target=NGNX, never the reverse as a separate pair).
   * `isSellable` means you can sell sourceId for targetId through this pair; `isBuyable` means
   * you can buy sourceId USING targetId through this SAME pair (i.e. pay targetId, receive
   * sourceId) — that's the mechanism for "buy crypto with NGN", not a second reversed pair.
   * Cached for 10 minutes — pair list is static within a session.
   */
  async getTradePairs() {
    const cacheKey = 'trades:pairs';
    const cached = this._getFromCache(cacheKey, this._cacheTTL.currencies);
    if (cached) return cached;
    const data = await this._request('GET', '/trades/pairs');
    const list = data?.data || [];
    this._setCache(cacheKey, list);
    return list;
  }

  /**
   * Resolve the request shape Obiex actually expects for a user-level (from -> to) swap,
   * given pairs are registered in one fixed orientation. Returns:
   *   { sourceId, targetId, side, reversed } — reversed=true means the canonical pair has
   *   fromObiex as its TARGET (buying fromObiex's counterpart), so side='BUY' is used instead
   *   of assuming sourceId/targetId always match the caller's from/to directly.
   */
  async _resolvePairOrientation(fromObiex, toObiex) {
    const pairs = await this.getTradePairs();
    const direct = pairs.find((p) => p.source?.code === fromObiex && p.target?.code === toObiex);
    if (direct && direct.isSellable !== false) {
      return { sourceId: fromObiex, targetId: toObiex, side: 'SELL', reversed: false };
    }
    const reverse = pairs.find((p) => p.source?.code === toObiex && p.target?.code === fromObiex);
    if (reverse && reverse.isBuyable !== false) {
      return { sourceId: toObiex, targetId: fromObiex, side: 'BUY', reversed: true };
    }
    const e = new Error(`Trade pair not available: ${fromObiex} -> ${toObiex}`);
    e.statusCode = 400;
    throw e;
  }

  /**
   * Quidax-compatible: getSwapQuote({from,to,amount,side}) where side 'from' means `amount` is
   * how much of `from` is being given up, and side 'to' means `amount` is how much of `to` the
   * user wants to receive. Internally resolves the correct Obiex sourceId/targetId/BUY-SELL
   * orientation via `_resolvePairOrientation` — never assumes from/to map 1:1 onto sourceId/targetId.
   * Returns: {id, from_currency, to_currency, from_amount, to_amount, quoted_price, expires_at}
   */
  async getSwapQuote({ from, to, amount, side = 'from' }) {
    const fromObiex = this._toObiexCurrency(from);
    const toObiex = this._toObiexCurrency(to);
    const { sourceId, targetId, side: obiexSide, reversed } = await this._resolvePairOrientation(fromObiex, toObiex);

    // amountIsForFrom: true when the caller's `amount` is denominated in `from` (side='from'),
    // i.e. what the caller is giving up. Obiex's `amount` field always means "what the caller is
    // giving up" and `amountToReceive` always means "what the caller wants to receive" —
    // regardless of which side (BUY/SELL) the pair's canonical orientation resolved to. Confirmed
    // with Obiex support: buying BTC with NGN on the BTC/NGNX pair is
    // { sourceId:"BTC", targetId:"NGNX", side:"BUY", amount:<NGN amount> } — `amount` here
    // denominates the NGN (target leg) being spent, precisely because side=BUY flips which leg
    // is "given up". Previously this flipped to `amountToReceive` whenever `reversed` was true,
    // which sent the wrong field (and so the wrong value) for every NGN->crypto buy.
    const amountIsForFrom = side !== 'to';

    const body = {
      sourceId,
      targetId,
      side: obiexSide,
      ...(amountIsForFrom ? { amount: Number(amount) } : { amountToReceive: Number(amount) }),
    };
    const data = await this._request('POST', '/trades/quote', body);
    const d = data?.data || {};
    // d.amount/d.amountReceived mirror the request's give/receive semantics, NOT sourceId/targetId
    // — same as the request body above. Confirmed against a live BUY trade (2026-07-29): reversing
    // these based on `reversed` swapped the NGN and crypto amounts between currencies (e.g. a
    // ₦1399 buy was recorded as "₦0.9996 → 1399 USDT" instead of "₦1399 → 0.9996 USDT"). No
    // reversal needed — `amount` is always the from-leg, `amountReceived` always the to-leg.
    const fromAmount = d.amount;
    const toAmount = d.amountReceived;
    if (d.id) {
      this._quoteOrientation.set(d.id, {
        reversed, from: String(from).toUpperCase(), to: String(to).toUpperCase(), _storedAt: Date.now(),
      });
    }
    return {
      id: d.id,
      from_currency: String(from).toUpperCase(),
      to_currency: String(to).toUpperCase(),
      from_amount: fromAmount,
      to_amount: toAmount,
      quoted_price: fromAmount > 0 ? toAmount / fromAmount : d.rate,
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

    // Prefer the orientation recorded when the quote was created (getSwapQuote) — Obiex's raw
    // pair.source/target reflect ITS canonical pair orientation, which is reversed vs. the
    // caller's from/to whenever the swap went through the isBuyable/BUY-side path. Only fall back
    // to the raw pair codes (correct in the non-reversed case) if the orientation record isn't
    // found — e.g. an older in-flight quote created before this tracking existed.
    const orientation = this._quoteOrientation.get(quotationId);
    this._quoteOrientation.delete(quotationId);

    const fromCode = orientation ? orientation.from : this._fromObiexCurrency(d.pair?.source?.code);
    const toCode = orientation ? orientation.to : this._fromObiexCurrency(d.pair?.target?.code);
    // d.amount/d.amountReceived mirror give/receive semantics, not sourceId/targetId — same fix
    // as getSwapQuote (see its comment). No reversal based on orientation.reversed: that was
    // swapping the NGN/crypto amounts between currencies for every BUY-direction swap.
    const fromAmount = d.amount;
    const toAmount = d.amountReceived;

    return {
      id: d.id,
      from_currency: fromCode,
      to_currency: toCode,
      from_amount: fromAmount,
      received_amount: toAmount,
      to_amount: toAmount,
      rate: d.rate,
      swap_quotation: {
        from_currency: fromCode,
        to_currency: toCode,
        from_amount: fromAmount,
        to_amount: toAmount,
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
