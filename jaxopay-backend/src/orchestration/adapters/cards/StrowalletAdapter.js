import axios from 'axios';
import crypto from 'crypto';
import BaseAdapter from '../../interfaces/BaseAdapter.js';
import logger from '../../../utils/logger.js';

/**
 * Strowallet — Virtual cards (BitVCard) & related operations.
 * Docs: https://strowallet.readme.io/reference/live-endpoints
 *
 * Auth: public_key on requests; secret_key used for IPN/signature verification (express checkout pattern).
 */
/** Unique reference: Strowallet often rejects hyphens/special chars in trx */
function buildStrowalletTrx(customerId) {
  const id = String(customerId || '').replace(/[^a-zA-Z0-9]/g, '');
  const ts = Date.now();
  const base = `jx${id}${ts}`;
  return base.length > 80 ? base.slice(-80) : base;
}

/** Laravel-style { message, errors: { field: ['...'] } } */
function formatStrowalletApiMessage(data) {
  if (!data || typeof data !== 'object') return 'Request failed';
  const errs = data.errors;
  if (errs && typeof errs === 'object' && !Array.isArray(errs)) {
    const parts = [];
    for (const [k, v] of Object.entries(errs)) {
      const msg = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v);
      if (msg) parts.push(`${k}: ${msg}`);
    }
    if (parts.length) return parts.join('; ');
  }
  const m = data.message;
  if (typeof m === 'string' && m.trim()) return m.trim();
  if (m && typeof m === 'object') return JSON.stringify(m);
  return 'Request failed';
}

class StrowalletAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'Strowallet';
    this.publicKey = process.env.STROWALLET_PUBLIC_KEY;
    this.secretKey = process.env.STROWALLET_SECRET_KEY;
    this.base = (process.env.STROWALLET_BASE_URL || 'https://strowallet.com').replace(/\/$/, '');
  }

  _configured() {
    return !!(this.publicKey && this.secretKey);
  }

  _ensure() {
    if (!this._configured()) {
      throw { message: 'Virtual card service is not configured', statusCode: 503 };
    }
  }

  /**
   * Verify payment / IPN signature (amount + currency + custom + trx_num)
   */
  verifyPaymentSignature(amount, currency, custom, trxNum, sentSign) {
    this._ensure();
    const string = `${amount}${currency}${custom}${trxNum}`;
    const mySign = crypto.createHmac('sha256', this.secretKey).update(string).digest('hex').toUpperCase();
    return mySign === String(sentSign || '').toUpperCase();
  }

  async _postForm(path, fields = {}) {
    this._ensure();
    const params = new URLSearchParams();
    params.append('public_key', this.publicKey);
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });

    const url = `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const res = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 45000,
        validateStatus: (s) => s < 500,
      });
      const data = res.data;
      if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
        throw { message: 'Virtual card service returned an invalid response. Please try again later.', statusCode: 502 };
      }
      if (res.status >= 400 && typeof data === 'object' && data !== null) {
        const msg = formatStrowalletApiMessage(data);
        throw { message: msg, statusCode: res.status, raw: data };
      }
      // 200/201 with logical error (common for Strowallet / Laravel validators)
      const logicalFailure =
        typeof data === 'object' &&
        data !== null &&
        (data.error === 'error' ||
          data.status === false ||
          data.success === false ||
          data.status === 'error' ||
          data.status === 'failed');
      if (res.status < 400 && logicalFailure) {
        const msg = formatStrowalletApiMessage(data);
        throw { message: msg, statusCode: 422, raw: data };
      }
      return data;
    } catch (err) {
      const data = err.response?.data;
      let msg;
      if (data && typeof data === 'object') msg = formatStrowalletApiMessage(data);
      else msg = typeof data === 'string' ? data : err.message;
      logger.error(`[Strowallet] POST ${path} failed:`, data || err.message);
      throw { message: msg || 'Virtual card request failed', statusCode: err.response?.status || 502, raw: data };
    }
  }

  /**
   * Register card customer (if required before creating a card).
   */
  async createCardUser({ name, email, phone }) {
    const em = (email || '').trim();
    const fields = {
      name,
      email: em,
      customerEmail: em,
      customer_email: em,
    };
    if (phone && String(phone).trim()) fields.phone = String(phone).trim();
    const data = await this._postForm('/api/bitvcard/card-user', fields);
    return this._unwrap(data);
  }

  /**
   * Create USD virtual card (BitVCard).
   * Maps to Graph-style response for card.controller.
   */
  async createCard(params) {
    this._ensure();
    const {
      cardholderName,
      email,
      amount = 10,
      phone,
      customerId,
      currency = 'USD',
      billingAddress,
      cardType = 'multi_use',
    } = params;

    const trx = buildStrowalletTrx(customerId);
    const amt = Math.max(1, Math.round(Number(amount) || 0));
    const em = (email || 'noreply@jaxopay.com').trim().slice(0, 120);
    const typeNorm = String(cardType || 'multi_use').trim().toLowerCase().replace(/-/g, '_');
    const fields = {
      name: (cardholderName || 'JAXOPAY User').trim().slice(0, 120),
      email: em,
      customerEmail: em,
      customer_email: em,
      amount: String(amt),
      trx,
      currency: String(currency).toUpperCase().slice(0, 8),
      card_type: typeNorm,
      cardType: typeNorm,
    };
    if (phone && String(phone).trim()) fields.phone = String(phone).replace(/\s+/g, '').slice(0, 24);
    if (billingAddress?.line1) fields.address = String(billingAddress.line1).slice(0, 120);
    if (billingAddress?.city) fields.city = String(billingAddress.city).slice(0, 80);
    if (billingAddress?.state) fields.state = String(billingAddress.state).slice(0, 40);
    if (billingAddress?.country) fields.country = String(billingAddress.country).slice(0, 3);
    if (billingAddress?.postal_code) fields.zip = String(billingAddress.postal_code).slice(0, 20);

    try {
      const userRes = await this.createCardUser({
        name: fields.name,
        email: em,
        phone: fields.phone,
      });
      const inner = typeof userRes === 'object' && userRes !== null ? userRes : {};
      const extId =
        inner.user_id ||
        inner.customer_id ||
        inner.id ||
        inner.card_user_id ||
        inner.data?.user_id ||
        inner.data?.customer_id;
      if (extId) {
        fields.customer_id = String(extId);
        fields.user_id = String(extId);
      }
    } catch (e) {
      logger.warn('[Strowallet] card-user registration skipped or failed:', e.message || e);
    }

    const data = await this._postForm('/api/bitvcard/create-card/', fields);
    return this._normalizeCreateResponse(data);
  }

  async fundCard(cardId, amount) {
    const data = await this._postForm('/api/bitvcard/fund-card/', {
      card_id: cardId,
      amount: String(amount),
    });
    return { success: true, raw: this._unwrapSafe(data) };
  }

  async fetchCardDetail(cardId) {
    const data = await this._postForm('/api/bitvcard/fetch-card-detail/', {
      card_id: cardId,
    });
    return this._unwrap(data);
  }

  async listCardTransactions(cardId, page = 1) {
    const data = await this._postForm('/api/bitvcard/card-transactions/', {
      card_id: cardId,
      page: String(page),
    });
    return this._unwrap(data);
  }

  /** Strowallet may not expose freeze; no-op success for orchestration compatibility */
  async freezeCard(_cardId) {
    logger.info('[Strowallet] freezeCard — no remote freeze API; DB-only freeze');
    return { success: true };
  }

  async unfreezeCard(_cardId) {
    return { success: true };
  }

  _unwrapSafe(data) {
    if (!data || typeof data !== 'object') return data;
    if (
      data.error === 'error' ||
      data.status === false ||
      data.success === false ||
      data.status === 'error' ||
      data.status === 'failed'
    ) {
      throw { message: formatStrowalletApiMessage(data), statusCode: 422, raw: data };
    }
    return data.data ?? data.message ?? data;
  }

  _unwrap(data) {
    return this._unwrapSafe(data);
  }

  _normalizeCreateResponse(data) {
    const raw = this._unwrap(data);
    if (typeof raw !== 'object' || raw === null) {
      throw {
        message: 'Virtual card service returned an unexpected response',
        statusCode: 502,
        raw: data,
      };
    }
    const d = raw;

    const cardId =
      d.card_id ||
      d.cardId ||
      d.id ||
      d.reference ||
      d.card_reference ||
      (d.card_hash != null && d.card_hash !== '' ? String(d.card_hash) : '');

    const pan = d.card_number || d.card || d.pan || d.number || null;
    const cvv = d.cvv || d.cvv2 || d.card_cvv || null;
    let expiry = d.expiry || d.exp_date || null;
    if (!expiry && (d.expiry_month || d.exp_month) && (d.expiry_year || d.exp_year)) {
      const m = String(d.expiry_month || d.exp_month).padStart(2, '0');
      const y = String(d.expiry_year || d.exp_year).slice(-2);
      expiry = `${m}/${y}`;
    }

    const [em, ey] = (expiry && expiry.includes('/')
      ? expiry.split('/')
      : ['12', String(new Date().getFullYear()).slice(-2)]);

    if (!String(cardId || '').trim() && !pan) {
      throw {
        message:
          'Could not complete virtual card creation. Please try again or contact support.',
        statusCode: 502,
        raw: d,
      };
    }

    return {
      success: true,
      cardId: String(cardId || '').trim() || `sw-${Date.now()}`,
      status: d.status || 'active',
      details: {
        pan,
        cvv,
        expiry: expiry || `${String(em).padStart(2, '0')}/${ey}`,
        expiryMonth: parseInt(em, 10) || 12,
        expiryYear: parseInt(ey.length === 2 ? `20${ey}` : ey, 10) || new Date().getFullYear(),
        balance: d.balance != null ? parseFloat(d.balance) : undefined,
        billingAddress: d.billing_address || null,
        cardholderName: d.name || d.cardholder_name,
      },
      raw: d,
    };
  }

  /**
   * Secure PAN/CVV — use fetch detail if full numbers returned
   */
  async getSecureCardData(cardId) {
    try {
      const d = await this.fetchCardDetail(cardId);
      return {
        pan: d.card_number || d.pan || d.card || null,
        cvv: d.cvv || d.cvv2 || null,
        expiry: d.expiry || (d.expiry_month && d.expiry_year ? `${d.expiry_month}/${d.expiry_year}` : null),
        billing_address: d.billing_address || null,
      };
    } catch (e) {
      logger.warn('[Strowallet] getSecureCardData failed:', e.message);
      return null;
    }
  }

  async getCard(cardId) {
    const d = await this.fetchCardDetail(cardId);
    return {
      success: true,
      cardId,
      details: {
        balance: d.balance != null ? parseFloat(d.balance) : undefined,
        pan: d.card_number || d.pan,
      },
      raw: d,
    };
  }
}

export default StrowalletAdapter;
