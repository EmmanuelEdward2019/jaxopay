import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGuard.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  getCards,
  getCard,
  createCard,
  fundCard,
  freezeCard,
  unfreezeCard,
  terminateCard,
  getCardTransactions,
  updateSpendingLimit,
} from '../controllers/card.controller.js';

const router = express.Router();

// All card routes require authentication
router.use(verifyToken);
router.use(requireFeature('virtual_cards'));

// Get all user cards
router.get('/', getCards);

// Get single card
router.get(
  '/:cardId',
  param('cardId').isUUID(),
  validate,
  getCard
);

// Get card transactions
router.get(
  '/:cardId/transactions',
  param('cardId').isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getCardTransactions
);

// Create virtual card (requires KYC Tier 2+)
router.post(
  '/',
  requireKYCTier(2),
  body('card_type').isIn(['single_use', 'multi_use']),
  body('currency').isString().isLength({ min: 3, max: 3 }),
  body('spending_limit').optional().isFloat({ min: 1 }),
  body('billing_address').isObject(),
  validate,
  createCard
);

// Fund card
router.post(
  '/:cardId/fund',
  param('cardId').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  validate,
  fundCard
);

// Freeze card
router.patch(
  '/:cardId/freeze',
  param('cardId').isUUID(),
  validate,
  freezeCard
);

// Unfreeze card
router.patch(
  '/:cardId/unfreeze',
  param('cardId').isUUID(),
  validate,
  unfreezeCard
);

// Update spending limit
router.patch(
  '/:cardId/spending-limit',
  param('cardId').isUUID(),
  body('spending_limit').isFloat({ min: 1 }),
  validate,
  updateSpendingLimit
);

// Terminate card
router.delete(
  '/:cardId',
  param('cardId').isUUID(),
  validate,
  terminateCard
);

export default router;

