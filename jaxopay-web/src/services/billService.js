import apiClient from '../lib/apiClient';

const billService = {
  // Get bill categories
  getCategories: async () => {
    try {
      const response = await apiClient.get('/bills/categories');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get bill providers
  getProviders: async (category, country) => {
    try {
      const response = await apiClient.get('/bills/providers', {
        params: { category, country },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Validate bill account
  validateAccount: async (providerId, accountNumber) => {
    try {
      const response = await apiClient.post('/bills/validate', {
        provider_id: providerId,
        account_number: accountNumber,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Pay bill
  payBill: async (billData) => {
    try {
      const response = await apiClient.post('/bills/pay', billData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get bill payment history
  getHistory: async (params = {}) => {
    try {
      const response = await apiClient.get('/bills/history', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get single bill payment
  getPayment: async (billPaymentId) => {
    try {
      const response = await apiClient.get(`/bills/${billPaymentId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default billService;

