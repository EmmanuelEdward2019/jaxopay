import axios from 'axios';
import logger from '../../../utils/logger.js';

/**
 * Strowallet bills backup (airtime / data style purchases).
 * Endpoint: https://strowallet.com/api/buyairtime/request/
 * Parameter names may vary by Strowallet account — adjust via response errors in logs.
 */
class StrowalletBillsAdapter {
  constructor() {
    this.publicKey = process.env.STROWALLET_PUBLIC_KEY;
    this.base = (process.env.STROWALLET_BASE_URL || 'https://strowallet.com').replace(/\/$/, '');
  }

  isConfigured() {
    return !!this.publicKey;
  }

  async _postForm(path, fields) {
    if (!this.isConfigured()) {
      throw { message: 'Bill payment backup service is not configured', statusCode: 503 };
    }
    const params = new URLSearchParams();
    params.append('public_key', this.publicKey);
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });

    const url = `${this.base}${path}`;
    const res = await axios.post(url, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 45000,
    });
    return res.data;
  }

  /**
   * @param {{ phone: string, amount: number|string, network?: string, service?: string }} p
   */
  async buyAirtime(p) {
    const { phone, amount, network = 'mtn' } = p;
    try {
      const data = await this._postForm('/api/buyairtime/request/', {
        phone,
        amount: String(amount),
        network: network.toLowerCase(),
      });
      const ok =
        data?.error === 'ok' ||
        data?.status === true ||
        data?.status === 'success' ||
        data?.success === true;
      return {
        success: ok,
        transactionId: data?.trx_num || data?.reference || data?.data?.reference || data?.message,
        raw: data,
      };
    } catch (err) {
      logger.error('[StrowalletBills] buyAirtime failed:', err.response?.data || err.message);
      throw {
        message: err.response?.data?.message || err.message || 'Airtime purchase failed',
        statusCode: err.response?.status || 502,
      };
    }
  }
}

export default StrowalletBillsAdapter;
