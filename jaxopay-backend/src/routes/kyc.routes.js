import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body } from 'express-validator';
import {
  getKYCStatus,
  submitKYCDocument,
  getKYCDocuments,
  getKYCLimits,
  requestTierUpgrade,
  getSmileIdConfig,
  postSmileAuthPackage,
  submitSmileBasicKyc,
  submitSmileBiometricKyc,
} from '../controllers/kyc.controller.js';

const router = express.Router();

// All KYC routes require authentication
router.use(verifyToken);

// Get KYC status
router.get('/status', getKYCStatus);

// Submitted KYC documents (for dashboard history)
router.get('/documents', getKYCDocuments);

// Get KYC tier limits
router.get('/limits', getKYCLimits);
router.get('/tier-limits', getKYCLimits);

// Smile ID (mobile + server KYC)
router.get('/smile/config', getSmileIdConfig);
router.post('/smile/auth-package', postSmileAuthPackage);
router.post(
  '/smile/basic-kyc',
  body('country').isLength({ min: 2, max: 2 }).withMessage('country must be ISO2'),
  body('id_type').notEmpty().trim(),
  body('id_number').notEmpty().trim(),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('middle_name').optional().trim(),
  body('dob').optional().trim(),
  body('gender').optional().isIn(['M', 'F', 'm', 'f']),
  body('phone_number').optional().trim(),
  validate,
  submitSmileBasicKyc
);

router.post(
  '/smile/biometric-kyc',
  body('country').isLength({ min: 2, max: 2 }).withMessage('country must be ISO2'),
  body('id_type').notEmpty().trim(),
  body('id_number').notEmpty().trim(),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('dob').optional().trim(),
  body('images').isArray({ min: 1 }).withMessage('images array required'),
  validate,
  submitSmileBiometricKyc
);

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

