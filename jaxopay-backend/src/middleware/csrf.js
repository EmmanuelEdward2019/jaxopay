import crypto from 'crypto';
import { AppError } from './errorHandler.js';
import logger from '../utils/logger.js';

/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks on state-changing operations
 * 
 * Uses Double Submit Cookie pattern:
 * 1. Server generates CSRF token and sends in cookie + response
 * 2. Client must include token in header for state-changing requests
 * 3. Server verifies token matches cookie
 */

const CSRF_COOKIE_NAME = 'jaxopay_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a cryptographically secure CSRF token
 */
function generateToken() {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Middleware to generate and attach CSRF token
 * Use on routes that render forms or return initial state
 */
export const generateCsrfToken = (req, res, next) => {
  // Skip in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // Check if token already exists in cookie
  let token = req.cookies?.[CSRF_COOKIE_NAME];

  // Generate new token if none exists
  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
    });
  }

  // Attach token to response for client to include in headers
  res.locals.csrfToken = token;

  next();
};

/**
 * Middleware to verify CSRF token on state-changing requests
 * Use on POST, PUT, PATCH, DELETE routes that modify data
 */
export const verifyCsrfToken = (req, res, next) => {
  // Skip in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // Skip for safe methods (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for webhook endpoints (they use signature verification)
  if (req.path.includes('/webhooks/')) {
    return next();
  }

  // Get token from cookie
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  // Get token from header
  const headerToken = req.get(CSRF_HEADER_NAME);

  // Verify both tokens exist
  if (!cookieToken || !headerToken) {
    logger.warn('[CSRF] Missing CSRF token', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
    });

    throw new AppError(
      'CSRF token missing. Please refresh the page and try again.',
      403
    );
  }

  // Verify tokens match (constant-time comparison to prevent timing attacks)
  const tokensMatch = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken)
  );

  if (!tokensMatch) {
    logger.warn('[CSRF] CSRF token mismatch', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    throw new AppError(
      'Invalid CSRF token. Please refresh the page and try again.',
      403
    );
  }

  // Token is valid, proceed
  next();
};

/**
 * Optional: Middleware to skip CSRF for specific routes
 * Use sparingly and only for routes with other protection (e.g., API key auth)
 */
export const skipCsrf = (req, res, next) => {
  req.skipCsrf = true;
  next();
};

/**
 * Enhanced verify that respects skip flag
 */
export const verifyCsrfTokenConditional = (req, res, next) => {
  if (req.skipCsrf) {
    return next();
  }
  return verifyCsrfToken(req, res, next);
};

export default {
  generateCsrfToken,
  verifyCsrfToken,
  verifyCsrfTokenConditional,
  skipCsrf,
};

