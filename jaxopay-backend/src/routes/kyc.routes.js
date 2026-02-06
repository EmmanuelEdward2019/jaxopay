import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body } from 'express-validator';
import {
  getKYCStatus,
  submitKYCDocument,
  getKYCLimits,
  requestTierUpgrade,
} from '../controllers/kyc.controller.js';

const router = express.Router();

// All KYC routes require authentication
router.use(verifyToken);

// Get KYC status
router.get('/status', getKYCStatus);

// Get KYC tier limits
router.get('/limits', getKYCLimits);

// Submit KYC document
router.post(
  '/submit',
  body('document_type')
    .isIn(['id_card', 'passport', 'drivers_license', 'proof_of_address', 'proof_of_income'])
    .withMessage('Invalid document type'),
  body('document_number').isString().trim(),
  body('document_front_url').isURL(),
  body('document_back_url').optional().isURL(),
  body('selfie_url').optional().isURL(),
  body('metadata').optional().isObject(),
  validate,
  submitKYCDocument
);

// Request tier upgrade
router.post(
  '/upgrade',
  body('target_tier').isInt({ min: 1, max: 3 }),
  validate,
  requestTierUpgrade
);

export default router;

