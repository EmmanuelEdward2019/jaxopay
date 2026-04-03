/**
 * Quidax Integration Test Script
 * 
 * This script tests all the new Quidax API endpoints
 * Run with: node test_quidax_integration.js
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000/api';
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@example.com';
let authToken = null;

// Helper functions
const log = (msg, data = null) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 ${msg}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

const error = (msg, err) => {
  console.log(`\n❌ ${msg}`);
  console.log(`Error: ${err.message}`);
  if (err.response?.data) {
    console.log('Response:', JSON.stringify(err.response.data, null, 2));
  }
};

const success = (msg) => {
  console.log(`\n✅ ${msg}`);
};

// Test authentication (you'll need to implement this based on your auth system)
const authenticate = async () => {
  try {
    log('Authenticating test user...');
    // Replace with your actual auth endpoint
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: process.env.TEST_USER_PASSWORD || 'testpassword123'
    });
    
    authToken = response.data.token;
    success('Authentication successful');
    return true;
  } catch (err) {
    error('Authentication failed', err);
    console.log('\n⚠️  Skipping authenticated tests. You can manually set authToken for testing.');
    authToken = process.env.TEST_AUTH_TOKEN; // Fallback to env var
    return false;
  }
};

// Test endpoints
const tests = {
  // 1. Get supported cryptocurrencies
  getSupportedCryptos: async () => {
    try {
      log('Testing: Get Supported Cryptocurrencies');
      const response = await axios.get(`${BASE_URL}/crypto/supported`);
      success(`Found ${response.data.data.length} supported cryptocurrencies`);
      return response.data;
    } catch (err) {
      error('Get Supported Cryptos failed', err);
      return null;
    }
  },

  // 2. Get all markets
  getMarkets: async () => {
    try {
      log('Testing: Get All Markets');
      const response = await axios.get(`${BASE_URL}/crypto/markets`);
      success(`Found ${response.data.data.length} markets`);
      console.log('Sample markets:', response.data.data.slice(0, 3).map(m => m.name));
      return response.data;
    } catch (err) {
      error('Get Markets failed', err);
      return null;
    }
  },

  // 3. Get exchange rates
  getExchangeRates: async () => {
    try {
      log('Testing: Get Exchange Rates (BTC to NGN)');
      const response = await axios.get(`${BASE_URL}/crypto/rates`, {
        params: { from: 'BTC', to: 'NGN', amount: 1 }
      });
      success('Exchange rate fetched');
      console.log(`1 BTC = ${response.data.data.exchange_amount} NGN`);
      console.log(`Rate with fee: ${response.data.data.rate_with_fee}`);
      return response.data;
    } catch (err) {
      error('Get Exchange Rates failed', err);
      return null;
    }
  },

  // 4. Get 24hr ticker statistics
  get24hTickers: async () => {
    try {
      log('Testing: Get 24hr Ticker Statistics');
      const response = await axios.get(`${BASE_URL}/crypto/ticker/24h`);
      success('24hr tickers fetched');
      console.log(`Found ${Object.keys(response.data.data).length} market tickers`);
      return response.data;
    } catch (err) {
      error('Get 24hr Tickers failed', err);
      return null;
    }
  },

  // 5. Get order book
  getOrderBook: async () => {
    try {
      log('Testing: Get Order Book (BTCUSDT)');
      const response = await axios.get(`${BASE_URL}/crypto/order-book`, {
        params: { market: 'btcusdt', limit: 20 }
      });
      success('Order book fetched');
      console.log(`Asks: ${response.data.data.asks.length}, Bids: ${response.data.data.bids.length}`);
      if (response.data.data.asks.length > 0) {
        console.log(`Best Ask: ${response.data.data.asks[0].price}`);
        console.log(`Best Bid: ${response.data.data.bids[0]?.price || 'N/A'}`);
      }
      return response.data;
    } catch (err) {
      error('Get Order Book failed', err);
      return null;
    }
  },

  // 6. Get kline/candlestick data
  getKlines: async () => {
    try {
      log('Testing: Get Kline Data (BTCUSDT, 1h interval)');
      const response = await axios.get(`${BASE_URL}/crypto/klines`, {
        params: { market: 'btcusdt', period: '1h', limit: 10 }
      });
      success(`Fetched ${response.data.data.length} candles`);
      if (response.data.data.length > 0) {
        const first = response.data.data[0];
        console.log(`Latest candle - Open: ${first[1]}, High: ${first[2]}, Low: ${first[3]}, Close: ${first[4]}`);
      }
      return response.data;
    } catch (err) {
      error('Get Klines failed', err);
      return null;
    }
  },

  // 7. Get market trades
  getMarketTrades: async () => {
    try {
      log('Testing: Get Recent Market Trades');
      const response = await axios.get(`${BASE_URL}/crypto/market/trades`, {
        params: { market: 'btcusdt', limit: 10 }
      });
      success(`Fetched ${response.data.data.length} recent trades`);
      if (response.data.data.length > 0) {
        const first = response.data.data[0];
        console.log(`Latest trade - Price: ${first.price}, Amount: ${first.amount}, Time: ${first.created_at}`);
      }
      return response.data;
    } catch (err) {
      error('Get Market Trades failed', err);
      return null;
    }
  },

  // 8. Get withdrawal fee
  getWithdrawFee: async () => {
    try {
      log('Testing: Get Withdrawal Fee (USDT on TRC20)');
      const response = await axios.get(`${BASE_URL}/crypto/withdraw-fee`, {
        params: { coin: 'usdt', network: 'trc20' }
      });
      success('Withdrawal fee fetched');
      console.log(`Fee: ${response.data.data.fee} USDT`);
      return response.data;
    } catch (err) {
      error('Get Withdraw Fee failed', err);
      return null;
    }
  },

  // 9. Get crypto config
  getCryptoConfig: async () => {
    try {
      log('Testing: Get Crypto Config');
      const response = await axios.get(`${BASE_URL}/crypto/config`);
      success(`Fetched config for ${response.data.data.length} cryptocurrencies`);
      const usdt = response.data.data.find(c => c.coin === 'USDT');
      if (usdt) {
        console.log(`USDT networks: ${usdt.networkList.map(n => n.network).join(', ')}`);
      }
      return response.data;
    } catch (err) {
      error('Get Crypto Config failed', err);
      return null;
    }
  },

  // 10. Get deposit address (requires auth)
  getDepositAddress: async () => {
    if (!authToken) {
      console.log('\n⚠️  Skipping: No auth token available');
      return null;
    }

    try {
      log('Testing: Get Deposit Address (USDT)');
      const response = await axios.get(`${BASE_URL}/crypto/deposit-address`, {
        params: { coin: 'usdt', network: 'trc20' },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      success('Deposit address generated');
      console.log(`Address: ${response.data.data.address}`);
      if (response.data.data.tag) {
        console.log(`Memo/Tag: ${response.data.data.tag}`);
      }
      return response.data;
    } catch (err) {
      error('Get Deposit Address failed', err);
      return null;
    }
  },

  // 11. Get user orders (requires auth)
  getUserOrders: async () => {
    if (!authToken) {
      console.log('\n⚠️  Skipping: No auth token available');
      return null;
    }

    try {
      log('Testing: Get User Orders');
      const response = await axios.get(`${BASE_URL}/crypto/orders`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      success(`Fetched ${response.data.data.length} orders`);
      return response.data;
    } catch (err) {
      error('Get User Orders failed', err);
      return null;
    }
  }
};

// Run all tests
const runAllTests = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 QUIDAX INTEGRATION TEST SUITE');
  console.log('='.repeat(60));
  
  // Authenticate first
  await authenticate();
  
  // Run public endpoint tests
  await tests.getSupportedCryptos();
  await tests.getMarkets();
  await tests.getExchangeRates();
  await tests.get24hTickers();
  await tests.getOrderBook();
  await tests.getKlines();
  await tests.getMarketTrades();
  await tests.getWithdrawFee();
  await tests.getCryptoConfig();
  
  // Auth-required tests
  await tests.getDepositAddress();
  await tests.getUserOrders();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL TESTS COMPLETED');
  console.log('='.repeat(60) + '\n');
};

// Execute tests
runAllTests().catch(console.error);
