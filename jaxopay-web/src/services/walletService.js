import apiClient from '../lib/apiClient';

const walletService = {
  // Get all user wallets
  getWallets: async () => {
    try {
      const response = await apiClient.get('/wallets');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get single wallet
  getWallet: async (walletId) => {
    try {
      const response = await apiClient.get(`/wallets/${walletId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Create new wallet
  createWallet: async (currency, walletType = 'fiat') => {
    try {
      const response = await apiClient.post('/wallets', {
        currency,
        wallet_type: walletType,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Transfer between wallets
  transfer: async (fromWalletId, toWalletId, amount, description = '') => {
    try {
      const response = await apiClient.post('/wallets/transfer', {
        from_wallet_id: fromWalletId,
        to_wallet_id: toWalletId,
        amount,
        description,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get wallet transactions
  getTransactions: async (walletId, params = {}) => {
    try {
      const response = await apiClient.get(`/wallets/${walletId}/transactions`, {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get wallet balance
  getBalance: async (walletId) => {
    try {
      const response = await apiClient.get(`/wallets/${walletId}/balance`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Freeze wallet
  freezeWallet: async (walletId) => {
    try {
      const response = await apiClient.post(`/wallets/${walletId}/freeze`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Unfreeze wallet
  unfreezeWallet: async (walletId) => {
    try {
      const response = await apiClient.post(`/wallets/${walletId}/unfreeze`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Delete wallet
  deleteWallet: async (walletId) => {
    try {
      const response = await apiClient.delete(`/wallets/${walletId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default walletService;

