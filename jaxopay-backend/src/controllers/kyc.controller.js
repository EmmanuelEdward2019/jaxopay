import crypto from 'crypto';
import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import * as smileId from '../services/smileId.service.js';
import * as kycNotify from '../services/kycNotification.service.js';

/** DB column is `document_url` (not document_front_url). Optional back image stored as JSON in same column. */
function buildKycDocumentUrl(frontUrl, backUrl) {
  if (!backUrl) return frontUrl;
  return JSON.stringify({ front: frontUrl, back: backUrl });
}

// Get KYC status
export const getKYCStatus = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT u.kyc_tier, u.kyc_status,
            kd.id as document_id, kd.document_type, kd.document_number,
            kd.status as verification_status, kd.rejection_reason, kd.reviewed_at as verified_at,
            kd.created_at, kd.updated_at
     FROM users u
     LEFT JOIN kyc_documents kd ON u.id = kd.user_id
     WHERE u.id = $1
     ORDER BY kd.created_at DESC`,
    [req.user.id]
  );

  const user = result.rows[0];
  const documents = result.rows.filter((row) => row.document_id);

  res.status(200).json({
    success: true,
    data: {
      kyc_tier: user.kyc_tier,
      kyc_status: user.kyc_status,
      verification_status: user.kyc_status,
      documents: documents.map((doc) => ({
        id: doc.document_id,
        document_type: doc.document_type,
        document_number: doc.document_number,
        verification_status: doc.verification_status,
        rejection_reason: doc.rejection_reason,
        verified_at: doc.verified_at,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      })),
    },
  });
});

// Submit KYC document
export const submitKYCDocument = catchAsync(async (req, res) => {
  const { document_type, document_number, document_front_url, document_back_url, selfie_url } = req.body;

  const docNumber =
    document_type === 'proof_of_address' || document_type === 'utility_bill'
      ? (document_number && String(document_number).trim()) || 'proof_of_address'
      : String(document_number).trim();

  // Check if document type already exists and is verified
  const existing = await query(
    `SELECT id FROM kyc_documents
     WHERE user_id = $1 AND document_type = $2
       AND status = 'approved'`,
    [req.user.id, document_type]
  );

  if (existing.rows.length > 0) {
    throw new AppError('This document type is already verified', 409);
  }

  // Tier: primary ID (T1) vs enhanced / address (T2) — NIN, BVN, POA count toward verified (T2)
  let tier = 'tier_2';
  if (['passport', 'national_id', 'drivers_license', 'id_card'].includes(document_type)) {
    tier = 'tier_1';
  } else if (
    ['nin', 'bvn', 'proof_of_address', 'utility_bill', 'proof_of_income'].includes(document_type)
  ) {
    tier = 'tier_2';
  }

  const documentUrl = buildKycDocumentUrl(document_front_url, document_back_url || null);

  const result = await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_url, selfie_url, status, tier)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING id, document_type, status as verification_status, created_at`,
    [req.user.id, document_type, docNumber, documentUrl, selfie_url || null, tier]
  );

  // Update user KYC status
  await query(
    `UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`,
    [req.user.id]
  );

  logger.info('KYC document submitted:', {
    userId: req.user.id,
    documentType: document_type,
  });

  kycNotify
    .notifyManualKycSubmitted({
      userId: req.user.id,
      documentType: document_type,
      tier,
      documentId: result.rows[0].id,
    })
    .catch((err) => logger.error('[KYC] notifyManualKycSubmitted:', err?.message || err));

  res.status(201).json({
    success: true,
    message: 'KYC document submitted successfully. Verification in progress.',
    data: result.rows[0],
  });
});

// GET /kyc/documents — list submitted KYC rows for the current user
export const getKYCDocuments = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, document_type, document_number, status, rejection_reason,
            reviewed_at, created_at, updated_at
     FROM kyc_documents
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.status(200).json({
    success: true,
    data: { documents: result.rows },
  });
});

