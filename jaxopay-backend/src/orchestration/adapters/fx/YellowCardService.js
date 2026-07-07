import axios from 'axios';
import crypto from 'crypto';
import logger from '../../../utils/logger.js';

/**
 * Yellow Card Payments API adapter — International payments (disbursements) & FX.
 * Docs: https://docs.yellowcard.engineering
 *
 * Auth: HMAC V1.
 *   X-YC-Timestamp: <ISO8601 now>
 *   Authorization: YcHmacV1 <apiKey>:<signature>
 *   signature = base64( HMAC-SHA256( secret,  timestamp + path + METHOD + base64(sha256(body)) ) )
 *   - `path` is the request path INCLUDING query string (must match exactly what is sent).
 *   - the body hash segment is only included when there is a request body.
 *
 * Replaces GraphFinanceService for the cross-border feature. Implements the same
 * method surface CurrencyEngineService expects (getExchangeRate, swapCurrency,
 * sendInternationalPayment, getWalletBalances, checkTransactionStatus) plus the
 * underlying Yellow Card primitives (channels, networks, rates, account, resolve).
 */
class YellowCardService {
  constructor() {
    this.apiKey = process.env.YELLOWCARD_API_KEY;
    this.secretKey = process.env.YELLOWCARD_SECRET_KEY;
    // Sandbox by default. Production: https://api.yellowcard.io
    this.baseURL = (process.env.YELLOWCARD_BASE_URL || 'https://sandbox.api.yellowcard.io').replace(/\/$/, '');
  }

  isConfigured() {
    return !!(this.apiKey && this.secretKey && !String(this.apiKey).includes('your_'));
  }

  _ensure() {
    if (!this.isConfigured()) {
      throw { message: 'International payments service (Yellow Card) is not configured', statusCode: 503 };
    }
  }

