import apiClient from '../lib/apiClient';

/**
 * walletService
 *
 * apiClient already returns response.data (the full JSON body from backend).
 * Backend shape: { success: true, data: [...], message?: string }
 * So `response` here = { success, data, message? }
 */
const walletService = {
  // Get all user wallets → returns array in data
  getWallets: async () => {
    try {
      const response = await apiClient.get('/wallets');
      // response = { success: true, data: [...wallets] }
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch wallets' };
    }
  },

  // Get single wallet
  getWallet: async (walletId) => {
    try {
      const response = await apiClient.get(`/wallets/${walletId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch wallet' };
    }
  },

  // Create new wallet
  createWallet: async (currency, walletType = 'fiat') => {
    try {
      const response = await apiClient.post('/wallets', { currency, wallet_type: walletType });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to create wallet' };
    }
  },

  // Internal transfer between wallets
  transfer: async (fromWalletId, toWalletId, amount, description = '') => {
    try {
      const response = await apiClient.post('/wallets/transfer', {
        from_wallet_id: fromWalletId,
        to_wallet_id: toWalletId,
        amount,
        description,
      });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Transfer failed' };
    }
  },

  // Get wallet transactions
  getTransactions: async (walletId, params = {}) => {
    try {
      const response = await apiClient.get(`/wallets/${walletId}/transactions`, { params });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch transactions' };
    }
  },

  // Get wallet balance
  getBalance: async (walletId) => {
    try {
      const response = await apiClient.get(`/wallets/${walletId}/balance`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch balance' };
    }
  },

  // Freeze wallet
  freezeWallet: async (walletId) => {
    try {
      const response = await apiClient.post(`/wallets/${walletId}/freeze`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to freeze wallet' };
    }
  },

  // Unfreeze wallet
  unfreezeWallet: async (walletId) => {
    try {
      const response = await apiClient.post(`/wallets/${walletId}/unfreeze`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to unfreeze wallet' };
    }
  },

  // Delete wallet
  deleteWallet: async (walletId) => {
    try {
      const response = await apiClient.delete(`/wallets/${walletId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to delete wallet' };
    }
  },

  // Add funds (fiat deposit / top-up)
  addFunds: async (walletId, amount, description = '') => {
    try {
      const response = await apiClient.post(`/wallets/${walletId}/add-funds`, { amount, description });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to add funds' };
    }
  },

  // Deposit via Korapay payment link
  initializeDeposit: async (walletId, amount, currency = 'NGN') => {
    try {
      const response = await apiClient.post('/wallets/deposit/initialize', { wallet_id: walletId, amount, currency });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to initialize deposit' };
    }
  },

  // Verify Korapay payment after redirect — checks status and credits wallet
  verifyDeposit: async (reference) => {
    try {
      const response = await apiClient.post('/wallets/deposit/verify', { reference });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to verify deposit' };
    }
  },

  // Get or create Virtual Bank Account (VBA) for receiving bank transfers
  getVBA: async (walletId) => {
    try {
      const response = await apiClient.get(`/wallets/vba/${walletId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, message: error.message || 'Failed to get account details' };
    }
  },
};

export default walletService;