// Get KYC tier limits
export const getKYCLimits = catchAsync(async (req, res) => {
  const limits = {
    tier_0: {
      name: 'Unverified',
      daily_limit: 0,
      monthly_limit: 0,
      features: ['View only'],
    },
    tier_1: {
      name: 'Basic',
      daily_limit: 1000,
      monthly_limit: 10000,
      features: [
        'Send/Receive money',
        'Basic wallet',
        'Bill payments',
        'Gift cards',
      ],
      required_documents: ['ID Card or Passport'],
    },
    tier_2: {
      name: 'Intermediate',
      daily_limit: 5000,
      monthly_limit: 50000,
      features: [
        'All Tier 1 features',
        'Virtual cards',
        'Crypto exchange',
        'Flight booking',
      ],
      required_documents: ['ID Card or Passport', 'Proof of Address'],
    },
    tier_3: {
      name: 'Advanced',
      daily_limit: 50000,
      monthly_limit: 500000,
      features: [
        'All Tier 2 features',
        'Higher limits',
        'Priority support',
        'Business accounts',
      ],
      required_documents: [
        'ID Card or Passport',
        'Proof of Address',
        'Proof of Income',
      ],
    },
  };

  res.status(200).json({
    success: true,
    data: {
      current_tier: req.user.kyc_tier,
      limits,
    },
  });
});

function parseTierStep(tier) {
  if (tier == null) return 0;
  if (typeof tier === 'number' && !Number.isNaN(tier)) return Math.min(2, Math.max(0, tier));
  const s = String(tier);
  const m = s.match(/(\d+)/);
  return m ? Math.min(2, Math.max(0, parseInt(m[1], 10))) : 0;
}

const GOV_ID_DOC_TYPES = new Set([
  'id_card',
  'national_id',
  'passport',
  'drivers_license',
  'nin',
  'bvn',
  'smile_basic_kyc',
  'smile_biometric_kyc',
]);

