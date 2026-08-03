import crypto from 'crypto';
import { createApiClient } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';

class GlydeAdapter {
  constructor() {
    this.publicKey = (process.env.GLYDE_PUBLIC_KEY || '').trim();
    this.secretKey = (process.env.GLYDE_SECRET_KEY || '').trim();
    this.baseURL = (process.env.GLYDE_BASE_URL || 'https://api.useglyde.co/v1').trim().replace(/\/+$/, '');

    logger.info(`[Glyde] Initialising adapter → ${this.baseURL}`);

    this.client = createApiClient({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      label: 'Glyde',
    });
  }

  isConfigured() {
    return Boolean(this.secretKey) && !this.secretKey.includes('your_');
  }

  /**
   * Creates a static (permanent, reusable) virtual bank account for a customer.
   * `reference` is our own internally-generated id — passed through as
   * `customer.reference` so webhook events can be matched back to it.
   */
  async createVirtualBankAccount({ reference, account_name, customer_name, customer_email, customer_phone, bvn }) {
    try {
      const [firstName, ...rest] = (customer_name || '').trim().split(/\s+/).filter(Boolean);

      const payload = {
        type: 'static',
        customer: {
          reference,
          first_name: firstName || 'User',
          last_name: rest.join(' ') || 'Account',
          email: customer_email,
          ...(customer_phone ? { phone: customer_phone } : {}),
          ...(bvn ? { bvn } : {}),
        },
      };

      const response = await this.client.post('/virtual-accounts', payload);
      const body = response.data;
      const data = body?.data;

      if (!data?.account_number) {
        throw new Error(body?.message || 'Failed to generate Glyde virtual account');
      }

      return {
        bank_name: data.bank_name,
        bank_code: data.bank_code || null,
        account_number: data.account_number,
        account_name: data.account_name || account_name,
        reference: data.customer?.reference || reference,
        provider_id: data.uid || data.id || null,
        status: data.status,
      };
    } catch (error) {
      const body = error.response?.data;
      const validationDetail = body?.errors && typeof body.errors === 'object'
        ? Object.entries(body.errors).map(([field, msg]) => `${field}: ${msg}`).join('; ')
        : null;
      const msg = validationDetail || body?.message || error.message;
      logger.error(`[Glyde] VBA Creation Failed: ${msg}`);
      throw new Error(`Virtual Bank Account Generation Failed: ${msg}`);
    }
  }

  /** Bank account name enquiry — used to validate payout destinations. */
  async resolveAccount({ account_number, bank_code }) {
    const response = await this.client.get('/account-enquiry', { params: { account_number, bank_code } });
    return response.data?.data;
  }

  /**
   * Verify a Glyde webhook signature: HMAC-SHA256 over the RAW request body,
   * sent in the `X-Glyde-Signature` header (hex-encoded).
   */
  verifyWebhookSignature(signature, rawBody) {
    const secret = (process.env.GLYDE_WEBHOOK_SECRET || this.secretKey || '').trim();
    if (!secret || !signature || !rawBody) return false;

    try {
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const signatureBuf = Buffer.from(signature, 'hex');
      if (expectedBuf.length === 0 || expectedBuf.length !== signatureBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, signatureBuf);
    } catch (err) {
      logger.warn(`[Glyde] Signature verification error: ${err.message}`);
      return false;
    }
  }
}

export default new GlydeAdapter();
