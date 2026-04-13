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
      // apiClient interceptor returns response.data (the full JSON body: { success, data, error })
      const body = await apiClient.get('/crypto/rates', {
        params: { from: fromCurrency, to: toCurrency, amount },
      });
      if (body?.success && body?.data) {
        return { success: true, data: body.data };
      }
      return { success: false, error: body?.error || 'Rate temporarily unavailable.' };
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
      // apiClient interceptor returns response.data (the full JSON body)
      // Backend: 200 → { success: true, data: { address, coin, network, ... } }
      //          202 → { success: false, pending: true, data: null, error: '...' }
      const body = await apiClient.get('/crypto/deposit-address', {
        params: { coin, network },
      });
      if (body?.pending) {
        return { success: false, pending: true, error: body.error || 'Address is being generated.' };
      }
      return { success: body?.success !== false, data: body?.data };
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

  // Swap crypto for crypto (legacy single-step)
  swap: async (payload) => {
    try {
      const body = await apiClient.post('/crypto/swap', payload);
      if (body?.success && body?.data) return { success: true, data: body.data };
      return { success: false, error: body?.error || body?.message || 'Swap failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // ── Quotation-based swap lifecycle ──────────────────────────────────────
  // Step 2: Create real quotation (returns id + expires_at for 15s countdown)
  createSwapQuotation: async (from_currency, to_currency, from_amount) => {
    try {
      const body = await apiClient.post('/crypto/swap/quotation', {
        from_currency,
        to_currency,
        from_amount,
      });
      if (body?.success && body?.data) return { success: true, data: body.data };
      return { success: false, error: body?.message || 'Could not create quotation' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Step 3: Refresh an existing quotation (pass original params so the exchange can re-price)
  refreshSwapQuotation: async (quotation_id, body = {}) => {
    try {
      const res = await apiClient.post(`/crypto/swap/quotation/${quotation_id}/refresh`, body);
      if (res?.success && res?.data) return { success: true, data: res.data };
      return { success: false, error: res?.message || 'Refresh failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Step 4: Confirm a quotation — executes the swap
  confirmSwapQuotation: async (quotation_id) => {
    try {
      const body = await apiClient.post(`/crypto/swap/quotation/${quotation_id}/confirm`);
      if (body?.success && body?.data) return { success: true, data: body.data };
      return { success: false, error: body?.message || 'Confirmation failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Step 5: Poll swap transaction status
  getSwapTransaction: async (transaction_id) => {
    try {
      const body = await apiClient.get(`/crypto/swap/transactions/${transaction_id}`);
      if (body?.success && body?.data) return { success: true, data: body.data };
      return { success: false, error: body?.message || 'Status unavailable' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get Order Book
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

  // Get crypto config (networks, fees)
  getConfig: async () => {
    try {
      const response = await apiClient.get('/crypto/config');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get 24hr ticker statistics
  get24hTickers: async (market = null) => {
    try {
      const params = market ? { market } : {};
      const response = await apiClient.get('/crypto/ticker/24h', { params });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get kline/candlestick data for charts
  getKlines: async (market, period = '1h', limit = 100) => {
    try {
      const response = await apiClient.get('/crypto/klines', {
        params: { market, period, limit },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get user's orders
  getUserOrders: async (params = {}) => {
    try {
      const response = await apiClient.get('/crypto/orders', { params });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Cancel order
  cancelOrder: async (orderId) => {
    try {
      const response = await apiClient.post(`/crypto/orders/${orderId}/cancel`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get withdrawal fee estimate
  getWithdrawFee: async (coin, network = null) => {
    try {
      const params = { coin };
      if (network) params.network = network;
      const response = await apiClient.get('/crypto/withdraw-fee', { params });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get supported networks for a coin
  getNetworks: async (coin) => {
    try {
      const response = await apiClient.get('/crypto/networks', {
        params: { coin },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get live exchange rate
  getLiveExchangeRate: async (from, to, amount = null) => {
    try {
      const params = { from, to };
      if (amount) params.amount = amount;
      const response = await apiClient.get('/crypto/exchange-rate/live', { params });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get live order book
  getLiveOrderBook: async (market = 'btcusdt', limit = 50) => {
    try {
      const response = await apiClient.get('/crypto/order-book/live', {
        params: { market, limit },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get market depth (aggregated asks/bids)
  getMarketDepth: async (market) => {
    try {
      const body = await apiClient.get('/crypto/market/depth', { params: { market } });
      return { success: true, data: body?.data || body };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get all swap transactions
  getSwapTransactions: async () => {
    try {
      const body = await apiClient.get('/crypto/swap/transactions');
      return { success: true, data: body?.data || body };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default cryptoService;

