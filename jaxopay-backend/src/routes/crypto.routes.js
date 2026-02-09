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
  getExchangeHistory,
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
  body('fiat_currency').isString().isLength({ min: 3, max: 3 }),
  body('crypto_amount').isFloat({ min: 0.00000001 }),
  validate,
  exchangeCryptoToFiat
);

// Exchange fiat to crypto (requires KYC Tier 2+)
router.post(
  '/buy',
  requireKYCTier(2),
  body('fiat_currency').isString().isLength({ min: 3, max: 3 }),
  body('crypto_currency').isString().isLength({ min: 2, max: 10 }),
  body('fiat_amount').isFloat({ min: 1 }),
  validate,
  exchangeFiatToCrypto
);

export default router;

