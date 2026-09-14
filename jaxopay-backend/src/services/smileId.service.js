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
  // Smile signs a callback with "the API key that was used to generate the token for the original
  // verification request" — and this platform uses TWO different keys depending on the flow:
  //   * RN native SDK (v11) authenticates from smile_config.json's auth_token  -> SMILE_ID_API_KEY
  //   * Web hosted SDK / server-side v3 mint their token from                  -> SMILE_ID_API_KEY_V3
  // Verifying against only the v1 key would therefore reject every callback for a v3-submitted
  // job. Smile retries a rejected delivery 3 times and then drops the verdict permanently, so a
  // wrong key here loses the result outright rather than merely delaying it. Try both.
  const { partnerId } = getSmileCredentials();
  const candidateKeys = [
    getSmileV3Credentials().apiKey,
    getSmileCredentials().apiKey,
  ].filter((k, i, a) => k && a.indexOf(k) === i);
  if (candidateKeys.length === 0 || !partnerId) return false;

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

  const sigBuf = Buffer.from(String(receivedSig));
  for (const key of candidateKeys) {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(String(receivedTs), 'utf8');
    hmac.update(String(partnerId), 'utf8');
    hmac.update('sid_request', 'utf8');
    const expBuf = Buffer.from(hmac.digest('base64'));
    // Length check first: timingSafeEqual throws on a length mismatch rather than returning false.
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) return true;
  }
  return false;
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
/**
 * Basic/Enhanced KYC submission. Now a thin wrapper over the V3 API (submitEnhancedKycV3).
 *
 * Was `POST /v2/verify_async` signed with SMILE_ID_API_KEY. That key is the mobile SDK's
 * auth_token, not a server API key, and this account rejected every call with
 * `{"code":"2205","error":"You are not authorized to do that."}` — verified both in production
 * logs and by reproducing it live. Nothing was ever queued at Smile, so no verdict webhook could
 * ever be sent and every submission sat "pending" indefinitely.
 *
 * Returns `typeId` (Smile's own TypeID from the 202) alongside our partner `jobId`, so callers can
 * persist it and later poll GET /v3/status/{typeId} without depending on a webhook arriving.
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
  email,
}) {
  const { partnerId } = getSmileV3Credentials();
  const jobId = crypto.randomUUID();

  const { typeId, status, raw } = await submitEnhancedKycV3({
    userId,
    jobId,
    callbackUrl,
    country,
    idType: id_type,
    idNumber: id_number,
    // V3 takes given_names (which may include a middle name) rather than separate fields.
    givenNames: [first_name, middle_name].filter(Boolean).join(' ').trim() || first_name,
    lastName: last_name,
    email,
    phoneNumber: phone_number,
  });

  // dob/gender have no place in the V3 enhanced_kyc schema — the ID authority lookup is keyed on
  // country/id_type/id_number plus the name. Accepted here so existing callers are unchanged.
  return { smileResponse: raw, jobId, typeId, status, partnerId };
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
 * The v1 `/job_status` REST poll (smile-identity-core's WebApi.get_job_status, HMAC-signed with
 * the v1/v2 credentials) reliably returns "You are not authorized to do that" (error 2205) for
 * this account, including against jobs that had already resolved successfully via webhook —
 * confirmed not job-specific. Per Smile's own troubleshooting docs, 2205 covers a signature
 * computed for the wrong environment/endpoint, which fits: this account's callback URL is
 * registered against the V3 product family (see replayVerificationCallback below), and v1
 * `/job_status` may no longer be reachable for accounts configured that way. Left unused
 * rather than deleted as a documented dead end — do not wire this back in without a confirmed
 * working call first (queried from the production server itself; this account's IP allowlisting
 * makes the result of testing this from any other machine unreliable).
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

/**
 * Asks Smile ID to resend the webhook callback for a job that already reached a terminal state
 * (docs.usesmileid.com/api-reference/core-resources/replay-webhook/replay-a-verification-webhook)
 * — the documented fix for exactly our situation: a verification completed on Smile's side but
 * our copy never received (or never correctly processed) the original callback. On success Smile
 * re-POSTs the same webhook shape to our registered callback URL, which the (now-corrected)
 * processSmileIdentity handles identically to a first-time delivery — no separate result-parsing
 * path needed here.
 *
 * `typeId` MUST be Smile's own canonical job identifier (TypeID format: `job_` + 26 base32
 * chars) — NOT the UUID we choose ourselves at submission time for v1/v2 jobs. That id is only
 * learned once we've received at least one webhook for the job (captured into
 * kyc_documents.smile_type_id — see captureSmileTypeId in webhook.controller.js), so a job with
 * no smile_type_id on file yet cannot be replayed by this call.
 *
 * Auth is a `SmileID-Token` JWT from POST /v3/token (mintV3Token above) — a completely different
 * scheme from the v1/v2 HMAC signing used elsewhere in this file, per Smile's V3 API family.
 * Returns Smile's parsed JSON response; throws AppError with Smile's own message on failure
 * (400/401/403/404/409/415 — see the endpoint's documented error cases) so a caller can log
 * exactly why a given job couldn't be replayed instead of a generic failure.
 */
