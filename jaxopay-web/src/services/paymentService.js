import apiClient from '../lib/apiClient';

const paymentService = {
  // Get payment corridors
  getCorridors: async () => {
    try {
      const response = await apiClient.get('/payments/corridors');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get FX quote
  getFXQuote: async (fromCurrency, toCurrency, amount) => {
    try {
      const response = await apiClient.get('/payments/quote', {
        params: {
          from_currency: fromCurrency,
          to_currency: toCurrency,
          amount,
        },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Send international payment
  sendPayment: async (paymentData) => {
    try {
      const response = await apiClient.post('/payments/send', paymentData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get payment history
  getPaymentHistory: async (params = {}) => {
    try {
      const response = await apiClient.get('/payments/history', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get single payment
  getPayment: async (paymentId) => {
    try {
      const response = await apiClient.get(`/payments/${paymentId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get beneficiaries
  getBeneficiaries: async () => {
    try {
      const response = await apiClient.get('/payments/beneficiaries');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Add beneficiary
  addBeneficiary: async (beneficiaryData) => {
    try {
      const response = await apiClient.post('/payments/beneficiaries', beneficiaryData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update beneficiary
  updateBeneficiary: async (beneficiaryId, beneficiaryData) => {
    try {
      const response = await apiClient.patch(`/payments/beneficiaries/${beneficiaryId}`, beneficiaryData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Delete beneficiary
  deleteBeneficiary: async (beneficiaryId) => {
    try {
      const response = await apiClient.delete(`/payments/beneficiaries/${beneficiaryId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default paymentService;

