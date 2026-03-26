import crypto from 'crypto';
import axios from 'axios';
import { createRequire } from 'module';
import logger from '../utils/logger.js';

const require = createRequire(import.meta.url);
const { WebApi, JOB_TYPE } = require('smile-identity-core');

/**
 * Smile Identity (Smile ID) — server-side signing and Basic KYC submission.
 * Docs: https://docs.usesmileid.com/
 *
 * Env (any alias works):
 *   SMILE_ID_API_KEY or SMILE_IDENTITY_API_KEY or SMILE_ID_AUTH_TOKEN — secret used for HMAC signatures
 *   SMILE_ID_PARTNER_ID or SMILE_IDENTITY_PARTNER_ID
 *   SMILE_ID_SANDBOX=true — use testapi.smileidentity.com
 *   SMILE_ID_API_BASE_URL — optional override (no trailing /v1), default api.smileidentity.com or testapi
 */
export function getSmileCredentials() {
  const apiKey =
    process.env.SMILE_ID_API_KEY ||
    process.env.SMILE_IDENTITY_API_KEY ||
    process.env.SMILE_ID_AUTH_TOKEN;
  const partnerId = process.env.SMILE_ID_PARTNER_ID || process.env.SMILE_IDENTITY_PARTNER_ID;
  const key =
    apiKey != null ? String(apiKey).trim().replace(/^["']|["']$/g, '') : null;
  return {
    apiKey: key,
    partnerId: partnerId != null ? String(partnerId).trim() : null,
  };
}

export function isSmileConfigured() {
  const { apiKey, partnerId } = getSmileCredentials();
  return !!(apiKey && partnerId);
}

/**
 * @returns {{ signature: string, timestamp: string }}
 */
export function signSmileRequest(apiKey, partnerId) {
  const timestamp = new Date().toISOString();
  const hmac = crypto.createHmac('sha256', apiKey);
  hmac.update(timestamp, 'utf8');
  hmac.update(String(partnerId), 'utf8');
  hmac.update('sid_request', 'utf8');
  const signature = hmac.digest('base64');
  return { signature, timestamp };
}

/**
 * Verify callback / sync response from Smile ID
 */
export function verifySmileCallbackSignature(body) {
  const { apiKey, partnerId } = getSmileCredentials();
  if (!apiKey || !partnerId) return false;

  let b = body;
  if (
    !(body.Signature || body.signature) &&
    (body.Information || body.information)
  ) {
    b = body.Information || body.information;
  }

  const receivedSig = b.Signature || b.signature;
  const receivedTs = b.Timestamp || b.timestamp;
  if (!receivedSig || !receivedTs) return false;

  const hmac = crypto.createHmac('sha256', apiKey);
  hmac.update(String(receivedTs), 'utf8');
  hmac.update(String(partnerId), 'utf8');
  hmac.update('sid_request', 'utf8');
  const expected = hmac.digest('base64');
  const sigBuf = Buffer.from(receivedSig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function getSmileApiBase() {
  const custom = (process.env.SMILE_ID_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (custom) return custom;
  const sandbox =
    (process.env.SMILE_ID_SANDBOX || process.env.SMILE_IDENTITY_SANDBOX || 'false').toLowerCase() === 'true';
  return sandbox ? 'https://testapi.smileidentity.com' : 'https://api.smileidentity.com';
}

/**
 * Submit Basic KYC (async). job_type 5 = Basic KYC per Smile docs.
 * @param {object} opts
 * @param {string} opts.callbackUrl - Full URL to POST /webhooks/smile_identity
 */
export async function submitBasicKycAsync({
  userId,
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
}) {
  const { apiKey, partnerId } = getSmileCredentials();
  if (!apiKey || !partnerId) {
    throw new Error('Identity verification is not configured on the server');
  }

  const jobId = crypto.randomUUID();
  const { signature, timestamp } = signSmileRequest(apiKey, partnerId);

  const payload = {
    callback_url: callbackUrl,
    country: String(country).toUpperCase(),
    id_type,
    id_number: String(id_number),
    first_name,
    last_name,
    middle_name: middle_name || '',
    dob: dob || '',
    gender: gender || '',
    phone_number: phone_number || '',
    partner_id: partnerId,
    partner_params: {
      job_id: jobId,
      user_id: String(userId),
      job_type: 5,
    },
    signature,
    source_sdk: 'rest_api',
    source_sdk_version: 'jaxopay-backend-1.0',
    timestamp,
  };

  const base = getSmileApiBase();
  const url = `${base}/v2/verify_async`;

  logger.info(`[SmileID] POST ${url} job_id=${jobId} user=${userId}`);

  try {
    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    return {
      smileResponse: res.data,
      jobId,
      partnerId,
    };
  } catch (err) {
    const msg = err.response?.data || err.message;
    logger.error('[SmileID] verify_async failed:', typeof msg === 'object' ? JSON.stringify(msg) : msg);
    throw new Error(err.response?.data?.message || err.response?.data?.error || err.message || 'Verification request failed');
  }
}

/**
 * Mobile SDK helper: fresh signature + timestamp (do not expose API key to client).
 * RN app still needs smile_config.json from Smile portal for the SDK; this assists server-orchestrated flows.
 */
export function getMobileAuthPackage() {
  const { apiKey, partnerId } = getSmileCredentials();
  if (!apiKey || !partnerId) return null;
  const { signature, timestamp } = signSmileRequest(apiKey, partnerId);
  // Do not return partner_id over the wire — mobile apps use the partner id from Smile-issued smile_config / build config.
  return {
    timestamp,
    signature,
    environment: getSmileApiBase().includes('testapi') ? 'sandbox' : 'production',
  };
}

/** Smile Identity Core uses 0 = sandbox, 1 = production (not the same as API host string). */
export function getSmileSidServerFlag() {
  const sandbox =
    (process.env.SMILE_ID_SANDBOX || process.env.SMILE_IDENTITY_SANDBOX || 'false').toLowerCase() === 'true';
  return sandbox ? '0' : '1';
}

/**
 * Biometric KYC (job type 1) — selfie + liveness frames + optional ID document images.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.jobId - unique per job (e.g. UUID)
 * @param {string} opts.callbackUrl - HTTPS webhook URL
 * @param {Array<{ image_type_id: number, image: string }>} opts.images
 * @param {object} opts.idInfo - Smile id_info (use entered: 'false' when ID images are supplied)
 */
export async function submitBiometricKycJob({ userId, jobId, callbackUrl, images, idInfo }) {
  const { apiKey, partnerId } = getSmileCredentials();
  if (!apiKey || !partnerId) {
    throw new Error('Identity verification is not configured on the server');
  }

  const connection = new WebApi(String(partnerId), callbackUrl, apiKey, getSmileSidServerFlag());

  const partner_params = {
    user_id: String(userId),
    job_id: jobId,
    job_type: JOB_TYPE.BIOMETRIC_KYC,
  };

  const options = {
    return_job_status: false,
    return_history: false,
    return_images: false,
    use_enrolled_image: false,
    optional_callback: callbackUrl,
  };

  logger.info(`[SmileID] Biometric KYC submit job_id=${jobId} user=${userId} images=${images?.length || 0}`);

  return connection.submit_job(partner_params, images, idInfo, options);
}

/** Result codes Smile marks as approved / passed for tier decisions (Biometric + Basic KYC). */
export const SMILE_APPROVED_RESULT_CODES = new Set([
  '0810',
  '0817',
  '0820',
  '0840',
  '1012',
  '1020',
  '1021',
  '1210',
  '1220',
  '1240',
]);

/** Do not reject the user while Smile is still reviewing */
export const SMILE_PROVISIONAL_RESULT_CODES = new Set([
  '0812',
  '0814',
  '0815',
  '0822',
  '0824',
  '0825',
  '1213',
]);
