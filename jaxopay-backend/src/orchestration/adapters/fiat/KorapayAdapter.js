import crypto from 'crypto';
import { createApiClient } from '../../../utils/apiClient.js';
import logger from '../../../utils/logger.js';

class KorapayAdapter {
  constructor() {
    this.publicKey = (process.env.KORAPAY_PUBLIC_KEY || '').trim();
    this.secretKey = (process.env.KORAPAY_SECRET_KEY || '').trim();
    this.baseURL = (process.env.KORAPAY_BASE_URL || 'https://api.korapay.com').trim().replace(/\/+$/, '');

    logger.info(`[Korapay] Initialising adapter → ${this.baseURL}`);

    this.client = createApiClient({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      label: 'Korapay',
    });
  }

  /**
   * Generates a Static Virtual Bank Account for a user.
   * @param {Object} params
   * @param {string} params.reference - Unique reference for the account (e.g. user_id)
   * @param {string} params.account_name - The name to display on the account
   * @param {string} params.customer_name - Full name of the customer
   * @param {string} params.customer_email - Email of the customer
   * @param {string} params.bvn - (Optional) BVN for Tier 3 accounts, usually optional for Tier 0
   * @returns {Promise<Object>} The generated bank account details
   */
  async createVirtualBankAccount({ reference, account_name, customer_name, customer_email, bvn }) {
    try {
      const payload = {
        account_name,
        account_reference: reference,
        permanent: true,
        customer: {
          name: customer_name,
          email: customer_email
        }
      };

      if (bvn) {
        payload.customer.bvn = bvn;
      }

      // Korapay endpoint for Virtual Bank Accounts
      const response = await this.client.post('/merchant/api/v1/virtual-bank-account', payload);

      if (!response.data?.status && !response.data?.success) {
        throw new Error(response.data?.message || 'Failed to generate Korapay VBA');
      }

      const data = response.data.data;
      return {
        bank_name: data.bank_name,
        account_number: data.account_number,
        account_name: data.account_name,
        reference: data.account_reference,
        status: data.status,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      logger.error(`[Korapay] VBA Creation Failed: ${msg}`);
      throw new Error(`Virtual Bank Account Generation Failed: ${msg}`);
    }
  }

  /**
   * Verify Korapay Webhook Signature
   */
  verifyWebhookSignature(signature, payloadBody) {
    if (!this.secretKey) return false;
    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(JSON.stringify(payloadBody))
      .digest('hex');
    return expectedSignature === signature;
  }
}

export default new KorapayAdapter();
