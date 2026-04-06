import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGuard.js';
import { validate } from '../middleware/validator.js';
import { useIdempotency } from '../middleware/idempotency.js';
import { body, query, param } from 'express-validator';
import {
  getGiftCards,
  getGiftCardProduct,
  getGiftCardCategories,
  getGiftCardCountries,
  getGiftCardDiscounts,
  buyGiftCard,
  getMyGiftCards,
  sellGiftCard,
  redeemGiftCard,
  getReloadlyBalance,
} from '../controllers/giftCard.controller.js';

const router = express.Router();

// All gift card routes require authentication
router.use(verifyToken);

// ─── Read-only endpoints ──────────────────────────────────────────

// Get supported countries
router.get('/countries', getGiftCardCountries);

// Get curated categories
router.get('/categories', getGiftCardCategories);

// Get gift card products from Reloadly
router.get(
  '/',
  query('country').optional().isString(),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('size').optional().isInt({ min: 1, max: 100 }),
  validate,
  getGiftCards
);

// Get single product details
router.get(
  '/products/:productId',
  param('productId').isNumeric(),
  validate,
  getGiftCardProduct
);

// Get reseller discounts
router.get('/discounts', getGiftCardDiscounts);

// Reloadly wallet balance (useful for admin monitoring)
router.get('/balance', getReloadlyBalance);

// ─── User's purchased cards ──────────────────────────────────────

router.get(
  '/my-cards',
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getMyGiftCards
);

// ─── Purchase & Redeem ───────────────────────────────────────────

// Buy gift card via Reloadly
router.post(
  '/buy',
  body('productId').notEmpty().withMessage('productId is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be positive'),
  body('quantity').optional().isInt({ min: 1, max: 10 }),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }),
  body('countryCode').optional().isString(),
  body('recipientEmail').optional().isEmail(),
  validate,
  buyGiftCard
);

// Sell gift card (stub — future feature)
router.post(
  '/sell',
  body('brand').isString(),
  body('code').isString(),
  validate,
  sellGiftCard
);

// Redeem / get gift card code
router.get(
  '/redeem/:transactionRef',
  param('transactionRef').notEmpty(),
  validate,
  redeemGiftCard
);

export default router;
