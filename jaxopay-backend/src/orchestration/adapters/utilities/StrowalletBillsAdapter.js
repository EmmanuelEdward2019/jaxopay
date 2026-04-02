import axios from 'axios';
import logger from '../../../utils/logger.js';

/**
 * Strowallet Bills Payments (Bills Payments section).
 * Auth: STROWALLET_PUBLIC_KEY + STROWALLET_SECRET_KEY (same as virtual cards).
 * Docs: https://strowallet.readme.io/reference/buy-airtime
 *
 * Exact form field names can differ slightly by Strowallet version; callers may pass
 * metadata.strowallet on pay/validate to merge extra POST fields.
 */

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

function isLogicalFailure(data) {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data.error === 'error' ||
      data.status === false ||
      data.success === false ||
      data.status === 'error' ||
      data.status === 'failed')
  );
}

function isSuccess(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    data.error === 'ok' ||
    data.status === true ||
    data.status === 'success' ||
    data.success === true
  );
}

function normalizeDisco(dis) {
  const raw = String(dis || '').trim().toLowerCase();
  if (!raw) return raw;

  const s = raw.replace(/\s+/g, '-');

  if (s.includes('port-harcourt') || s.includes('phed') || s.includes('portharcourt')) return 'portharcourt-electric';
  if (s.includes('ikeja')) return 'ikeja-electric';
  if (s.includes('eko')) return 'eko-electric';
  if (s.includes('abuja')) return 'abuja-electric';
  if (s.includes('kano')) return 'kano-electric';
  if (s.includes('kaduna')) return 'kaduna-electric';
  if (s.includes('jos')) return 'jos-electric';
  if (s.includes('ibadan')) return 'ibadan-electric';
  if (s.includes('enugu')) return 'enugu-electric';
  if (s.includes('benin')) return 'benin-electric';
  if (s.includes('yola')) return 'yola-electric';
  if (s.includes('aba')) return 'aba-electric';

  // Generic fallback: strip "-electric" and add it back to ensure consistency if it looks like a disco
  const base = s.replace(/-electric$/, '').split('-')[0];
  return `${base}-electric`;
}

/** 080… / 234… for Strowallet airtime/data endpoints */
function normalizeNgPhone(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (!p) return p;
  if (p.startsWith('0')) p = `234${p.slice(1)}`;
  else if (p.length === 10 && !p.startsWith('234')) p = `234${p}`;
  return p;
}

/** VTpass-style bundle service ids Strowallet expects on buy data (see validation errors). */
function dataBundleServiceId(network) {
  const n = String(network || '').trim().toLowerCase();
  if (n === '9mobile' || n === 'etisalat') return '9mobile-data';
  return `${n}-data`;
}

class StrowalletBillsAdapter {
  constructor() {
    this.publicKey = process.env.STROWALLET_PUBLIC_KEY;
    this.secretKey = process.env.STROWALLET_SECRET_KEY;
    this.base = (process.env.STROWALLET_BASE_URL || 'https://strowallet.com').replace(/\/$/, '');
  }

  isConfigured() {
    const pk = this.publicKey && String(this.publicKey).trim() && !String(this.publicKey).includes('your_');
    const sk = this.secretKey && String(this.secretKey).trim() && !String(this.secretKey).includes('your_');
    return !!(pk && sk);
  }

  _authQuery(extra = {}) {
    const q = { public_key: this.publicKey, ...extra };
    if (process.env.STROWALLET_BILLS_SEND_SECRET !== 'false') {
      q.secret_key = this.secretKey;
    }
    return q;
  }

