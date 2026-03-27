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
  body('dob').optional({ values: 'falsy' }).trim(),
  body('images').isArray({ min: 1 }).withMessage('images array required'),
  validate,
  submitSmileBiometricKyc
);

const imageDataOrUrl = (field) =>
  body(field)
    .isString()
    .trim()
    .custom((value) => {
      if (!value || value.length < 24) return false;
      if (/^https?:\/\//i.test(value)) return true;
      // Any raster image data URL (jpeg, png, webp, heic, etc.)
      return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
    })
    .withMessage(`${field} must be a valid https URL or a base64 image data URL`);

const optionalImageDataOrUrl = (field) =>
  body(field)
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .custom((value) => {
      if (!value) return true;
      if (value.length < 24) return false;
      if (/^https?:\/\//i.test(value)) return true;
      return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
    });

// Submit KYC document (JSON with URLs or data:image URLs from the client)
router.post(
  '/submit',
  body('document_type')
    .isIn([
      'id_card',
      'national_id',
      'passport',
      'drivers_license',
      'nin',
      'bvn',
      'proof_of_address',
      'utility_bill',
      'proof_of_income',
    ])
    .withMessage('Invalid document type'),
  body('document_number').custom((value, { req }) => {
    const t = req.body?.document_type;
    if (t === 'proof_of_address' || t === 'utility_bill') return true;
    return typeof value === 'string' && value.trim().length >= 1;
  }),
  imageDataOrUrl('document_front_url'),
  optionalImageDataOrUrl('document_back_url'),
  optionalImageDataOrUrl('selfie_url'),
  validate,
  submitKYCDocument
);

// Request tier upgrade (schema supports tier_0 → tier_2)
router.post(
  '/upgrade',
  body('target_tier').isInt({ min: 1, max: 2 }),
  validate,
  requestTierUpgrade
);

export default router;

