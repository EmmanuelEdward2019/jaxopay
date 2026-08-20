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
  prepareSmileBiometricJob,
  cancelSmileBiometricJob,
  submitRampIdVerification,
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

// RN native Smile SDK path — see prepareSmileBiometricJob's doc comment for why this exists
// separately from the endpoint above (the device submits images directly to Smile, not to us).
router.post('/smile/biometric-kyc/prepare', prepareSmileBiometricJob);
router.post('/smile/biometric-kyc/:jobId/cancel', cancelSmileBiometricJob);

const looksLikeImageOrUrl = (value) => {
  if (!value || typeof value !== 'string' || value.length < 24) return false;
  if (/^https?:\/\//i.test(value)) return true;
  // Any raster image data URL (jpeg, png, webp, heic, etc.)
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
};

const optionalImageDataOrUrl = (field) =>
  body(field)
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .custom((value) => !value || looksLikeImageOrUrl(value));

// document_front_url is only mandatory for proof-of-address-style docs (Tier 3, which still needs
// an actual photo). ID documents (nin/passport/national_id/drivers_license/id_card/bvn) no longer
// collect a photo — the controller stores a sentinel when this is omitted for those types.
// NOTE: deliberately not using .optional() here — it would skip this custom() entirely for falsy
// values, which is exactly the case we need to inspect (to decide, per document_type, whether a
// missing value is allowed).
const NO_PHOTO_DOC_TYPES = ['nin', 'passport', 'national_id', 'drivers_license', 'id_card', 'bvn'];
const documentFrontUrlField = body('document_front_url')
  .custom((value, { req }) => {
    if (!value) {
      if (NO_PHOTO_DOC_TYPES.includes(req.body?.document_type)) return true;
      throw new Error('document_front_url is required for this document type');
    }
    if (!looksLikeImageOrUrl(value)) {
      throw new Error('document_front_url must be a valid https URL or a base64 image data URL');
    }
    return true;
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
  documentFrontUrlField,
  optionalImageDataOrUrl('document_back_url'),
  optionalImageDataOrUrl('selfie_url'),
  validate,
  submitKYCDocument
);

// Verify BVN/NIN for crypto on/off-ramp
router.post(
  '/verify-id',
  body('id_type').notEmpty().trim(),
  body('id_number').notEmpty().trim(),
  body('first_name').optional().trim(),
  body('last_name').optional().trim(),
  body('dob').optional({ values: 'falsy' }).trim(),
  body('gender').optional({ values: 'falsy' }).isIn(['M', 'F', 'm', 'f']),
  validate,
  submitRampIdVerification
);

// Request tier upgrade (schema supports tier_0 → tier_3)
router.post(
  '/upgrade',
  body('target_tier').isInt({ min: 1, max: 3 }),
  validate,
  requestTierUpgrade
);

export default router;

