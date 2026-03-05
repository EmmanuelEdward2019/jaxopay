import apiClient from '../lib/apiClient';

/**
 * billService
 * apiClient already returns response.data (full JSON body from backend).
 * Backend shape: { success: true, data: [...], message?: string }
 */
const billService = {
  // Get bill categories
  getCategories: async () => {
    try {
      const response = await apiClient.get('/bills/categories');
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch categories' };
    }
  },

  // Get bill providers — API returns array directly in data
  getProviders: async (category, country) => {
    try {
      const response = await apiClient.get('/bills/providers', { params: { category, country } });
      // response.data = array of providers OR { providers: [...] }
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch providers' };
    }
  },

  // Validate bill account
  validateAccount: async (providerId, accountNumber, billType = 'prepaid') => {
    try {
      const response = await apiClient.post('/bills/validate', {
        provider_id: providerId,
        account_number: accountNumber,
        bill_type: billType,
      });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Account validation failed' };
    }
  },

  // Pay bill
  payBill: async (billData) => {
    try {
      const response = await apiClient.post('/bills/pay', billData);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Bill payment failed' };
    }
  },

  // Get bill payment history
  getHistory: async (params = {}) => {
    try {
      const response = await apiClient.get('/bills/history', { params });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch history' };
    }
  },

  // Get single bill payment
  getPayment: async (billPaymentId) => {
    try {
      const response = await apiClient.get(`/bills/${billPaymentId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch payment' };
    }
  },
};

export default billService;
