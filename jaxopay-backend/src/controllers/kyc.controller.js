import crypto from 'crypto';
import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import * as smileId from '../services/smileId.service.js';

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
  const {
    document_type,
    document_number,
    document_front_url,
    document_back_url,
    selfie_url,
    metadata,
  } = req.body;

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

  // Determine tier based on document type
  let tier = 'tier_2'; // Default to higher tier for unspecified docs
  if (['passport', 'national_id', 'drivers_license', 'id_card'].includes(document_type)) {
    tier = 'tier_1';
  } else if (['proof_of_address', 'utility_bill'].includes(document_type)) {
    tier = 'tier_2';
  }

  // Create KYC document
  const result = await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_front_url,
      document_back_url, selfie_url, metadata, status, tier)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     RETURNING id, document_type, status as verification_status, created_at`,
    [
      req.user.id,
      document_type,
      document_number,
      document_front_url,
      document_back_url || null,
      selfie_url || null,
      metadata ? JSON.stringify(metadata) : null,
      tier
    ]
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

// Request tier upgrade
export const requestTierUpgrade = catchAsync(async (req, res) => {
  const { target_tier } = req.body;

  if (target_tier <= req.user.kyc_tier) {
    throw new AppError('Target tier must be higher than current tier', 400);
  }

  if (target_tier > 3) {
    throw new AppError('Invalid tier', 400);
  }

  // Check if user has required documents
  const documents = await query(
    `SELECT document_type, status
     FROM kyc_documents
     WHERE user_id = $1`,
    [req.user.id]
  );

  const verifiedDocs = documents.rows
    .filter((doc) => doc.status === 'approved')
    .map((doc) => doc.document_type);

  // Simple validation (in production, this would be more sophisticated)
  const requiredDocs = {
    1: ['id_card'],
    2: ['id_card', 'proof_of_address'],
    3: ['id_card', 'proof_of_address', 'proof_of_income'],
  };

  const missing = requiredDocs[target_tier].filter(
    (doc) => !verifiedDocs.includes(doc)
  );

  if (missing.length > 0) {
    throw new AppError(
      `Missing required documents: ${missing.join(', ')}`,
      400
    );
  }

  // Update user tier
  await query(
    `UPDATE users SET kyc_tier = $1, updated_at = NOW() WHERE id = $2`,
    [target_tier, req.user.id]
  );

  logger.info('KYC tier upgraded:', {
    userId: req.user.id,
    newTier: target_tier,
  });

  res.status(200).json({
    success: true,
    message: `Successfully upgraded to Tier ${target_tier}`,
    data: {
      new_tier: target_tier,
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
     (user_id, document_type, document_number, document_front_url,
      document_back_url, selfie_url, metadata, status, tier)
     VALUES ($1, 'smile_basic_kyc', $2, $3, null, null, $4, 'pending', 'tier_1')`,
    [
      req.user.id,
      `SMILE:${jobId}`,
      'https://jaxopay.com/kyc/smile-id-async',
      JSON.stringify({
        smile_job_id: jobId,
        provider: 'smile_id',
        id_type,
        country,
      }),
    ]
  );

  await query(`UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`, [req.user.id]);

  logger.info('[KYC] Smile Basic KYC submitted', { userId: req.user.id, jobId });

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
  if (!typeIds.includes(3)) return 'Missing ID document image (image_type_id 3)';
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

  try {
    await smileId.submitBiometricKycJob({
      userId: req.user.id,
      jobId,
      callbackUrl,
      images: normalizedImages,
      idInfo,
    });
  } catch (e) {
    logger.error('[KYC] Smile Biometric submit failed:', e.message || e);
    throw new AppError(e.message || 'Could not start biometric verification', 502);
  }

  await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_front_url,
      document_back_url, selfie_url, metadata, status, tier)
     VALUES ($1, 'smile_biometric_kyc', $2, $3, null, null, $4, 'pending', 'tier_2')`,
    [
      req.user.id,
      `SMILE:${jobId}`,
      'https://jaxopay.com/kyc/smile-biometric',
      JSON.stringify({
        smile_job_id: jobId,
        provider: 'smile_id',
        job_type: 1,
        id_type: idInfo.id_type,
        country: idInfo.country,
      }),
    ]
  );

  await query(`UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`, [req.user.id]);

  logger.info('[KYC] Smile Biometric KYC queued', { userId: req.user.id, jobId });

  res.status(202).json({
    success: true,
    message:
      'Biometric verification with liveness has been submitted. We will update your account when processing completes.',
    data: { job_id: jobId },
  });
});

