import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  getPaymentCorridors,
  getBeneficiaries,
  addBeneficiary,
  deleteBeneficiary,
  sendMoney,
  getPaymentHistory,
  getPayment,
  getFXQuote,
} from '../controllers/payment.controller.js';

const router = express.Router();

// All payment routes require authentication
router.use(verifyToken);

// Get payment corridors
router.get('/corridors', getPaymentCorridors);

// Get FX quote
router.get(
  '/quote',
  query('from').isString(),
  query('to').isString(),
  query('amount').isFloat({ min: 0.01 }),
  validate,
  getFXQuote
);

// Get beneficiaries
router.get('/beneficiaries', getBeneficiaries);

// Get payment history
router.get(
  '/history',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isString(),
  validate,
  getPaymentHistory
);

// Get single payment
router.get(
  '/:paymentId',
  param('paymentId').isUUID(),
  validate,
  getPayment
);

// Add beneficiary
router.post(
  '/beneficiaries',
  body('beneficiary_name').isString().trim(),
  body('account_number').isString().trim(),
  body('bank_name').isString().trim(),
  body('bank_code').optional().isString(),
  body('country').isString(),
  body('currency').isString().isLength({ min: 3, max: 3 }),
  body('beneficiary_type').optional().isIn(['individual', 'business']),
  body('metadata').optional().isObject(),
  validate,
  addBeneficiary
);

// Send money (requires KYC Tier 1+)
router.post(
  '/send',
  requireKYCTier(1),
  body('beneficiary_id').isUUID(),
  body('source_currency').isString().isLength({ min: 3, max: 3 }),
  body('destination_currency').isString().isLength({ min: 3, max: 3 }),
  body('source_amount').isFloat({ min: 1 }),
  body('purpose').optional().isString(),
  validate,
  sendMoney
);

// Delete beneficiary
router.delete(
  '/beneficiaries/:beneficiaryId',
  param('beneficiaryId').isUUID(),
  validate,
  deleteBeneficiary
);

export default router;

