import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { AppError, catchAsync } from './errorHandler.js';
import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import cache, { CacheNamespaces, CacheTTL } from '../utils/cache.js';

// Verify JWT token - OPTIMIZED with caching and combined queries
export const verifyToken = catchAsync(async (req, res, next) => {
  // Get token from header
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new AppError('You are not logged in. Please log in to access this resource.', 401);
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Your session has expired. Please log in again.', 401);
    }
    throw new AppError('Invalid token. Please log in again.', 401);
  }

  // Check cache for user data first (reduces DB load)
  const cacheKey = `${decoded.userId}:${token}`;
  const cachedAuth = cache.get(CacheNamespaces.USER_SESSIONS, cacheKey);

  if (cachedAuth) {
    // Update last activity in background (don't wait)
    query(
      'UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1',
      [cachedAuth.sessionId]
    ).catch(() => {}); // Silent fail for background update

    req.user = cachedAuth.user;
    req.sessionId = cachedAuth.sessionId;
    return next();
  }

  // Single optimized query combining user + session lookup (reduces round-trips)
  // Use fast timeout — auth checks on indexed columns should be sub-second
  const result = await query(
    `SELECT
      u.id, u.email, u.role, u.kyc_tier, u.is_active, u.two_fa_enabled,
      s.id as session_id, s.is_active as session_active, s.expires_at
     FROM users u
     LEFT JOIN user_sessions s ON s.user_id = u.id AND s.session_token = $2
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [decoded.userId, token],
    { timeout: 8000, retries: 1 }
  );

  if (result.rows.length === 0) {
    throw new AppError('The user belonging to this token no longer exists.', 401);
  }

  const row = result.rows[0];

  // Check if user is active
  if (!row.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  // Check session validity
  if (!row.session_id || !row.session_active) {
    throw new AppError('Your session has expired. Please log in again.', 401);
  }

  if (new Date(row.expires_at) < new Date()) {
    throw new AppError('Your session has expired. Please log in again.', 401);
  }

  const user = {
    id: row.id,
    email: row.email,
    role: row.role,
    kyc_tier: row.kyc_tier,
    is_active: row.is_active,
    two_fa_enabled: row.two_fa_enabled,
  };

  // Cache the auth data for 30 seconds (reduces DB load for repeated requests)
  cache.set(CacheNamespaces.USER_SESSIONS, cacheKey, {
    user,
    sessionId: row.session_id,
  }, CacheTTL.SHORT);

  // Update last activity in background
  query(
    'UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1',
    [row.session_id]
  ).catch(() => {});

  // Grant access to protected route
  req.user = user;
  req.sessionId = row.session_id;
  next();
});

// Restrict to specific roles
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError('You do not have permission to perform this action.', 403);
    }
    next();
  };
};

// Check KYC tier
export const requireKYCTier = (minTier) => {
  const tierLevels = {
    tier_0: 0,
    tier_1: 1,
    tier_2: 2,
  };

  return (req, res, next) => {
    const userTierLevel = tierLevels[req.user.kyc_tier] || 0;
    const requiredTierLevel = tierLevels[minTier] || 0;

    if (userTierLevel < requiredTierLevel) {
      throw new AppError(
        `This action requires ${minTier} verification. Please complete your KYC.`,
        403
      );
    }
    next();
  };
};

// Verify 2FA if enabled
export const verify2FA = catchAsync(async (req, res, next) => {
  if (!req.user.two_fa_enabled) {
    return next();
  }

  const twoFAToken = req.headers['x-2fa-token'];

  if (!twoFAToken) {
    throw new AppError('2FA token required for this action.', 403);
  }

  // Verify 2FA token (implementation depends on 2FA method)
  // This is a placeholder - actual implementation in auth controller
  const isValid = await verify2FAToken(req.user.id, twoFAToken);

  if (!isValid) {
    throw new AppError('Invalid 2FA token.', 403);
  }

  next();
});

// Device fingerprinting
export const captureDeviceFingerprint = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';

  // Get fingerprint from header or generate a fallback
  let deviceFingerprint = req.headers['x-device-fingerprint'];

  if (!deviceFingerprint) {
    // Generate a consistent fingerprint based on IP and User Agent if header is missing
    const raw = `${ipAddress}-${userAgent}`;
    deviceFingerprint = Buffer.from(raw).toString('base64').substring(0, 32);
  }

  req.deviceInfo = {
    fingerprint: deviceFingerprint,
    userAgent,
    ipAddress,
  };

  next();
};

// Helper function to verify 2FA token using speakeasy TOTP
const verify2FAToken = async (userId, token) => {
  try {
    // Check cache for 2FA secret first
    const cacheKey = `2fa:${userId}`;
    let secret = cache.get(CacheNamespaces.USER_PROFILES, cacheKey);

    if (!secret) {
      // Get user's 2FA secret from database
      const result = await query(
        'SELECT two_fa_secret FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].two_fa_secret) {
        logger.warn(`[2FA] No 2FA secret found for user ${userId}`);
        return false;
      }

      secret = result.rows[0].two_fa_secret;
      // Cache the secret for 5 minutes
      cache.set(CacheNamespaces.USER_PROFILES, cacheKey, secret, CacheTTL.LONG);
    }

    // Verify TOTP token using speakeasy
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2, // Allow 1 minute before/after for time drift
    });

    if (verified) {
      logger.info(`[2FA] Token verified successfully for user ${userId}`);
    } else {
      logger.warn(`[2FA] Invalid token provided for user ${userId}`);
    }

    return verified;
  } catch (error) {
    logger.error(`[2FA] Error verifying token for user ${userId}:`, error.message);
    return false;
  }
};

// Clear user cache (call this when user data changes, e.g., role/tier updates)
export const clearUserCache = (userId) => {
  // Clear all user session cache entries
  cache.clearNamespace(CacheNamespaces.USER_SESSIONS);
  cache.delete(CacheNamespaces.USER_PROFILES, `2fa:${userId}`);
  logger.debug(`[Auth] Cleared cache for user ${userId}`);
};

// Optional authentication (doesn't throw error if no token)
export const optionalAuth = catchAsync(async (req, res, next) => {
  try {
    await verifyToken(req, res, next);
  } catch (error) {
    // Continue without authentication
    next();
  }
});

export default {
  verifyToken,
  restrictTo,
  requireKYCTier,
  verify2FA,
  captureDeviceFingerprint,
  optionalAuth,
  clearUserCache,
};

