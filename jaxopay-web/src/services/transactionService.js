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

  // Statement — preview totals for a filter combination before downloading
  getStatementSummary: async (params) => {
    try {
      const response = await apiClient.get('/transactions/statement/summary', { params });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Statement — download as PDF. Returns the raw Blob so the caller can trigger a file save.
  downloadStatementPDF: async (params) => {
    try {
      const blob = await apiClient.get('/transactions/statement/pdf', {
        params,
        responseType: 'blob',
      });
      return { success: true, blob };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Statement — download as CSV. Returns the raw Blob so the caller can trigger a file save.
  downloadStatementCSV: async (params) => {
    try {
      const blob = await apiClient.get('/transactions/statement/csv', {
        params,
        responseType: 'blob',
      });
      return { success: true, blob };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Statement — backend generates the file and emails it to the account's own registered address
  emailStatement: async (payload) => {
    try {
      const response = await apiClient.post('/transactions/statement/email', payload);
      return { success: true, message: response.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default transactionService;

