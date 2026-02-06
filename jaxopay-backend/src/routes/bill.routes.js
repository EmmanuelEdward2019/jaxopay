import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  getBillProviders,
  validateBillAccount,
  payBill,
  getBillHistory,
  getBillPayment,
  getBillCategories,
} from '../controllers/bill.controller.js';

const router = express.Router();

// All bill routes require authentication
router.use(verifyToken);

// Get bill categories
router.get('/categories', getBillCategories);

// Get bill providers
router.get(
  '/providers',
  query('category').optional().isString(),
  query('country').optional().isString(),
  validate,
  getBillProviders
);

// Get bill payment history
router.get(
  '/history',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('provider_id').optional().isString(),
  query('status').optional().isString(),
  validate,
  getBillHistory
);

// Get single bill payment
router.get(
  '/:billPaymentId',
  param('billPaymentId').isUUID(),
  validate,
  getBillPayment
);

// Validate bill account
router.post(
  '/validate',
  body('provider_id').isString(),
  body('account_number').isString(),
  validate,
  validateBillAccount
);

// Pay bill (requires KYC Tier 1+)
router.post(
  '/pay',
  requireKYCTier(1),
  body('provider_id').isString(),
  body('account_number').isString(),
  body('amount').isFloat({ min: 1 }),
  body('currency').isString().isLength({ min: 3, max: 3 }),
  body('metadata').optional().isObject(),
  validate,
  payBill
);

export default router;