  /** Build Yellow Card HMAC V1 auth headers for a request. */
  _authHeaders(method, path, body) {
    const timestamp = new Date().toISOString();
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(timestamp);
    hmac.update(path);
    hmac.update(method.toUpperCase());
    if (body !== undefined && body !== null) {
      const bodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('base64');
      hmac.update(bodyHash);
    }
    const signature = hmac.digest('base64');
    return {
      'X-YC-Timestamp': timestamp,
      Authorization: `YcHmacV1 ${this.apiKey}:${signature}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * @param {string} method
   * @param {string} path  full path incl. query string (this exact value is signed)
   * @param {object} [body]
   */
  async _request(method, path, body = undefined) {
    this._ensure();
    const url = `${this.baseURL}${path}`;
    // Yellow Card signs the pathname only — NOT the query string.
    const signPath = path.split('?')[0];
    try {
      const res = await axios({
        method,
        url,
        data: body,
        headers: this._authHeaders(method, signPath, body),
        timeout: 45000,
        validateStatus: (s) => s < 500,
      });
      if (res.status >= 400) {
        const msg = res.data?.message || res.data?.error || `Yellow Card request failed (${res.status})`;
        throw { message: msg, statusCode: res.status, raw: res.data };
      }
      return res.data;
    } catch (err) {
      if (err.statusCode) throw err;
      const data = err.response?.data;
      const msg = data?.message || data?.error || err.message;
      logger.error(`[YellowCard] ${method} ${path} failed:`, data || err.message);
      throw { message: msg || 'Yellow Card request failed', statusCode: err.response?.status || 502, raw: data };
    }
  }

  // ── Primitives ────────────────────────────────────────────────────────────
  /** Payment channels (methods) available for a country, e.g. bank/momo. */
  async getChannels(country) {
    const qs = country ? `?country=${encodeURIComponent(country)}` : '';
    const data = await this._request('GET', `/business/channels${qs}`);
    return data?.channels || data?.data || data || [];
  }

  /** Networks (banks / mobile-money operators) for a country. */
  async getNetworks(country) {
    const qs = country ? `?country=${encodeURIComponent(country)}` : '';
    const data = await this._request('GET', `/business/networks${qs}`);
    return data?.networks || data?.data || data || [];
  }

  /** Raw rate table (per-currency vs USD). */
  async getRates() {
    const data = await this._request('GET', '/business/rates');
    return data?.rates || data?.data || data || [];
  }

  /** Merchant account + settlement balances. */
  async getAccount() {
    return this._request('GET', '/business/account');
  }

  /** Countries we can pay out to — derived from active 'withdraw' channels, with currency + min. */
  async getPayoutCountries() {
    const channels = await this.getChannels();
    const map = {};
    for (const c of channels) {
      if (String(c.rampType || '').toLowerCase() !== 'withdraw') continue;
      if (c.status !== 'active' && c.apiStatus !== 'active') continue;
      if (!c.country) continue;
      const cur = String(c.currency || '').toUpperCase();
      const m = (map[c.country] ||= { currencies: new Set(), currency: cur, min: c.min ?? 0, max: c.max ?? 0 });
      if (cur) m.currencies.add(cur);
      // lowest min / highest max across the country's withdraw channels
      if (c.min != null) m.min = m.min ? Math.min(m.min, c.min) : c.min;
      if (c.max != null) m.max = Math.max(m.max || 0, c.max);
    }
    return Object.entries(map)
      .map(([country, m]) => ({
        country,
        currencies: [...m.currencies].filter(Boolean),
        currency: m.currency,
        min: m.min || 0,
        max: m.max || 0,
      }))
      .sort((a, b) => a.country.localeCompare(b.country));
  }

  /** Active networks (banks / mobile-money) for a country, for the recipient picker. */
  async getPayoutNetworks(country) {
    const nets = await this.getNetworks(country);
    return (nets || [])
      .filter((n) => n.status === 'active')
      .map((n) => ({
        id: n.id,
        name: n.name,
        code: n.code,
        accountNumberType: n.accountNumberType, // 'bank' | 'phone'
        channelType: n.channelType,
        channelIds: n.channelIds || [],
      }));
  }

  /** Pick an active 'withdraw' channel for a country (preferring one the network supports). */
  async getWithdrawChannel(country, { currency, networkChannelIds } = {}) {
    const channels = await this.getChannels(country);
    let list = channels.filter(
      (c) => String(c.rampType || '').toLowerCase() === 'withdraw' && (c.status === 'active' || c.apiStatus === 'active')
    );
    if (currency) {
      const cur = String(currency).toUpperCase();
      const byCur = list.filter((c) => String(c.currency || '').toUpperCase() === cur);
      if (byCur.length) list = byCur;
    }
    if (networkChannelIds?.length) {
      const match = list.find((c) => networkChannelIds.includes(c.id));
      if (match) return match;
    }
    return list[0] || null;
  }

  // ── CurrencyEngineService interface ─────────────────────────────────────────
  /**
   * Yellow Card rates are quoted per-currency against USD. Each entry looks like
   * { code, buy, sell, ... } where `sell`/`buy` are local units per 1 USD.
   * We derive a cross rate (from → to) via USD.
   */
  async getExchangeRate(fromCurrency, toCurrency) {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) return { rate: 1, fromCurrency: from, toCurrency: to, provider: 'yellowcard' };

    const rates = await this.getRates();
    const find = (cur) =>
      rates.find((r) => String(r.code || r.currency || '').toUpperCase() === cur);

    // local units per 1 USD (prefer `sell`, fall back to `rate`/`buy`)
    const perUsd = (entry) => {
      if (!entry) return null;
      const v = entry.sell ?? entry.rate ?? entry.buy;
      const n = parseFloat(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const usdPerFrom = from === 'USD' ? 1 : perUsd(find(from));
    const usdPerTo = to === 'USD' ? 1 : perUsd(find(to));
    if (!usdPerFrom || !usdPerTo) {
      throw { message: `Rate unavailable for ${from}/${to}`, statusCode: 400 };
    }

    // amount_to = amount_from * (usdPerTo / usdPerFrom)
    const rate = usdPerTo / usdPerFrom;
    return {
      rate,
      fromCurrency: from,
      toCurrency: to,
      provider: 'yellowcard',
      raw: { usdPerFrom, usdPerTo },
    };
  }

  /**
   * Internal FX swap between a user's own wallets uses only Yellow Card's rate;
   * there is no external Yellow Card transaction (Jaxopay holds both currencies).
   * CurrencyEngineService performs the wallet debit/credit; we just acknowledge.
   */
  async swapCurrency({ fromCurrency, toCurrency, amount }) {
    return {
      id: `yc-swap-${Date.now()}`,
      status: 'SUCCESS',
      internal: true,
      fromCurrency,
      toCurrency,
      amount,
    };
  }

  /**
   * International payout (disbursement) via Yellow Card. Payload verified against sandbox.
   * @param {object} p
   *   amount (in destination local currency), destinationCountry (ISO2, e.g. NG),
   *   recipientName, accountNumber, networkId, networkName, networkAccountType ('bank'|'phone'),
   *   networkChannelIds[], sender {name,country,phone,address,dob,email,idNumber,idType},
   *   reason (YC enum, default 'other'), currency (destination currency, optional hint).
   */
  async sendInternationalPayment(p) {
    const channel = await this.getWithdrawChannel(p.destinationCountry, {
      currency: p.currency,
      networkChannelIds: p.networkChannelIds,
    });
    if (!channel) {
      throw { message: `No active Yellow Card payout channel for ${p.destinationCountry}`, statusCode: 400 };
    }

    const sequenceId = crypto.randomUUID();
    const accountType = p.networkAccountType === 'phone' ? 'momo' : 'bank';
    const body = {
      channelId: channel.id,
      sequenceId, // idempotency key
      currency: channel.currency,
      country: p.destinationCountry,
      localAmount: Number(p.amount),
      reason: p.reason || 'other',
      sender: p.sender,
      destination: {
        accountName: p.recipientName,
        accountNumber: p.accountNumber,
        accountType,
        networkId: p.networkId,
        accountBank: p.networkName,
      },
      forceAccept: true,
      customerType: 'retail',
    };

    const data = await this._request('POST', '/business/payments', body);
    return {
      id: data?.id || data?.paymentId || data?.data?.id || sequenceId,
      status: (data?.status || 'PROCESSING').toString().toUpperCase(),
      sequenceId,
      raw: data,
    };
  }

  async getWalletBalances() {
    const acct = await this.getAccount();
    // Real shape: { accounts: [{ available, currency, currencyType }] }
    const list = acct?.accounts || acct?.balances || acct?.data?.accounts || acct?.wallets || [];
    const out = {};
    if (Array.isArray(list)) {
      for (const b of list) {
        const cur = String(b.currency || b.code || '').toUpperCase();
        if (cur) out[cur] = { balance: parseFloat(b.available ?? b.balance ?? 0) || 0 };
      }
    }
    return out;
  }

  async checkTransactionStatus(transactionId) {
    const data = await this._request('GET', `/business/payments/${encodeURIComponent(transactionId)}`);
    return {
      id: transactionId,
      status: (data?.status || 'UNKNOWN').toString().toUpperCase(),
      raw: data,
    };
  }
}

export default new YellowCardService();
