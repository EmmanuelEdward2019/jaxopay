import apiClient from '../lib/apiClient';

const giftCardService = {
  // Get supported countries
  getCountries: async () => {
    try {
      const response = await apiClient.get('/gift-cards/countries');
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get gift card categories
  getCategories: async () => {
    try {
      const response = await apiClient.get('/gift-cards/categories');
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get available gift cards from Reloadly
  // params: { country, search, page, size }
  getGiftCards: async (params = {}) => {
    try {
      const response = await apiClient.get('/gift-cards', { params });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get single product details
  getProduct: async (productId) => {
    try {
      const response = await apiClient.get(`/gift-cards/products/${productId}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get discounts
  getDiscounts: async (productId) => {
    try {
      const params = productId ? { productId } : {};
      const response = await apiClient.get('/gift-cards/discounts', { params });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get user's purchased gift cards
  getMyGiftCards: async (params = {}) => {
    try {
      const response = await apiClient.get('/gift-cards/my-cards', { params });
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Buy gift card
  // data: { productId, amount, quantity, currency, countryCode, recipientEmail }
  buyGiftCard: async (giftCardData) => {
    try {
      const response = await apiClient.post('/gift-cards/buy', giftCardData);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get redeem code for purchased gift card
  redeemGiftCard: async (transactionRef) => {
    try {
      const response = await apiClient.get(`/gift-cards/redeem/${transactionRef}`);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sell gift card (future feature)
  sellGiftCard: async (giftCardData) => {
    try {
      const response = await apiClient.post('/gift-cards/sell', giftCardData);
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get Reloadly provider balance
  getBalance: async () => {
    try {
      const response = await apiClient.get('/gift-cards/balance');
      return { success: true, data: response.data ?? response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default giftCardService;