export async function replayVerificationCallback({ typeId }) {
  if (!/^job_[0-9a-z]{26}$/.test(String(typeId || ''))) {
    throw new AppError(`Not a valid Smile ID job TypeID: ${typeId}`, 400);
  }
  const { token } = await mintV3Token({});
  const base = getSmileApiBase();
  try {
    const res = await axios.post(`${base}/v3/replay/${typeId}`, undefined, {
      headers: v3Headers(token),
      timeout: 15000,
      signal: AbortSignal.timeout(15000),
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    // 409 = not yet terminal on Smile's side — normal/expected on a sweep tick, not a real error.
    if (status === 409) {
      throw Object.assign(new AppError(msg || 'Verification is still processing', 409), { isReplayPending: true });
    }
    throw new AppError(msg || 'Could not replay verification callback', status || 502);
  }
}

/** Result codes Smile marks as approved / passed for tier decisions (Biometric + Basic KYC). */
/**
 * Standard headers for every V3 product call. Both are required: the live probe that proved this
 * account is v3-capable (GET /v3/status/... returning a clean not_found rather than 401) only
 * succeeded with the partner id alongside the token. No HMAC headers are needed — this account is
 * not configured for SDK/partner-secret authentication.
 */
function v3Headers(token, partnerId) {
  const pid = partnerId || getSmileV3Credentials().partnerId;
  return { 'SmileID-Token': token, 'SmileID-Partner-ID': String(pid) };
}

// Consent is mandatory on every V3 submission. The user performing the KYC form submission IS the
// consent act; we record when, in which language the notice was shown, and where that notice lives.
const SMILE_PRIVACY_POLICY_URL = process.env.SMILE_CONSENT_PRIVACY_URL || 'https://jaxopay.com/privacy';

function buildConsent() {
  return {
    granted: true,
    granted_at: new Date().toISOString(),
    notice_language: 'EN',
    notice_privacy_policy_url: SMILE_PRIVACY_POLICY_URL,
  };
}

/**
 * Smile requires E.164 (^\+[1-9]\d{6,14}$). Nigerian numbers are commonly stored as 0803...,
 * which fails that outright — returns null rather than a malformed value, so the caller falls back
 * to email (the schema needs email OR phone, not both).
 */
function toE164(raw, country = 'NG') {
  const v = String(raw || '').replace(/[\s()-]/g, '');
  if (!v) return null;
  if (/^\+[1-9]\d{6,14}$/.test(v)) return v;
  if (String(country).toUpperCase() === 'NG') {
    const digits = v.replace(/^\+?234/, '').replace(/^0/, '');
    if (/^\d{10}$/.test(digits)) return `+234${digits}`;
  }
  return null;
}

/**
 * Enhanced KYC via the V3 REST API — POST /v3/enhanced_kyc.
 *
 * Replaces submitBasicKycAsync's V2 `/v2/verify_async` call, which this account rejects outright:
 * every submission returned `{"code":"2205","error":"You are not authorized to do that."}` because
 * SMILE_ID_API_KEY holds the mobile SDK's auth_token, not a server API key. Because nothing was
 * ever accepted, Smile never had a job to run and no callback could ever be sent — which is the
 * whole reason verifications sat "pending" forever.
 *
 * Crucially, the 202 response carries Smile's own TypeID as `job_id`. Storing that is what makes
 * GET /v3/status/{id} polling and POST /v3/replay/{id} possible at all; previously the TypeID was
 * only learnable from a webhook, so a job whose webhook never arrived could never be resolved.
 *
 * @returns {Promise<{ typeId: string|null, status: string|null, raw: object }>}
 */
export async function submitEnhancedKycV3({
  userId, jobId, callbackUrl, country, idType, idNumber,
  givenNames, lastName, email, phoneNumber,
}) {
  // Caller input is validated BEFORE server configuration: a request missing the contact details
  // V3 requires is a 400 whatever the server's credential state, and reporting it as
  // "not configured on the server" (which is what checking credentials first produced) sends
  // whoever is debugging it looking in entirely the wrong place.
  const phone = toE164(phoneNumber, country);
  const userDetails = { given_names: String(givenNames || '').trim(), last_name: String(lastName || '').trim() };
  if (email) userDetails.email = String(email).trim();
  if (phone) userDetails.phone_number = phone;
  if (!userDetails.email && !userDetails.phone_number) {
    throw new AppError('An email address or phone number is required for identity verification.', 400);
  }

  const { apiKey, partnerId } = getSmileV3Credentials();
  if (!apiKey || !partnerId) {
    throw new AppError('Identity verification is not configured on the server', 503);
  }

  const { token } = await mintV3Token({ userId, product: 'enhanced_kyc' });

  const form = new FormData();
  form.append('country', String(country || 'NG').toUpperCase());
  form.append('id_type', String(idType || '').toUpperCase());
  form.append('id_number', String(idNumber || '').trim());
  // Nested objects travel as JSON strings in the multipart body — the same convention mintV3Token
  // already uses for partner_params and which Smile accepts there.
  form.append('user_details', JSON.stringify(userDetails));
  form.append('consent', JSON.stringify(buildConsent()));
  if (callbackUrl) form.append('callback_url', callbackUrl);
  // job_id/user_id round-trip to the webhook, so processSmileIdentity can still match our own
  // pending row by `SMILE:${job_id}` exactly as it does for every other path.
  form.append('partner_params', JSON.stringify({ job_id: jobId, user_id: String(userId), internal_user_id: String(userId) }));

  const base = getSmileApiBase();
  const url = `${base}/v3/enhanced_kyc`;
  logger.info(`[SmileID] POST ${url} job_id=${jobId} user=${userId} id_type=${String(idType).toUpperCase()}`);

  try {
    const res = await axios.post(url, form, {
      headers: { ...form.getHeaders(), ...v3Headers(token, partnerId) },
      timeout: 30000,
      signal: AbortSignal.timeout(30000),
    });
    const typeId = res.data?.job_id || null;
    logger.info(`[SmileID] enhanced_kyc accepted job_id=${jobId} type_id=${typeId} status=${res.data?.status}`);
    return { typeId, status: res.data?.status || null, raw: res.data };
  } catch (err) {
    const msg = err.response?.data || err.message;
    logger.error(`[SmileID] enhanced_kyc failed: ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`);
    throw new AppError(
      err.response?.data?.message || err.response?.data?.error || err.message || 'Verification request failed',
      err.response?.status || 502
    );
  }
}

/**
 * GET /v3/status/{typeId} — the authoritative state of a verification, without needing a webhook.
 *
 * Terminal states (clear/block/attention/error) return 200, `processing` returns 202, and an
 * unknown job returns 404 with status `not_found` rather than an error body — so this never throws
 * for an ordinary "not ready yet" or "never existed", it just reports it. Only the TypeID is
 * accepted here; our own partner job_id is not a valid path parameter.
 */
export async function getVerificationStatusV3(typeId) {
  if (!/^job_[0-9a-z]{26}$/.test(String(typeId || ''))) {
    throw new AppError(`Not a valid Smile ID job TypeID: ${typeId}`, 400);
  }
  const { partnerId } = getSmileV3Credentials();
  const { token } = await mintV3Token({});
  const base = getSmileApiBase();
  const res = await axios.get(`${base}/v3/status/${typeId}`, {
    headers: v3Headers(token, partnerId),
    timeout: 15000,
    signal: AbortSignal.timeout(15000),
    // 202 and 404 are meaningful states here, not transport failures.
    validateStatus: () => true,
  });
  const status = String(res.data?.status || '').toLowerCase();
  return {
    httpStatus: res.status,
    status,
    message: res.data?.message || '',
    isTerminal: ['clear', 'block', 'attention', 'error'].includes(status),
    isProcessing: status === 'processing',
    isNotFound: status === 'not_found' || res.status === 404,
    raw: res.data,
  };
}

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
