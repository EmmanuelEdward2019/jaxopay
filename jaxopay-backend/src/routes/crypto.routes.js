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
  getSwapQuote
} from '../controllers/crypto.controller.js';

const router = express.Router();

// All crypto routes require authentication
router.use(verifyToken);
router.use(requireFeature('crypto'));

// Get supported cryptocurrencies
router.get('/supported', getSupportedCryptos);

// Get exchange rates
router.get(
  '/rates',
  query('from').isString(),
  query('to').isString(),
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

// Get order book
router.get('/order-book', getOrderBook);

// Create order (spot/limit)
router.post('/orders', requireKYCTier(2), createOrder);

// Get swap quote
router.get('/swap/quote', requireKYCTier(2), getSwapQuote);

export default router;

