import apiClient from '../lib/apiClient';

const giftCardService = {
  // Get gift card categories
  getCategories: async () => {
    try {
      const response = await apiClient.get('/gift-cards/categories');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get available gift cards
  getGiftCards: async (params = {}) => {
    try {
      const response = await apiClient.get('/gift-cards', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get user's gift cards
  getMyGiftCards: async (params = {}) => {
    try {
      const response = await apiClient.get('/gift-cards/my-cards', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Buy gift card
  buyGiftCard: async (giftCardData) => {
    try {
      const response = await apiClient.post('/gift-cards/buy', giftCardData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sell gift card
  sellGiftCard: async (giftCardData) => {
    try {
      const response = await apiClient.post('/gift-cards/sell', giftCardData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Redeem gift card
  redeemGiftCard: async (code) => {
    try {
      const response = await apiClient.post('/gift-cards/redeem', {
        code,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default giftCardService;

