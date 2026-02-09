import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGuard.js';
import { validate } from '../middleware/validator.js';
import { body, query } from 'express-validator';
import {
  getGiftCards,
  buyGiftCard,
  getMyGiftCards,
  sellGiftCard,
  redeemGiftCard,
  getGiftCardCategories,
} from '../controllers/giftCard.controller.js';

const router = express.Router();

// All gift card routes require authentication
router.use(verifyToken);
router.use(requireFeature('gift_cards'));

// Get gift card categories
router.get('/categories', getGiftCardCategories);

// Get available gift cards
router.get(
  '/',
  query('category').optional().isString(),
  query('country').optional().isString(),
  query('min_price').optional().isFloat({ min: 0 }),
  query('max_price').optional().isFloat({ min: 0 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getGiftCards
);

// Get user's gift cards
router.get(
  '/my-cards',
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getMyGiftCards
);

// Buy gift card (requires KYC Tier 1+)
router.post(
  '/buy',
  requireKYCTier(1),
  body('gift_card_id').isUUID(),
  body('quantity').isInt({ min: 1, max: 10 }),
  body('currency').isString().isLength({ min: 3, max: 3 }),
  validate,
  buyGiftCard
);

// Sell gift card (requires KYC Tier 1+)
router.post(
  '/sell',
  requireKYCTier(1),
  body('brand').isString(),
  body('category').isString(),
  body('denomination').isFloat({ min: 1 }),
  body('price').isFloat({ min: 1 }),
  body('currency').isString().isLength({ min: 3, max: 3 }),
  body('code').isString(),
  body('country').isString(),
  validate,
  sellGiftCard
);

// Redeem gift card
router.post(
  '/redeem',
  body('code').isString(),
  validate,
  redeemGiftCard
);

export default router;