// Request tier upgrade (DB enum: tier_0 .. tier_2)
export const requestTierUpgrade = catchAsync(async (req, res) => {
  const { target_tier } = req.body;

  const currentStep = parseTierStep(req.user.kyc_tier);
  const targetStep = parseTierStep(target_tier);

  if (targetStep <= currentStep) {
    throw new AppError('Target tier must be higher than current tier', 400);
  }

  if (targetStep > 2) {
    throw new AppError('Invalid tier', 400);
  }

  const documents = await query(
    `SELECT document_type, status
     FROM kyc_documents
     WHERE user_id = $1`,
    [req.user.id]
  );

  const verifiedDocs = documents.rows
    .filter((doc) => doc.status === 'approved')
    .map((doc) => doc.document_type);

  const hasGovId = verifiedDocs.some((t) => GOV_ID_DOC_TYPES.has(t));
  const hasPoa = verifiedDocs.includes('proof_of_address') || verifiedDocs.includes('utility_bill');

  if (targetStep === 1) {
    if (!hasGovId) {
      throw new AppError(
        'Missing approved government ID (passport, national ID, NIN, BVN, or completed identity check)',
        400
      );
    }
  }

  if (targetStep === 2) {
    if (!hasPoa) {
      throw new AppError('Missing approved proof of address', 400);
    }
    if (!hasGovId) {
      throw new AppError(
        'Tier 2 requires proof of address plus an approved government ID (NIN, BVN, passport, national ID, or completed identity verification)',
        400
      );
    }
  }

  const newTierLabel = `tier_${targetStep}`;

  await query(`UPDATE users SET kyc_tier = $1, updated_at = NOW() WHERE id = $2`, [
    newTierLabel,
    req.user.id,
  ]);

  logger.info('KYC tier upgraded:', {
    userId: req.user.id,
    newTier: newTierLabel,
  });

  kycNotify
    .notifyTierSelfUpgrade({ userId: req.user.id, newTier: newTierLabel })
    .catch((err) => logger.error('[KYC] notifyTierSelfUpgrade:', err?.message || err));

  res.status(200).json({
    success: true,
    message: `Successfully upgraded to ${newTierLabel.replace('_', ' ')}`,
    data: {
      new_tier: newTierLabel,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────
// Smile ID — KYC / AML (Basic KYC async + mobile auth package)
// ─────────────────────────────────────────────────────────────────────

export const getSmileIdConfig = catchAsync(async (req, res) => {
  // Do not expose partner_id, API URLs, or webhook paths to clients — secrets stay server-side only.
  res.status(200).json({
    success: true,
    data: {
      configured: smileId.isSmileConfigured(),
      sandbox: smileId.getSmileApiBase().includes('testapi'),
      biometric_kyc_enabled: smileId.isSmileConfigured(),
    },
  });
});

/** Short-lived signature for Smile mobile SDK flows (never returns API key). */
export const postSmileAuthPackage = catchAsync(async (req, res) => {
  if (!smileId.isSmileConfigured()) {
    throw new AppError('Identity verification is not available', 503);
  }
  const pkg = smileId.getMobileAuthPackage();
  if (!pkg) throw new AppError('Could not start verification session', 500);
  res.status(200).json({ success: true, data: pkg });
});

/** Submit Basic KYC (job_type 5) to Smile Identity — async; results via webhook. */
export const submitSmileBasicKyc = catchAsync(async (req, res) => {
  if (!smileId.isSmileConfigured()) {
    throw new AppError('Identity verification is not available', 503);
  }

  const apiBase = (process.env.API_BASE_URL || '').replace(/\/$/, '');
  if (!apiBase) {
    throw new AppError('Server callback URL is not configured. Please contact support.', 500);
  }

  const {
    country,
    id_type,
    id_number,
    first_name,
    last_name,
    middle_name,
    dob,
    gender,
    phone_number,
  } = req.body;

  const callbackUrl = `${apiBase}/api/v1/webhooks/smile_identity`;

  const { smileResponse, jobId } = await smileId.submitBasicKycAsync({
    userId: req.user.id,
    callbackUrl,
    country,
    id_type,
    id_number,
    first_name,
    last_name,
    middle_name,
    dob,
    gender,
    phone_number,
  });

  await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_url, selfie_url, status, tier)
     VALUES ($1, 'smile_basic_kyc', $2, $3, null, 'pending', 'tier_1')`,
    [req.user.id, `SMILE:${jobId}`, 'https://jaxopay.com/kyc/smile-id-async']
  );

  await query(`UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`, [req.user.id]);

  logger.info('[KYC] Smile Basic KYC submitted', { userId: req.user.id, jobId });

  kycNotify
    .notifySmileBasicSubmitted({ userId: req.user.id, jobId })
    .catch((err) => logger.error('[KYC] notifySmileBasicSubmitted:', err?.message || err));

  res.status(202).json({
    success: true,
    message: 'Verification submitted. You will be updated when processing completes.',
    data: {
      job_id: jobId,
    },
  });
});

function validateSmileBiometricImages(images) {
  if (!Array.isArray(images) || images.length < 4) {
    return 'images must be a non-empty array (selfie, liveness, and ID captures required)';
  }
  const typeIds = images.map((i) => parseInt(i.image_type_id, 10));
  if (!typeIds.includes(2)) return 'Missing selfie image (image_type_id 2)';
  if (!typeIds.some((t) => t === 6)) return 'Missing liveness images (image_type_id 6)';
  // Smart Camera Web uses 3 = ID front, 7 = ID back / alternate capture
  if (!typeIds.some((t) => t === 3 || t === 7)) {
    return 'Missing ID document image (image_type_id 3 or 7)';
  }
  for (const img of images) {
    if (!img?.image || typeof img.image !== 'string' || img.image.length < 50) {
      return 'Each image must include a base64-encoded JPEG payload';
    }
  }
  return null;
}

/** POST /kyc/smile/biometric-kyc — Biometric KYC with liveness (Smart Camera Web). */
export const submitSmileBiometricKyc = catchAsync(async (req, res) => {
  if (!smileId.isSmileConfigured()) {
    throw new AppError('Identity verification is not available', 503);
  }

  const apiBase = (process.env.API_BASE_URL || '').replace(/\/$/, '');
  if (!apiBase) {
    throw new AppError('Server callback URL is not configured. Please contact support.', 500);
  }

  const { country, id_type, id_number, first_name, last_name, dob, images } = req.body;

  const imgErr = validateSmileBiometricImages(images);
  if (imgErr) throw new AppError(imgErr, 400);

  const pending = await query(
    `SELECT id FROM kyc_documents
     WHERE user_id = $1 AND status = 'pending'
       AND document_type IN ('smile_basic_kyc', 'smile_biometric_kyc')`,
    [req.user.id]
  );
  if (pending.rows.length > 0) {
    throw new AppError('A verification is already in progress. Please wait for the result.', 409);
  }

  const jobId = crypto.randomUUID();
  const callbackUrl = `${apiBase}/api/v1/webhooks/smile_identity`;

  const idInfo = {
    first_name: String(first_name).trim(),
    last_name: String(last_name).trim(),
    country: String(country).toUpperCase(),
    id_type: String(id_type).trim(),
    id_number: String(id_number).trim(),
    dob: dob ? String(dob).trim() : '',
    entered: 'false',
  };

  const normalizedImages = images.map((i) => ({
    image_type_id: parseInt(i.image_type_id, 10),
    image: String(i.image).replace(/^data:image\/\w+;base64,/, ''),
  }));

  const docNumber = `SMILE:${jobId}`;

  // Persist first so the user has a pending row; respond quickly. Calling Smile synchronously
  // here held the HTTP request open for a long upload and triggered DB/proxy/client timeouts.
  await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_url, selfie_url, status, tier)
     VALUES ($1, 'smile_biometric_kyc', $2, $3, null, 'pending', 'tier_2')`,
    [req.user.id, docNumber, 'https://jaxopay.com/kyc/smile-biometric']
  );

  await query(`UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`, [req.user.id]);

  logger.info('[KYC] Smile Biometric KYC record created; submitting to provider async', {
    userId: req.user.id,
    jobId,
  });

  kycNotify
    .notifySmileBiometricSubmitted({ userId: req.user.id, jobId })
    .catch((err) => logger.error('[KYC] notifySmileBiometricSubmitted:', err?.message || err));

  res.status(202).json({
    success: true,
    message:
      'Biometric verification with liveness has been submitted. We will update your account when processing completes.',
    data: { job_id: jobId },
  });

  const userId = req.user.id;
  setImmediate(() => {
    smileId
      .submitBiometricKycJob({
        userId,
        jobId,
        callbackUrl,
        images: normalizedImages,
        idInfo,
      })
      .then(() => {
        logger.info('[KYC] Smile Biometric job accepted by provider', { userId, jobId });
      })
      .catch((e) => {
        const msg = e?.message || String(e);
        logger.error('[KYC] Smile Biometric submit failed (async):', msg);
        query(
          `UPDATE kyc_documents
           SET status = 'rejected',
               rejection_reason = $1,
               updated_at = NOW()
           WHERE user_id = $2 AND document_type = 'smile_biometric_kyc' AND document_number = $3`,
          [
            'Identity verification could not be submitted to the provider. Please try again or contact support.',
            userId,
            docNumber,
          ]
        )
          .then((upd) => {
            if (upd.rowCount > 0) {
              return kycNotify.notifySmileKycWebhookResult({
                userId,
                jobId,
                documentType: 'smile_biometric_kyc',
                approved: false,
                resultText:
                  'Identity verification could not be submitted to the provider. Please try again or contact support.',
              });
            }
          })
          .catch((dbErr) => logger.error('[KYC] Failed to mark biometric job failed:', dbErr.message || dbErr));
      });
  });
});

