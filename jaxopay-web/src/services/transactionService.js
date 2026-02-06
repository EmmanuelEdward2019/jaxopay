import apiClient from '../lib/apiClient';

const transactionService = {
  // Get all transactions
  getTransactions: async (params = {}) => {
    try {
      const response = await apiClient.get('/transactions', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get single transaction
  getTransaction: async (transactionId) => {
    try {
      const response = await apiClient.get(`/transactions/${transactionId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get transaction statistics
  getStatistics: async (period = '30d') => {
    try {
      const response = await apiClient.get('/transactions/statistics', {
        params: { period },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default transactionService;

