import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Get KYC status
export const getKYCStatus = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT u.kyc_tier, u.kyc_status,
            kd.id as document_id, kd.document_type, kd.document_number,
            kd.verification_status, kd.rejection_reason, kd.verified_at,
            kd.created_at, kd.updated_at
     FROM users u
     LEFT JOIN kyc_documents kd ON u.id = kd.user_id AND kd.deleted_at IS NULL
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
       AND verification_status = 'verified'
       AND deleted_at IS NULL`,
    [req.user.id, document_type]
  );

  if (existing.rows.length > 0) {
    throw new AppError('This document type is already verified', 409);
  }

  // Create KYC document
  const result = await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_front_url,
      document_back_url, selfie_url, metadata, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id, document_type, verification_status, created_at`,
    [
      req.user.id,
      document_type,
      document_number,
      document_front_url,
      document_back_url || null,
      selfie_url || null,
      metadata ? JSON.stringify(metadata) : null,
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
    `SELECT document_type, verification_status
     FROM kyc_documents
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [req.user.id]
  );

  const verifiedDocs = documents.rows
    .filter((doc) => doc.verification_status === 'verified')
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

