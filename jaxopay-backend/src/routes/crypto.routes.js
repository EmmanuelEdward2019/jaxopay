import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGuard.js';
import { validate } from '../middleware/validator.js';
import { body, query } from 'express-validator';
import {
  getSupportedCryptos,
  getExchangeRates,
  exchangeCryptoToFiat,
  exchangeFiatToCrypto,
  exchangeCryptoToCrypto,
  getExchangeHistory,
  getCryptoDepositAddress,
  withdrawCrypto,
  getCryptoConfig,
  getOrderBook,
  createOrder,
  getSwapQuote,
  getMarketTrades,
  getMarketTicker,
  getMarkets,
  get24hTickers,
  getKlines,
  getUserOrders,
  cancelOrder,
  getWithdrawFee,
  createSwapQuotation,
  refreshSwapQuotation,
  confirmSwapQuotation,
  getSwapTransaction,
} from '../controllers/crypto.controller.js';

// Enhanced endpoints with full Quidax integration
import {
  getCryptoNetworks,
  getLiveOrderBook,
  getLiveExchangeRate
} from '../controllers/crypto-enhanced.controller.js';

const router = express.Router();

// All crypto routes require authentication
router.use(verifyToken);
router.use(requireFeature('crypto'));

// Get supported cryptocurrencies
router.get('/supported', getSupportedCryptos);

// Get exchange rates
router.get(
  '/rates',
  query('from').isString().notEmpty(),
  query('to').isString().notEmpty(),
  query('amount').optional().isFloat({ min: 0 }),
  validate,
  getExchangeRates
);

// Get exchange history
router.get(
  '/history',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getExchangeHistory
);

// Exchange crypto to fiat (requires KYC Tier 2+)
router.post(
  '/sell',
  requireKYCTier(2),
  body('crypto_currency').isString().isLength({ min: 2, max: 10 }),
  body('fiat_currency').isString().isLength({ min: 3, max: 6 }),
  body('crypto_amount').isFloat({ min: 0.00000001 }),
  validate,
  exchangeCryptoToFiat
);

// Exchange fiat to crypto (requires KYC Tier 2+)
router.post(
  '/buy',
  requireKYCTier(2),
  body('fiat_currency').isString().isLength({ min: 3, max: 6 }),
  body('crypto_currency').isString().isLength({ min: 2, max: 10 }),
  body('fiat_amount').isFloat({ min: 1 }),
  validate,
  exchangeFiatToCrypto
);

// Exchange crypto to crypto
router.post(
  '/swap',
  requireKYCTier(2),
  body('from_coin').isString().isLength({ min: 2, max: 10 }),
  body('to_coin').isString().isLength({ min: 2, max: 10 }),
  body('amount').isFloat({ min: 0.00000001 }),
  validate,
  exchangeCryptoToCrypto
);

// Get deposit address
router.get(
  '/deposit-address',
  query('coin').isString().notEmpty(),
  query('network').optional().isString(),
  validate,
  getCryptoDepositAddress
);

// Withdraw crypto
router.post(
  '/withdraw',
  requireKYCTier(2),
  body('coin').isString().notEmpty(),
  body('address').isString().notEmpty(),
  body('amount').isFloat({ min: 0.00000001 }),
  body('network').optional().isString(),
  body('memo').optional().isString(),
  validate,
  withdrawCrypto
);

// Get crypto config (networks, etc)
router.get('/config', getCryptoConfig);

// ========== ENHANCED ENDPOINTS (REAL-TIME QUIDAX DATA) ==========

// Get supported networks for a cryptocurrency (dynamic from Quidax)
router.get(
  '/networks',
  query('coin').isString().notEmpty(),
  validate,
  getCryptoNetworks
);

// Get live order book from Quidax
router.get('/order-book/live', getLiveOrderBook);

// Get live exchange rate from Quidax
router.get(
  '/exchange-rate/live',
  query('from').isString().notEmpty(),
  query('to').isString().notEmpty(),
  query('amount').optional().isFloat({ min: 0 }),
  validate,
  getLiveExchangeRate
);

// ========== EXISTING ENDPOINTS ==========

// Get order book
router.get('/order-book', getOrderBook);

// Create order (spot/limit)
router.post('/orders', requireKYCTier(2), createOrder);

// Get swap quote (temporary preview — no timer)
router.get('/swap/quote', requireKYCTier(2), getSwapQuote);

// ── Quotation-based swap lifecycle ──────────────────────────────────────────
// Step 2: Create real quotation (15s window)
router.post(
  '/swap/quotation',
  requireKYCTier(2),
  body('from_currency').isString().notEmpty(),
  body('to_currency').isString().notEmpty(),
  validate,
  createSwapQuotation
);
// Step 3: Refresh quotation
router.post('/swap/quotation/:id/refresh', requireKYCTier(2), refreshSwapQuotation);
// Step 4: Confirm quotation (executes swap)
router.post('/swap/quotation/:id/confirm', requireKYCTier(2), confirmSwapQuotation);
// Step 5: Poll swap transaction status
router.get('/swap/transactions/:id', verifyToken, getSwapTransaction);

// Get market trades
router.get('/market/trades', getMarketTrades);

// Get market ticker
router.get('/market/ticker', getMarketTicker);

// Get all markets
router.get('/markets', getMarkets);

// Get 24hr ticker statistics
router.get('/ticker/24h', get24hTickers);

// Get kline/candlestick data for charts
router.get(
  '/klines',
  query('market').isString().notEmpty(),
  query('period').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  validate,
  getKlines
);

// Get user's orders
router.get(
  '/orders',
  query('market').optional().isString(),
  query('status').optional().isString(),
  validate,
  getUserOrders
);

// Cancel order
router.post(
  '/orders/:id/cancel',
  requireKYCTier(2),
  cancelOrder
);

// Get withdrawal fee estimate
router.get(
  '/withdraw-fee',
  query('coin').isString().notEmpty(),
  query('network').optional().isString(),
  validate,
  getWithdrawFee
);

export default router;

