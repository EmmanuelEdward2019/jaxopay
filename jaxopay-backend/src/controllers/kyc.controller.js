import crypto from 'crypto';
import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import * as smileId from '../services/smileId.service.js';
import * as kycNotify from '../services/kycNotification.service.js';
import { auditFromReq, recordAudit } from '../services/audit.service.js';
import { reconcileSmileJobsForUser } from './webhook.controller.js';

/** DB column is `document_url` (not document_front_url). Optional back image stored as JSON in same column. */
function buildKycDocumentUrl(frontUrl, backUrl) {
  if (!backUrl) return frontUrl;
  return JSON.stringify({ front: frontUrl, back: backUrl });
}

// document_url is NOT NULL in the schema, but Tier 2 (nin/passport/national_id/drivers_license/
// id_card/bvn) no longer collects a document photo — only proof_of_address (Tier 3) still does.
// This sentinel fills the column for a number-only submission, same convention already used by
// the Smile-based paths below (e.g. 'https://jaxopay.com/kyc/smile-biometric') for rows with no
// locally-stored image.
const NO_DOCUMENT_PHOTO_URL = 'https://jaxopay.com/kyc/manual-number-only';
const ID_DOCUMENT_TYPES_NO_PHOTO = ['nin', 'passport', 'national_id', 'drivers_license', 'voter_id', 'id_card', 'bvn'];

/**
 * Build a public `${host}/api/v1/<path>` URL for provider callbacks, tolerant of how
 * API_BASE_URL is set (with or without a trailing /api/v1, with or without scheme).
 * Smile Identity POSTs its async result to this URL, so it MUST be publicly reachable.
 */
