import jwt from 'jsonwebtoken';
import { AppError, catchAsync } from './errorHandler.js';
import { query } from '../config/database.js';
import logger from '../utils/logger.js';

// Verify JWT token
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

  // Check if user still exists
  const result = await query(
    'SELECT id, email, role, kyc_tier, is_active, two_fa_enabled FROM users WHERE id = $1 AND deleted_at IS NULL',
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('The user belonging to this token no longer exists.', 401);
  }

  const user = result.rows[0];

  // Check if user is active
  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  // Check if session is still valid
  const sessionResult = await query(
    'SELECT id, is_active, expires_at FROM user_sessions WHERE session_token = $1 AND user_id = $2',
    [token, user.id]
  );

  if (sessionResult.rows.length === 0 || !sessionResult.rows[0].is_active) {
    throw new AppError('Your session has expired. Please log in again.', 401);
  }

  if (new Date(sessionResult.rows[0].expires_at) < new Date()) {
    throw new AppError('Your session has expired. Please log in again.', 401);
  }

  // Update last activity
  await query(
    'UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1',
    [sessionResult.rows[0].id]
  );

  // Grant access to protected route
  req.user = user;
  req.sessionId = sessionResult.rows[0].id;
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

// Helper function to verify 2FA token
const verify2FAToken = async (userId, token) => {
  // This will be implemented in the auth service
  // For now, return true as placeholder
  return true;
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
};

