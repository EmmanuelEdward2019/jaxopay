import apiClient from '../lib/apiClient';

/**
 * cardService
 * apiClient already returns response.data (full JSON body from backend).
 * Backend shape: { success: true, data: [...], message?: string }
 */
const cardService = {
  // Get all user cards
  getCards: async () => {
    try {
      const response = await apiClient.get('/cards');
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch cards' };
    }
  },

  // Get single card
  getCard: async (cardId) => {
    try {
      const response = await apiClient.get(`/cards/${cardId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch card' };
    }
  },

  // Create virtual card (requires KYC Tier 2)
  createCard: async (cardData) => {
    try {
      const response = await apiClient.post('/cards', cardData);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      const msg = error.message || 'Failed to create card';
      return { success: false, error: msg, message: msg };
    }
  },

  // Fund card from USD wallet
  fundCard: async (cardId, amount) => {
    try {
      const response = await apiClient.post(`/cards/${cardId}/fund`, { amount });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fund card' };
    }
  },

  // Freeze card (PATCH - matches backend route)
  freezeCard: async (cardId) => {
    try {
      const response = await apiClient.patch(`/cards/${cardId}/freeze`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to freeze card' };
    }
  },

  // Unfreeze card (PATCH - matches backend route)
  unfreezeCard: async (cardId) => {
    try {
      const response = await apiClient.patch(`/cards/${cardId}/unfreeze`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to unfreeze card' };
    }
  },

  // Terminate/close card
  terminateCard: async (cardId) => {
    try {
      const response = await apiClient.delete(`/cards/${cardId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to terminate card' };
    }
  },

  // Get transactions for a specific card
  getCardTransactions: async (cardId, params = {}) => {
    try {
      const response = await apiClient.get(`/cards/${cardId}/transactions`, { params });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch transactions' };
    }
  },

  // Update spending limit (PATCH /cards/:id/spending-limit)
  updateSpendingLimit: async (cardId, spendingLimit) => {
    try {
      const response = await apiClient.patch(`/cards/${cardId}/spending-limit`, {
        spending_limit: spendingLimit,
      });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to update spending limit' };
    }
  },

  // Fetch secure card data (full PAN, CVV) — called when user reveals card details
  getCardSecureData: async (cardId) => {
    try {
      const response = await apiClient.get(`/cards/${cardId}/secure-data`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch card details' };
    }
  },
};

export default cardService;
