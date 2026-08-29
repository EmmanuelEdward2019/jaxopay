import crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';
import { createRequire } from 'module';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

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

/**
 * v3/token (hosted Web SDK) uses a genuinely different credential from everything else in this
 * file — confirmed directly with Smile ID support. SMILE_ID_API_KEY here has, since setup, held
 * the auth_token from smile_config.json (the mobile app's v11-SDK credential); that value works
 * fine as the HMAC-signing secret for the v1/v2 endpoints below (submitBasicKycAsync,
 * submitBiometricKycJob) — Smile's v1/v2 signature check doesn't care which credential produced a
 * valid signature — but v3/token authenticates via plain headers instead of a signature, and
 * rejects that value outright with "Invalid authentication credentials". SMILE_ID_API_KEY_V3 is
 * the real server-side API Key from the partner portal (distinct from the mobile SDK download).
 * Falls back to the regular key so isSmileConfigured() etc. don't regress for anyone who hasn't
 * set it yet — that fallback is known-wrong for v3 specifically, not a safe default, but matches
 * this file's existing "never throw from a missing-config check" convention.
 */
export function getSmileV3Credentials() {
  const apiKey =
    process.env.SMILE_ID_API_KEY_V3 ||
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
 * Verify a webhook delivery from Smile ID.
 *
 * Current documented contract (docs.usesmileid.com/developer-resources/essentials/
 * verification-webhooks/receive-webhooks/configure-your-webhook-server): the signature and
 * timestamp are delivered in the `Response-Signature` / `Response-Timestamp` HTTP headers, not
 * body fields. HMAC-SHA256 over `timestamp + partner_id + 'sid_request'`, keyed by the API key,
 * base64-encoded — the same formula smile-identity-core's own Signature class uses for outbound
 * request signing (confirmed identical), just applied to an inbound delivery instead.
 *
 * Falls back to `Signature`/`Timestamp` body fields (the older convention this function used to
 * check exclusively) if the headers aren't present, in case any delivery path still uses it —
 * costs nothing and avoids a second silent-failure mode while this is still settling in.
 */
export function verifySmileCallbackSignature(body, headers = {}) {
  const { apiKey, partnerId } = getSmileCredentials();
  if (!apiKey || !partnerId) return false;

  const h = headers || {};
  let b = body;
  if (
    !(body?.Signature || body?.signature) &&
    (body?.Information || body?.information)
  ) {
    b = body.Information || body.information;
  }

  const receivedSig = h['response-signature'] || b?.Signature || b?.signature;
  const receivedTs = h['response-timestamp'] || b?.Timestamp || b?.timestamp;
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
    throw new AppError('Identity verification is not configured on the server', 503);
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
    // AppError (not a plain Error) so the real upstream reason reaches the client — a plain Error
    // here loses both .isOperational and the original .response, so errorHandler's upstream-error
    // normalization can never match it and it falls through to a generic "Something went wrong"
    // 500, silently swallowing exactly the detail (bad credentials, malformed request, whatever
    // Smile actually said) needed to diagnose a failure like this.
    throw new AppError(err.response?.data?.message || err.response?.data?.error || err.message || 'Verification request failed', 502);
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

/**
 * Mint a short-lived v3 auth token (POST /v3/token) for the hosted Web SDK — the browser must
 * never see the long-lived API key, so this always happens server-side. Confirmed contract
 * (docs.usesmileid.com/api-reference/set-up/access): auth via smileid-partner-id/smileid-api-key
 * HEADERS (not signed like the v1/v2 flows above), body is multipart/form-data — a JSON body is
 * rejected with 415. Tokens expire 15 minutes after issuance; mint one per verification session.
 * Uses the 'form-data' package (axios's own dependency for this) rather than the global/undici
 * FormData — passing the native FormData into axios's Node adapter produced a request that
 * failed the moment it was actually exercised end-to-end (surfaced as a 502 with no CORS headers,
 * since the origin process choked mid-request rather than returning a normal JSON error).
 * @param {object} opts
 * @param {string} opts.userId - bound into the token so it round-trips to the webhook.
 * @param {string} [opts.product] - e.g. 'biometric_kyc'. Optional per the API, but scopes the token.
 */
export async function mintV3Token({ userId, product }) {
  const { apiKey, partnerId } = getSmileV3Credentials();
  if (!apiKey || !partnerId) {
    throw new AppError('Identity verification is not configured on the server', 503);
  }

  const form = new FormData();
  if (userId != null) form.append('user_id', String(userId));
  if (product) form.append('product', product);
  // Echoed back on the webhook per docs — our own correlation id, since v3 job_id/user_id are
  // server-generated and we no longer choose them ourselves for this flow.
  form.append('partner_params', JSON.stringify({ internal_user_id: String(userId) }));

  const base = getSmileApiBase(); // https://api.smileidentity.com or https://testapi.smileidentity.com — no /v1 suffix
  const url = `${base}/v3/token`;

  try {
    const res = await axios.post(url, form, {
      headers: {
        'smileid-partner-id': partnerId,
        'smileid-api-key': apiKey,
      },
      timeout: 12000,
      // Belt-and-suspenders alongside `timeout` above: axios's own timeout is implemented as a
      // socket-idle timer, which has known gaps for a streamed multipart body (the request can
      // sit past its nominal timeout without ever firing). AbortSignal.timeout() is a platform
      // primitive independent of axios's internal timer, so it fires reliably regardless. Without
      // a HARD bound here, a hang on this call means OUR process never responds at all — Cloudflare
      // (or Render's own edge) eventually returns its own 502 with none of our app's CORS headers,
      // which the browser reports as a CORS policy violation instead of what actually happened.
      signal: AbortSignal.timeout(12000),
    });
    if (!res.data?.token) throw new AppError('Smile ID did not return a token', 502);
    return { token: res.data.token, environment: base.includes('testapi') ? 'sandbox' : 'production' };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const isTimeout = err.code === 'ECONNABORTED' || err.name === 'AbortError' || err.name === 'TimeoutError' || err.code === 'ERR_CANCELED';
    const msg = err.response?.data || err.message;
    logger.error(`[SmileID] v3/token failed${isTimeout ? ' (timed out)' : ''}:`, typeof msg === 'object' ? JSON.stringify(msg) : msg);
    if (isTimeout) {
      throw new AppError('Verification service is taking too long to respond. Please try again.', 504);
    }
    // See the note on the same pattern above in submitBasicKycAsync — AppError, not a plain
    // Error, so the real reason (e.g. an actual 401 from Smile over bad credentials, a 415/400
    // over a malformed multipart body, a network failure) reaches the client instead of a
    // generic 500 that looks identical no matter what actually went wrong.
    throw new AppError(err.response?.data?.message || err.response?.data?.error || err.message || 'Could not start verification session', 502);
  }
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
    throw new AppError('Identity verification is not configured on the server', 503);
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

/**
 * Polls Smile ID directly for a job's current result — the fallback for when their webhook
 * callback never arrives (confirmed possible in production: a job showed approved on Smile's own
 * dashboard while our copy sat 'pending' with no callback ever received). Same v1/v2 credentials
 * submitBiometricKycJob/submitBasicKycAsync already use — the /job_status endpoint isn't scoped
 * by job_type, so one query shape covers both job families. See sweepPendingSmileJobs in
 * webhook.controller.js, which uses this to reconcile every stuck 'pending' row on an interval —
 * the same pattern this codebase already uses for Yellow Card ramps, Obiex transfers/withdrawals,
 * and Glyde deposits (server.js's *_SWEEP_MS intervals).
 */
export async function queryJobStatus({ userId, jobId }) {
  const { apiKey, partnerId } = getSmileCredentials();
  if (!apiKey || !partnerId) {
    throw new AppError('Identity verification is not configured on the server', 503);
  }
  const connection = new WebApi(String(partnerId), null, apiKey, getSmileSidServerFlag());
  return connection.get_job_status(
    { user_id: String(userId), job_id: jobId },
    { return_history: false, return_images: false }
  );
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
