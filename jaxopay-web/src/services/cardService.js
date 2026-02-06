import apiClient from '../lib/apiClient';

const cardService = {
  // Get all user cards
  getCards: async () => {
    try {
      const response = await apiClient.get('/cards');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get single card
  getCard: async (cardId) => {
    try {
      const response = await apiClient.get(`/cards/${cardId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Create virtual card
  createCard: async (cardData) => {
    try {
      const response = await apiClient.post('/cards', cardData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Fund card
  fundCard: async (cardId, amount, walletId) => {
    try {
      const response = await apiClient.post(`/cards/${cardId}/fund`, {
        amount,
        wallet_id: walletId,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Freeze card
  freezeCard: async (cardId) => {
    try {
      const response = await apiClient.post(`/cards/${cardId}/freeze`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Unfreeze card
  unfreezeCard: async (cardId) => {
    try {
      const response = await apiClient.post(`/cards/${cardId}/unfreeze`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Terminate card
  terminateCard: async (cardId) => {
    try {
      const response = await apiClient.delete(`/cards/${cardId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get card transactions
  getCardTransactions: async (cardId, params = {}) => {
    try {
      const response = await apiClient.get(`/cards/${cardId}/transactions`, {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update spending limit
  updateSpendingLimit: async (cardId, dailyLimit, monthlyLimit) => {
    try {
      const response = await apiClient.patch(`/cards/${cardId}/limits`, {
        daily_limit: dailyLimit,
        monthly_limit: monthlyLimit,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default cardService;

