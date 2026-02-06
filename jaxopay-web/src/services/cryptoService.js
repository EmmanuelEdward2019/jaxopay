import apiClient from '../lib/apiClient';

const cryptoService = {
  // Get supported cryptocurrencies
  getSupportedCryptos: async () => {
    try {
      const response = await apiClient.get('/crypto/supported');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get exchange rates
  getExchangeRates: async (fromCurrency, toCurrency, amount) => {
    try {
      const response = await apiClient.get('/crypto/rates', {
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

  // Buy cryptocurrency
  buyCrypto: async (cryptocurrency, amount, currency, walletId) => {
    try {
      const response = await apiClient.post('/crypto/buy', {
        cryptocurrency,
        amount,
        currency,
        wallet_id: walletId,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sell cryptocurrency
  sellCrypto: async (cryptocurrency, amount, currency, walletId) => {
    try {
      const response = await apiClient.post('/crypto/sell', {
        cryptocurrency,
        amount,
        currency,
        wallet_id: walletId,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get crypto transaction history
  getCryptoHistory: async (params = {}) => {
    try {
      const response = await apiClient.get('/crypto/history', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default cryptoService;

