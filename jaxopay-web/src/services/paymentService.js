import apiClient from '../lib/apiClient';

/**
 * paymentService
 * apiClient already returns response.data (full JSON body from backend).
 * Backend shape: { success: true, data: {...}, message?: string }
 */
const paymentService = {
  // Get available payment corridors
  getCorridors: async () => {
    try {
      const response = await apiClient.get('/payments/corridors');
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch corridors' };
    }
  },

  // Get FX quote — backend uses ?from=&to=&amount=
  getFXQuote: async (from, to, amount) => {
    try {
      const response = await apiClient.get('/payments/quote', { params: { from, to, amount } });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to get FX quote' };
    }
  },

  // Send cross-border payment (Korapay)
  sendPayment: async (paymentData) => {
    try {
      const response = await apiClient.post('/payments/send', paymentData);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Payment failed' };
    }
  },

  // Get payment history (cross-border)
  getPaymentHistory: async (params = {}) => {
    try {
      const response = await apiClient.get('/payments/history', { params });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch payment history' };
    }
  },

  // Get single payment
  getPayment: async (paymentId) => {
    try {
      const response = await apiClient.get(`/payments/${paymentId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch payment' };
    }
  },

  // Get beneficiaries
  getBeneficiaries: async () => {
    try {
      const response = await apiClient.get('/payments/beneficiaries');
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch beneficiaries' };
    }
  },

  // Add beneficiary
  addBeneficiary: async (beneficiaryData) => {
    try {
      const response = await apiClient.post('/payments/beneficiaries', beneficiaryData);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to add beneficiary' };
    }
  },

  // Update beneficiary
  updateBeneficiary: async (beneficiaryId, beneficiaryData) => {
    try {
      const response = await apiClient.patch(`/payments/beneficiaries/${beneficiaryId}`, beneficiaryData);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to update beneficiary' };
    }
  },

  // Delete beneficiary
  deleteBeneficiary: async (beneficiaryId) => {
    try {
      const response = await apiClient.delete(`/payments/beneficiaries/${beneficiaryId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to delete beneficiary' };
    }
  },
};

export default paymentService;