  async _get(path, query = {}) {
    if (!this.isConfigured()) {
      throw { message: 'Strowallet bill payment is not configured', statusCode: 503 };
    }
    const url = `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const res = await axios.get(url, {
        params: this._authQuery(query),
        timeout: 45000,
        validateStatus: (s) => s < 500,
      });
      const data = res.data;
      if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
        throw { message: 'Bill provider returned an invalid response', statusCode: 502 };
      }
      if (res.status >= 400) {
        const msg =
          (data && typeof data === 'object' && (data.message || data.error)) ||
          `HTTP ${res.status}`;
        throw { message: String(msg), statusCode: res.status, raw: data };
      }
      if (isLogicalFailure(data)) {
        throw { message: formatStrowalletApiMessage(data), statusCode: 422, raw: data };
      }
      return data;
    } catch (err) {
      if (err.statusCode) throw err;
      const data = err.response?.data;
      const msg = data && typeof data === 'object' ? formatStrowalletApiMessage(data) : err.message;
      logger.error(`[StrowalletBills] GET ${path} failed:`, data || err.message);
      throw { message: msg || 'Bill request failed', statusCode: err.response?.status || 502, raw: data };
    }
  }

  /**
   * @param {string} path
   * @param {Record<string, unknown>} fields
   * @param {{ timeoutMs?: number }} [options] Shorter timeout for verify-only calls to avoid client aborts.
   */
  async _postForm(path, fields, options = {}) {
    if (!this.isConfigured()) {
      throw { message: 'Strowallet bill payment is not configured', statusCode: 503 };
    }
    const timeoutMs = Number(options.timeoutMs) > 0 ? options.timeoutMs : 45000;
    const params = new URLSearchParams();
    params.append('public_key', this.publicKey);
    if (process.env.STROWALLET_BILLS_SEND_SECRET !== 'false') {
      params.append('secret_key', this.secretKey);
    }
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });

    const url = `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const res = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: timeoutMs,
        validateStatus: (s) => s < 500,
      });
      const data = res.data;
      if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
        throw { message: 'Bill provider returned an invalid response', statusCode: 502 };
      }
      if (res.status >= 400 && typeof data === 'object' && data !== null) {
        throw { message: formatStrowalletApiMessage(data), statusCode: res.status, raw: data };
      }
      if (res.status >= 400) {
        throw { message: `HTTP ${res.status}`, statusCode: res.status, raw: data };
      }
      if (isLogicalFailure(data)) {
        throw { message: formatStrowalletApiMessage(data), statusCode: 422, raw: data };
      }
      return data;
    } catch (err) {
      if (err.statusCode) throw err;
      if (err.code === 'ECONNABORTED' || err.message === 'timeout') {
        throw { message: 'Bill provider request timed out. Please try again.', statusCode: 504 };
      }
      const data = err.response?.data;
      let msg;
      if (data && typeof data === 'object') msg = formatStrowalletApiMessage(data);
      else msg = typeof data === 'string' ? data : err.message;
      logger.error(`[StrowalletBills] POST ${path} failed:`, data || err.message);
      throw { message: msg || 'Bill request failed', statusCode: err.response?.status || 502, raw: data };
    }
  }

  /**
   * @param {{ phone: string, amount: number|string, network?: string }} p
   */
  async buyAirtime(p) {
    const { phone, amount, network = 'mtn' } = p;
    const net = String(network).toLowerCase();
    const normalizedPhone = normalizeNgPhone(phone) || String(phone || '').trim();
    const data = await this._postForm('/api/buyairtime/request/', {
      phone: normalizedPhone,
      amount: String(amount),
      network: net,
      service_name: net,
    });
    return {
      success: isSuccess(data),
      transactionId: data?.trx_num || data?.reference || data?.data?.reference || data?.message,
      raw: data,
    };
  }

  /**
   * GET https://strowallet.com/api/buydata/plans/
   * @param {string} network e.g. mtn, airtel, glo, etisalat
   */
  async getDataPlans(network) {
    const net = String(network).toLowerCase();
    const service_name = dataBundleServiceId(net);
    return this._get('/api/buydata/plans/', { network: net, service_name });
  }

  /**
   * POST https://strowallet.com/api/buydata/request/
   * Strowallet validates required: service_id, variation_code (plan id).
   * @param {{ phone: string, network: string, dataplan: string, variation_code?: string, service_id?: string, amount?: string|number }} p
   */
  async buyData(p) {
    const { phone, network, dataplan, amount } = p;
    const normalizedPhone = normalizeNgPhone(phone) || String(phone || '').trim();
    const net = String(network).toLowerCase();
    const variation_code = String(p.variation_code || dataplan || '').trim();
    const service_id = String(p.service_id || dataBundleServiceId(net)).trim();
    const body = {
      phone: normalizedPhone,
      network: net,
      service_id,
      variation_code,
      // Legacy / alternate keys some builds accept
      dataplan: variation_code,
      service_name: service_id,
    };
    if (amount !== undefined && amount !== null && amount !== '') body.amount = String(amount);
    const data = await this._postForm('/api/buydata/request/', body);
    return {
      success: isSuccess(data),
      transactionId: data?.trx_num || data?.reference || data?.data?.reference,
      raw: data,
    };
  }

  /**
   * GET https://strowallet.com/api/cable-subscription/plans/
   */
  async getCableTvPlans(cable) {
    const cab = String(cable).toLowerCase();
    return this._get('/api/cable-subscription/plans/', {
      cable: cab,
      service_id: cab
    });
  }

  /**
   * POST https://strowallet.com/api/cable-subscription/verify-merchant/
   */
  async verifyCableSmartcard(p) {
    const cable = String(p.cable || '').toLowerCase();
    const num = p.smart_card_number || p.iuc;
    const data = await this._postForm('/api/cable-subscription/verify-merchant/', {
      customer_id: num,
      service_id: cable,
      smart_card_number: num,
      cable: cable
    });
    return { raw: data, success: isSuccess(data) };
  }

  /**
   * POST https://strowallet.com/api/cable-subscription/request/
   */
  async subscribeCableTv(p) {
    const cable = String(p.cable || '').toLowerCase();
    const num = p.smart_card_number || p.iuc;
    const pCode = p.cable_plan || p.plan;
    const data = await this._postForm('/api/cable-subscription/request/', {
      customer_id: num,
      service_id: cable,
      service_name: cable,
      variation_code: pCode,
      smart_card_number: num,
      cable: cable,
      cable_plan: pCode,
      amount: p.amount != null ? String(p.amount) : undefined,
      phone: p.phone,
    });
    return {
      success: isSuccess(data),
      transactionId: data?.trx_num || data?.reference || data?.data?.reference,
      raw: data,
    };
  }

  /**
   * POST https://strowallet.com/api/electricity/verify-merchant/
   */
  async verifyElectricityMeter(p) {
    const VERIFY_TIMEOUT_MS = 45000;
    const MAX_ATTEMPTS = 15;

    const meter_number = String(p.meter_number || p.billersCode || '').trim();
    const discoRaw = String(p.disco || p.serviceID || '').trim().toLowerCase();
    const discoNormalized = normalizeDisco(discoRaw);
    const meterTypeRaw = String(p.meter_type || p.type || 'prepaid').trim().toLowerCase();
    const meterTypeAlt = meterTypeRaw === 'prepaid' ? 'postpaid' : 'prepaid';

    const stripped = meter_number.replace(/^0+/, '');
    const meterCandidates = [...new Set([meter_number, stripped].filter(Boolean))];

    // Strowallet electricity verification can be sensitive to the service_name slug.
    const uniqueDiscos = [...new Set([discoNormalized, discoRaw, discoRaw.replace(/-electric$/, '')])].filter(Boolean);
    const serviceNameCandidates = [...uniqueDiscos, 'electricity-bill', 'electricity'];
    const meterTypeCandidates = [...new Set([meterTypeRaw, meterTypeAlt])].filter(Boolean);

    let lastErr;
    let attempts = 0;
    for (const meter_numberCandidate of meterCandidates) {
      for (const service_name of serviceNameCandidates) {
        for (const disco of uniqueDiscos) {
          // Attempt both the DISCO slug and the generic electricity ID as service_id
          const serviceIdOpts = [...new Set([disco, service_name, 'electricity-bill'])].filter(Boolean);
          for (const service_id of serviceIdOpts) {
            for (const mt of meterTypeCandidates) {
              if (attempts >= MAX_ATTEMPTS) {
                throw lastErr || { message: 'Meter verification failed after multiple attempts', statusCode: 502 };
              }
              attempts += 1;
              try {
                const data = await this._postForm(
                  '/api/electricity/verify-merchant/',
                  {
                    meter_number: meter_numberCandidate,
                    disco,
                    service_id,
                    service_name,
                    variation_code: mt,
                    meter_type: mt,
                    type: mt,
                  },
                  { timeoutMs: VERIFY_TIMEOUT_MS }
                );
                return { raw: data, success: isSuccess(data) };
              } catch (err) {
                lastErr = err;
                const msg = String(err?.message || '').toLowerCase();
                // If it's a structural error (missing field), keep trying. 
                // If it's a logical "invalid meter" for this specific combo, keep trying.
                if (!msg.includes('meter') && !msg.includes('invalid') && !msg.includes('field is required')) throw err;
              }
            }
          }
        }
      }
    }

    throw lastErr || { message: 'Meter verification failed', statusCode: 502 };
  }

  /**
   * POST https://strowallet.com/api/electricity/request/
   */
  async subscribeElectricity(p) {
    const discoRaw = String(p.disco || '').trim().toLowerCase();
    const discoNormalized = normalizeDisco(discoRaw);
    const disco = discoNormalized || discoRaw;
    const mt = String(p.meter_type || p.type || 'prepaid').toLowerCase();
    const data = await this._postForm('/api/electricity/request/', {
      meter_number: p.meter_number,
      disco,
      service_id: disco,
      variation_code: mt,
      service_name: p.service_name || disco || 'electricity-bill',
      amount: String(p.amount),
      meter_type: mt,
      type: mt,
      phone: p.phone,
    });
    return {
      success: isSuccess(data),
      transactionId: data?.trx_num || data?.reference || data?.data?.reference,
      token: data?.token || data?.data?.token || data?.pin,
      units: data?.units || data?.data?.units,
      raw: data,
    };
  }

  /**
   * POST https://strowallet.com/api/educational/request/ (e.g. WAEC checker)
   */
  async buyEducational(p) {
    const data = await this._postForm('/api/educational/request/', {
      service: p.service || p.service_type,
      service_type: p.service_type || p.service,
      quantity: p.quantity != null ? String(p.quantity) : '1',
      amount: p.amount != null ? String(p.amount) : undefined,
      phone: p.phone,
    });
    return {
      success: isSuccess(data),
      transactionId: data?.trx_num || data?.reference || data?.data?.reference,
      raw: data,
    };
  }

  /**
   * POST https://strowallet.com/api/buy_epin/
   */
  async buyEpin(p) {
    const data = await this._postForm('/api/buy_epin/', {
      network: String(p.network || '').toLowerCase(),
      amount: String(p.amount),
      quantity: p.quantity != null ? String(p.quantity) : '1',
      phone: p.phone,
    });
    return {
      success: isSuccess(data),
      transactionId: data?.trx_num || data?.reference || data?.data?.reference,
      raw: data,
    };
  }

  /**
   * GET https://strowallet.com/api/get_smeplans/
   */
  async getSmePlans() {
    return this._get('/api/get_smeplans/');
  }

  /**
   * POST https://strowallet.com/api/buy_smedata/
   */
  async buySmeData(p) {
    const normalizedPhone = normalizeNgPhone(p.phone) || String(p.phone || '').trim();
    const data = await this._postForm('/api/buy_smedata/', {
      phone: normalizedPhone,
      network: String(p.network || '').toLowerCase(),
      dataplan: String(p.dataplan),
      amount: p.amount != null ? String(p.amount) : undefined,
    });
    return {
      success: isSuccess(data),
      transactionId: data?.trx_num || data?.reference || data?.data?.reference,
      raw: data,
    };
  }

  /**
   * GET https://strowallet.com/api/QuerySmeTransaction/
   */
  async querySmeTransaction(reference) {
    return this._get('/api/QuerySmeTransaction/', { reference: String(reference) });
  }
}

export default StrowalletBillsAdapter;