function buildCallbackUrl(path) {
  const raw = (process.env.API_BASE_URL || 'http://localhost:3000').trim();
  const base = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(base);
  const basePath = url.pathname.replace(/\/+$/, '').replace(/\/api\/v\d+$/i, '');
  url.pathname = `${basePath}/api/v1/${String(path).replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString();
}

// Get KYC status
export const getKYCStatus = catchAsync(async (req, res) => {
  // Give this user's own pending Smile job(s) a live check before reading our copy — resolves
  // the exact gap a webhook drop causes (approved on Smile's dashboard, stuck 'pending' here)
  // the moment the user presses "Check status", rather than waiting for the next sweep tick.
  await reconcileSmileJobsForUser(req.user.id).catch((e) => logger.warn('[KYC status] live reconcile:', e.message));

  const result = await query(
    `SELECT u.kyc_tier, u.kyc_status,
            kd.id as document_id, kd.document_type, kd.document_number,
            kd.status as verification_status, kd.rejection_reason, kd.reviewed_at as verified_at,
            kd.created_at, kd.updated_at, kd.selfie_url
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
        // Not the image itself — just whether a selfie was attached, so the client can tell
        // facial verification apart from a bare ID upload without guessing.
        has_selfie: !!doc.selfie_url,
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

  // Tier label (for admin review UI): NIN/passport/national ID/driver's license count toward
  // Tier 2 (identity); proof of address counts toward Tier 3. BVN isn't part of the tier ladder
  // at all (it gates Nigeria-only transactions directly, not KYC tier — see kycLimits.service.js).
  let tier = 'tier_2';
  if (['proof_of_address', 'utility_bill', 'proof_of_income'].includes(document_type)) {
    tier = 'tier_3';
  } else if (['nin', 'passport', 'national_id', 'drivers_license', 'voter_id', 'id_card', 'bvn'].includes(document_type)) {
    tier = 'tier_2';
  }

  const documentUrl = ID_DOCUMENT_TYPES_NO_PHOTO.includes(document_type)
    ? buildKycDocumentUrl(document_front_url || NO_DOCUMENT_PHOTO_URL, document_back_url || null)
    : buildKycDocumentUrl(document_front_url, document_back_url || null);

  const result = await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_url, selfie_url, status, tier)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING id, document_type, status as verification_status, created_at`,
    [req.user.id, document_type, docNumber, documentUrl, selfie_url || null, tier]
  );

  // Update user KYC status. 'pending' is the untouched default every account starts with (see
  // users.kyc_status column default) — using it here too would make a fresh signup indistinguishable
  // from someone with a real submission awaiting review, so an actual submission moves to
  // 'under_review' instead.
  await query(
    `UPDATE users SET kyc_status = 'under_review', updated_at = NOW() WHERE id = $1`,
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

  auditFromReq(req, { action: 'kyc_submitted', entityType: 'kyc_document', entityId: result.rows[0]?.id, newValues: { document_type: result.rows[0]?.document_type, method: 'manual' } });

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

// Get KYC tier limits — daily/monthly figures mirror TIER_CAPS_USD in kycLimits.service.js
// (kept as plain literals here since this is a display/status endpoint, not the enforcement path).
// Object keys (tier_0..tier_3) stay the real DB enum values — never renumber those. Only each
// entry's `name` is user-facing display text, and it's offset by -1 from the real tier (tier_1's
// document is "Tier 0" on screen, tier_3's is "Tier 2") since the product no longer shows a
// "Tier 3" anywhere — both web and mobile shifted their own display numbering to match.
export const getKYCLimits = catchAsync(async (req, res) => {
  const limits = {
    tier_0: {
      name: 'Unverified',
      daily_limit_crypto: 0,
      daily_limit_fiat: 0,
      monthly_limit_crypto: 0,
      monthly_limit_fiat: 0,
      features: ['Browse only — cannot transact'],
      required: ['Sign up'],
    },
    tier_1: {
      name: 'Tier 0',
      daily_limit_crypto: 0,
      daily_limit_fiat: 0,
      monthly_limit_crypto: 0,
      monthly_limit_fiat: 0,
      features: ['Profile complete — verification in progress'],
      required: ['Full name', 'Residential address', 'Verified email', 'Phone number'],
    },
    tier_2: {
      name: 'Tier 1',
      daily_limit_crypto: 5000000,
      daily_limit_fiat: 50000,
      monthly_limit_crypto: 50000000,
      monthly_limit_fiat: 500000,
      features: ['Deposits & transfers', 'Bill payments', 'Crypto buy/sell & swaps', 'Virtual cards'],
      required: ['NIN', 'Facial verification'],
    },
    tier_3: {
      name: 'Tier 2',
      daily_limit_crypto: 8000000,
      daily_limit_fiat: 500000,
      monthly_limit_crypto: 80000000,
      monthly_limit_fiat: 5000000,
      features: ['All Tier 2 features', 'Highest transaction limits', 'Priority support'],
      required: ['Proof of address (utility bill or bank statement)'],
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
  if (typeof tier === 'number' && !Number.isNaN(tier)) return Math.min(3, Math.max(0, tier));
  const s = String(tier);
  const m = s.match(/(\d+)/);
  return m ? Math.min(3, Math.max(0, parseInt(m[1], 10))) : 0;
}

// Request tier upgrade (DB enum: tier_0 .. tier_3)
// tier_1: profile completion (name/address/phone/verified email) — no document required.
// tier_2: approved NIN + facial/biometric verification.
// tier_3: + approved proof of address.
export const requestTierUpgrade = catchAsync(async (req, res) => {
  const { target_tier } = req.body;

  const currentStep = parseTierStep(req.user.kyc_tier);
  const targetStep = parseTierStep(target_tier);

  if (targetStep <= currentStep) {
    throw new AppError('Target tier must be higher than current tier', 400);
  }

  if (targetStep > 3) {
    throw new AppError('Invalid tier', 400);
  }

  if (targetStep === 1) {
    const prof = (await query(
      `SELECT up.first_name, up.last_name, up.address_line1, u.phone, u.is_email_verified
       FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    )).rows[0] || {};

    const missing = [];
    if (!prof.is_email_verified) missing.push('a verified email address');
    if (!String(prof.first_name || '').trim() || !String(prof.last_name || '').trim()) missing.push('your full name');
    if (!String(prof.address_line1 || '').trim()) missing.push('your address');
    if (!String(prof.phone || '').trim()) missing.push('a phone number');

    if (missing.length > 0) {
      throw new AppError(`Please complete your profile first: ${missing.join(', ')}.`, 400, 'PROFILE_INCOMPLETE');
    }
  } else {
    const [documents, profRes] = await Promise.all([
      query(
        `SELECT document_type, status, selfie_url
         FROM kyc_documents
         WHERE user_id = $1`,
        [req.user.id]
      ),
      query(`SELECT country FROM user_profiles WHERE user_id = $1`, [req.user.id]),
    ]);
    const country = String(profRes.rows[0]?.country || 'NG').toUpperCase().slice(0, 2);

    const approved = documents.rows.filter((doc) => doc.status === 'approved');
    const approvedTypes = approved.map((doc) => doc.document_type);
    // NIN only exists for Nigerians — non-NG users prove identity with a passport/national ID instead.
    const hasNin = approvedTypes.includes('nin')
      || (country !== 'NG' && ['passport', 'national_id', 'drivers_license', 'voter_id', 'id_card'].some((t) => approvedTypes.includes(t)));
    const hasFacial = approvedTypes.includes('smile_biometric_kyc')
      || approved.some((doc) => doc.selfie_url);
    const hasPoa = approvedTypes.includes('proof_of_address') || approvedTypes.includes('utility_bill');

    if (targetStep === 2) {
      const missing = [];
      if (!hasNin) missing.push(country === 'NG' ? 'an approved NIN' : 'an approved government ID');
      if (!hasFacial) missing.push('facial verification');
      if (missing.length > 0) {
        throw new AppError(`Tier 1 requires ${missing.join(' and ')}.`, 400);
      }
    }

    if (targetStep === 3) {
      if (!hasPoa) {
        throw new AppError('Tier 2 requires an approved proof of address (utility bill or bank statement).', 400);
      }
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
    message: `Successfully upgraded to Tier ${targetStep - 1}`,
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

/**
 * POST /kyc/smile/v3-token — mints a short-lived v3 auth token for the web dashboard's hosted
 * Web SDK (window.SmileIdentity(...)). The SDK handles capture AND submission entirely
 * client-side against Smile's V3 API once it has this token — unlike the REST-relay path above,
 * there's no image payload for our backend to see or forward here at all.
 */
export const postSmileV3Token = catchAsync(async (req, res) => {
  if (!smileId.isSmileConfigured()) {
    throw new AppError('Identity verification is not available', 503);
  }
  if (!process.env.API_BASE_URL) {
    throw new AppError('Server callback URL is not configured. Please contact support.', 500);
  }
  const { product } = req.body || {};
  const { token, environment } = await smileId.mintV3Token({ userId: req.user.id, product });
  // partner_id is not a secret (only the API key is) — the v12 Web SDK's own docs require it
  // directly in the browser's partner_details config, paired with the short-lived token above.
  const { partnerId } = smileId.getSmileCredentials();
  res.status(200).json({
    success: true,
    data: { token, environment, partnerId, callback_url: buildCallbackUrl('/webhooks/smile_identity') },
  });
});

/** Submit Basic KYC (job_type 5) to Smile Identity — async; results via webhook. */
export const submitSmileBasicKyc = catchAsync(async (req, res) => {
  if (!smileId.isSmileConfigured()) {
    throw new AppError('Identity verification is not available', 503);
  }

  if (!process.env.API_BASE_URL) {
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

  const callbackUrl = buildCallbackUrl('/webhooks/smile_identity');

  const { smileResponse, jobId } = await smileId.submitBasicKycAsync({
    userId: req.user.id,
    callbackUrl,
    country,
    // Smile's API is case-sensitive on id_type (see submitRampIdVerification for the confirmed
    // production failure this caused there) — normalize here too rather than trust the caller.
    id_type: String(id_type || '').toUpperCase(),
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

  await query(`UPDATE users SET kyc_status = 'under_review', updated_at = NOW() WHERE id = $1`, [req.user.id]);

  logger.info('[KYC] Smile Basic KYC submitted', { userId: req.user.id, jobId });
  auditFromReq(req, { action: 'kyc_submitted', entityType: 'kyc_document', newValues: { method: 'smile_basic', job_id: jobId } });

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

/**
 * POST /kyc/verify-id — verify a Nigerian BVN or NIN (required before crypto on/off-ramp).
 * Fires SmileID Basic KYC for verification AND stores the BVN/NIN so the ramp gate + the
 * Yellow Card sender `additionalId` can use it. The Smile callback promotes/rejects it.
 */
export const submitRampIdVerification = catchAsync(async (req, res) => {
  const { id_type, id_number, first_name, last_name, middle_name, dob, gender, phone_number } = req.body;
  const t = String(id_type || '').toLowerCase();
  const docType = t.includes('bvn') ? 'bvn' : 'nin';
  const num = String(id_number || '').trim();
  if (!num) throw new AppError('id_number is required', 400);
  if (docType === 'bvn' && !/^\d{11}$/.test(num)) throw new AppError('BVN must be 11 digits', 400);
  if (docType === 'nin' && !/^\d{11}$/.test(num)) throw new AppError('NIN must be 11 digits', 400);

  // Profile fields live on user_profiles; phone lives on users — join like _buildSender does.
  const prof = (await query(
    `SELECT p.first_name, p.last_name, p.date_of_birth, p.gender, u.phone
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  )).rows[0] || {};
  const fn = first_name || prof.first_name;
  const ln = last_name || prof.last_name;
  if (!fn || !ln) throw new AppError('Please add your full legal name in your profile first.', 400, 'PROFILE_INCOMPLETE');

  // Idempotency: if this exact ID is already on file (pending/approved), don't duplicate it.
  const existing = (await query(
    `SELECT id, status::text AS status FROM kyc_documents
     WHERE user_id = $1 AND document_type = $2 AND document_number = $3
       AND (status IS NULL OR status::text <> 'rejected') LIMIT 1`,
    [req.user.id, docType, num]
  )).rows[0];
  if (existing) {
    return res.status(202).json({
      success: true,
      message: existing.status === 'approved' ? 'Your ID is verified. You can proceed.' : 'Your ID is already submitted and under review. You will be able to transact once it is approved.',
      data: { id_type: docType, status: existing.status || 'pending' },
    });
  }

  // Try SmileID verification. If Smile is unreachable / not enabled for this product, we DON'T
  // dead-end the user: the ID is stored as pending (manual review) and the user may proceed —
  // Yellow Card independently validates the BVN/NIN on every ramp transaction anyway.
  let jobId = null;
  let smileError = null;
  if (smileId.isSmileConfigured() && process.env.API_BASE_URL) {
    try {
      const callbackUrl = buildCallbackUrl('/webhooks/smile_identity');
      const out = await smileId.submitBasicKycAsync({
        userId: req.user.id, callbackUrl, country: 'NG',
        // Always use the normalized, uppercase docType — NOT the raw client-supplied id_type.
        // The frontend (NigerianIdGate.jsx) sends lowercase 'bvn'/'nin', which is truthy, so the
        // old `id_type || docType.toUpperCase()` fallback never actually fired and Smile ID
        // received a lowercase value on every real request. Smile's API is case-sensitive here —
        // this was silently failing every single BVN/NIN submission in production with
        // "valid id_type is required" (confirmed from audit_logs on live attempts).
        id_type: docType.toUpperCase(), id_number: num,
        first_name: fn, last_name: ln, middle_name,
        dob: dob || prof.date_of_birth, gender: gender || prof.gender, phone_number: phone_number || prof.phone,
      });
      jobId = out.jobId;
    } catch (e) {
      smileError = e.message || 'verification service error';
      logger.error(`[KYC] Ramp ID Smile verification unavailable (falling back to manual review): ${smileError}`);
    }
  } else {
    smileError = 'SmileID not configured';
    logger.warn('[KYC] Ramp ID verification: SmileID not configured — storing for manual review');
  }

  if (jobId) {
    // Tracking row (reuses the existing Smile callback for tier bump + promotes the ID row below).
    await query(
      `INSERT INTO kyc_documents (user_id, document_type, document_number, document_url, selfie_url, status, tier)
       VALUES ($1, 'smile_basic_kyc', $2, $3, null, 'pending', 'tier_1')`,
      [req.user.id, `SMILE:${jobId}`, 'https://jaxopay.com/kyc/smile-id-async']
    );
  }
  // The actual BVN/NIN the ramp gate + Yellow Card sender additionalId read. document_url ties it
  // to the Smile job when one exists, or marks it for manual compliance review when it doesn't.
  await query(
    `INSERT INTO kyc_documents (user_id, document_type, document_number, document_url, selfie_url, status, tier)
     VALUES ($1, $2, $3, $4, null, 'pending', 'tier_1')`,
    [req.user.id, docType, num, jobId ? `SMILE:${jobId}` : 'MANUAL:pending-review']
  );

  logger.info('[KYC] Ramp ID verification submitted', { userId: req.user.id, jobId, docType, fallback: !jobId });
  auditFromReq(req, {
    action: 'kyc_submitted', entityType: 'kyc_document',
    newValues: { method: 'ramp_id_verify', id_type: docType, job_id: jobId, manual_review: !jobId, ...(smileError ? { smile_error: smileError } : {}) },
  });

  res.status(202).json({
    success: true,
    message: jobId
      ? 'Verification submitted. You can transact as soon as it clears (usually under a minute).'
      : 'Your ID has been submitted for review. You will be able to transact once our compliance team approves it.',
    data: { job_id: jobId, id_type: docType },
  });
});

// Tier 2 no longer collects an ID document photo — Smile's Biometric KYC (job_type 1) matches the
// selfie/liveness capture against the government record for the typed id_number/id_type (sent via
// idInfo below), so a photo of the physical card adds nothing the number lookup doesn't already
// cover. Only selfie + liveness frames are required now.
function validateSmileBiometricImages(images) {
  if (!Array.isArray(images) || images.length < 2) {
    return 'images must include a selfie and at least one liveness frame';
  }
  const typeIds = images.map((i) => parseInt(i.image_type_id, 10));
  if (!typeIds.includes(2)) return 'Missing selfie image (image_type_id 2)';
  if (!typeIds.some((t) => t === 6)) return 'Missing liveness images (image_type_id 6)';
  for (const img of images) {
    if (!img?.image || typeof img.image !== 'string' || img.image.length < 50) {
      return 'Each image must include a base64-encoded JPEG payload';
    }
  }
  return null;
}

/**
 * POST /kyc/smile/biometric-kyc/prepare — for the RN native Smile SDK path ONLY.
 *
 * Unlike Smart Camera Web (which captures images in the browser and hands them to us to forward
 * — see submitSmileBiometricKyc below), the RN native SDK submits captured images directly to
 * Smile ID's own servers from the device (SmileIDBiometricKYCView with skipApiSubmission: false).
 * We never see the images and never call Smile's submit API ourselves for this path.
 *
 * What we DO still need: a job_id our webhook handler can recognize when Smile's async verdict
 * arrives (processSmileIdentity in webhook.controller.js matches on document_number =
 * `SMILE:${job_id}`), and a pending kyc_documents row for it to update. v11 native SDKs accept a
 * partner-supplied jobId/userId (unlike the v12 web/mobile line, where both are server-generated),
 * so this mints exactly the same job_id/pending-row shape submitSmileBiometricKyc creates, minus
 * the image submission — the app passes job_id/userId straight into BiometricKYCParams, and the
 * webhook that eventually arrives is indistinguishable from the Smart Camera Web path.
 */
export const prepareSmileBiometricJob = catchAsync(async (req, res) => {
  if (!smileId.isSmileConfigured()) {
    throw new AppError('Identity verification is not available', 503);
  }
  if (!process.env.API_BASE_URL) {
    throw new AppError('Server callback URL is not configured. Please contact support.', 500);
  }

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
  const callbackUrl = buildCallbackUrl('/webhooks/smile_identity');
  const docNumber = `SMILE:${jobId}`;

  await query(
    `INSERT INTO kyc_documents
     (user_id, document_type, document_number, document_url, selfie_url, status, tier)
     VALUES ($1, 'smile_biometric_kyc', $2, $3, null, 'pending', 'tier_2')`,
    [req.user.id, docNumber, 'https://jaxopay.com/kyc/smile-biometric-native']
  );

  await query(`UPDATE users SET kyc_status = 'under_review', updated_at = NOW() WHERE id = $1`, [req.user.id]);

  logger.info('[KYC] Prepared native Smile Biometric KYC job', { userId: req.user.id, jobId });
  auditFromReq(req, { action: 'kyc_submitted', entityType: 'kyc_document', newValues: { method: 'smile_biometric_native', job_id: jobId } });

  res.status(200).json({
    success: true,
    data: { job_id: jobId, user_id: String(req.user.id), callback_url: callbackUrl },
  });
});

/**
 * POST /kyc/smile/biometric-kyc/:jobId/cancel — releases a job prepared via the endpoint above
 * when the native capture errors out or the user backs out before Smile ever received anything.
 * Without this, the pending-row guard in both prepare and submit above would permanently block
 * the user from ever retrying. Only deletes rows still 'pending' (a job that already got a
 * webhook verdict is left alone — cancelling after the fact would misrepresent a real result).
 */
export const cancelSmileBiometricJob = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const result = await query(
    `DELETE FROM kyc_documents
     WHERE user_id = $1 AND document_number = $2 AND status = 'pending'
       AND document_type = 'smile_biometric_kyc'`,
    [req.user.id, `SMILE:${jobId}`]
  );
  if (result.rowCount > 0) {
    await query(
      `UPDATE users SET kyc_status = 'not_started', updated_at = NOW()
       WHERE id = $1 AND kyc_status = 'under_review'
         AND NOT EXISTS (SELECT 1 FROM kyc_documents WHERE user_id = $1 AND status = 'pending')`,
      [req.user.id]
    );
  }
  res.status(200).json({ success: true, data: { cancelled: result.rowCount > 0 } });
});

/** POST /kyc/smile/biometric-kyc — Biometric KYC with liveness (Smart Camera Web, selfie + liveness only — no ID document photo). */
export const submitSmileBiometricKyc = catchAsync(async (req, res) => {
  if (!smileId.isSmileConfigured()) {
    throw new AppError('Identity verification is not available', 503);
  }

  if (!process.env.API_BASE_URL) {
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
  const callbackUrl = buildCallbackUrl('/webhooks/smile_identity');

  const idInfo = {
    first_name: String(first_name).trim(),
    last_name: String(last_name).trim(),
    country: String(country).toUpperCase(),
    id_type: String(id_type).trim(),
    id_number: String(id_number).trim(),
    dob: dob ? String(dob).trim() : '',
    // 'true' = id_number/id_type were typed by the user, not read off an ID photo (we no longer
    // capture one) — tells Smile to verify against the number itself rather than expect to OCR it.
    entered: 'true',
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

  await query(`UPDATE users SET kyc_status = 'under_review', updated_at = NOW() WHERE id = $1`, [req.user.id]);

  logger.info('[KYC] Smile Biometric KYC record created; submitting to provider async', {
    userId: req.user.id,
    jobId,
  });

  kycNotify
    .notifySmileBiometricSubmitted({ userId: req.user.id, jobId })
    .catch((err) => logger.error('[KYC] notifySmileBiometricSubmitted:', err?.message || err));

  auditFromReq(req, { action: 'kyc_submitted', entityType: 'kyc_document', newValues: { method: 'smile_biometric', job_id: jobId } });

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
        // This failure happens inside a setImmediate (no req available) and previously only
        // went to the server log file — the exact same class of failure on the ramp-verification
        // path (submitRampIdVerification) is what made the id_type case-sensitivity bug findable
        // at all, because THAT path records the raw provider error in audit_logs. Doing the same
        // here means a future failure can be diagnosed from the database instead of needing raw
        // server log access.
        recordAudit({
          userId,
          action: 'kyc_submitted',
          entityType: 'kyc_document',
          newValues: { method: 'smile_biometric', job_id: jobId, submit_failed: true, smile_error: msg },
        }).catch(() => {});
        // This is a failure to reach/submit to the PROVIDER (network/API/config issue) — not a
        // verification result — so it must NOT be marked 'rejected' (that means "we checked and
        // it didn't pass," which is misleading and dead-ends the user). Leaving it 'pending'
        // keeps it in the admin's existing KYC review queue for manual approval, exactly like a
        // manually-uploaded document, and the compliance team gets an alert so it doesn't just
        // sit there unnoticed.
        query(
          `UPDATE kyc_documents
           SET rejection_reason = $1,
               updated_at = NOW()
           WHERE user_id = $2 AND document_type = 'smile_biometric_kyc' AND document_number = $3`,
          [
            'Automated verification could not reach the provider — queued for manual review.',
            userId,
            docNumber,
          ]
        )
          .then((upd) => {
            if (upd.rowCount > 0) {
              return kycNotify.notifySmileProviderUnreachable({
                userId,
                jobId,
                documentType: 'smile_biometric_kyc',
                error: msg,
              });
            }
          })
          .catch((dbErr) => logger.error('[KYC] Failed to flag biometric job for manual review:', dbErr.message || dbErr));
      });
  });
});

