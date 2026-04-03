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
          from: fromCurrency,
          to: toCurrency,
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
        crypto_currency: cryptocurrency,
        fiat_amount: amount,
        fiat_currency: currency,
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
        crypto_currency: cryptocurrency,
        crypto_amount: amount,
        fiat_currency: currency,
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

  // Get crypto deposit address
  getDepositAddress: async (coin, network) => {
    try {
      const response = await apiClient.get('/crypto/deposit-address', {
        params: { coin, network },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Request crypto withdrawal
  withdraw: async (payload) => {
    try {
      const response = await apiClient.post('/crypto/withdraw', payload);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Swap crypto for crypto
  swap: async (payload) => {
    try {
      const response = await apiClient.post('/crypto/swap', payload);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get Order Book (Quidax)
  getOrderBook: async (market, limit = 50) => {
    try {
      const response = await apiClient.get('/crypto/order-book', {
        params: { market, limit },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Create Order (Trading)
  createOrder: async (payload) => {
    try {
      const response = await apiClient.post('/crypto/orders', payload);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get Instant Swap Quote
  getSwapQuote: async (payload) => {
    try {
      const response = await apiClient.get('/crypto/swap/quote', {
        params: payload,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get market ticker
  getMarketTicker: async (market) => {
    try {
      const response = await apiClient.get('/crypto/market/ticker', {
        params: { market },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get market trades
  getMarketTrades: async (market, limit = 50) => {
    try {
      const response = await apiClient.get('/crypto/market/trades', {
        params: { market, limit },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get all markets
  getMarkets: async () => {
    try {
      const response = await apiClient.get('/crypto/markets');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get Quidax crypto config (networks, fees)
  getConfig: async () => {
    try {
      const response = await apiClient.get('/crypto/config');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default cryptoService;

