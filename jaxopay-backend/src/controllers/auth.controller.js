import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query, transaction } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';
import { sendEmail } from '../services/email.service.js';
import { sendSMS } from '../services/sms.service.js';
import { parseUserAgent, getDeviceInfo } from '../utils/deviceParser.js';
import logger from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { auditFromReq } from '../services/audit.service.js';
import { notifyLogin } from '../services/notification.service.js';

// Generate JWT token
const generateToken = (userId, expiresIn = process.env.JWT_EXPIRES_IN || '15m') => {
  return jwt.sign({
    userId,
    jti: crypto.randomBytes(16).toString('hex') // Ensure token is unique even if generated in same second
  }, process.env.JWT_SECRET, { expiresIn });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
};

// Create session (with error handling and defaults)
const createSession = async (userId, token, deviceInfo, executor = query) => {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const result = await executor(
      `INSERT INTO user_sessions (user_id, session_token, device_fingerprint, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_token) DO UPDATE
       SET last_activity_at = NOW(), expires_at = $6
       RETURNING id`,
      [
        userId,
        token,
        deviceInfo?.fingerprint || 'unknown',
        deviceInfo?.ipAddress || null,
        deviceInfo?.userAgent || '',
        expiresAt
      ]
    );

    return result.rows[0].id;
  } catch (error) {
    logger.error('Failed to create session:', error.message);
    // Return null if session creation fails - login can still proceed
    return null;
  }
};

// Store device information (with error handling for missing table/columns)
const storeDeviceInfo = async (userId, deviceInfo, executor = query) => {
  try {
    if (!deviceInfo || !deviceInfo.fingerprint) {
      logger.warn('Device info missing, skipping device storage');
      return;
    }

    const parsedDevice = parseUserAgent(deviceInfo.userAgent || '');

    // Check if device already exists
    const existingDevice = await executor(
      'SELECT id FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2',
      [userId, deviceInfo.fingerprint]
    );

    if (existingDevice.rows.length === 0) {
      await executor(
        `INSERT INTO user_devices (user_id, device_fingerprint, device_name, device_type, os, browser, ip_address, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          userId,
          deviceInfo.fingerprint,
          parsedDevice.deviceName || 'Unknown',
          parsedDevice.deviceType || 'Unknown',
          parsedDevice.os || 'Unknown',
          parsedDevice.browser || 'Unknown',
          deviceInfo.ipAddress,
        ]
      );
    } else {
      // Update last seen
      await executor(
        'UPDATE user_devices SET last_seen_at = NOW(), ip_address = $1 WHERE id = $2',
        [deviceInfo.ipAddress, existingDevice.rows[0].id]
      );
    }
  } catch (error) {
    // Don't fail login if device tracking fails
    logger.error('Failed to store device info (non-critical):', error.message);
  }
};

// 6-digit numeric code — same format already used for 2FA login OTPs (otp_codes.purpose =
// '2fa_login'). Signup verification reuses that same table/mechanism with purpose =
// 'email_verification' instead of a clickable link. The link-based flow was replaced entirely:
// real verification links routinely got hit by corporate "safe links" email scanners and
// link-preview features before the actual user ever clicked, silently consuming the one-shot
// token — a code the user has to read and type in manually can't be "clicked" by a bot.
const generateNumericCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// Issues a verification code email. Always sends a fresh code and always actually delivers it —
// abuse is throttled by otpRateLimiter on the route, not by silently skipping the send (that was
// the previous link-based version's bug: a "cooldown" check that bailed out without emailing
// anything, while the caller always reported success regardless).
const issueVerificationEmail = async (user, name) => {
  const verificationCode = generateNumericCode();
  const codeHash = await bcrypt.hash(verificationCode, 10);
  await query(
    `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, 'email_verification', NOW() + INTERVAL '15 minutes')`,
    [user.id, codeHash]
  );

  await sendEmail({
    to: user.email,
    subject: 'Verify your JAXOPAY account',
    template: 'email-verification',
    data: {
      name: name || 'User',
      verificationCode,
    },
  });
};

// Signup — nothing is written to `users` here. Signup data (password already hashed) is held in
// `pending_signups` until the 6-digit email code is confirmed; the real account only gets
// created at that point (see verifyEmailCode below). This is what lets someone who typo'd their
// email/phone just retry with a correction instead of hitting "already exists" for an account
// that was never actually theirs — pending_signups has no uniqueness constraint at all, and a
// resubmission for the same email deletes-and-replaces the previous pending attempt outright.
export const signup = catchAsync(async (req, res) => {
  const { email, password, phone, country_code, metadata } = req.body;

  // Only a REAL, already-registered account blocks signup — never another pending, unverified
  // attempt (there's nothing to conflict with on pending_signups).
  const phoneToCheck = phone && phone.trim() !== '' ? phone : null;
  const existingUser = phoneToCheck
    ? await query('SELECT id FROM users WHERE (email = $1 OR phone = $2) AND deleted_at IS NULL', [email, phoneToCheck])
    : await query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);

  if (existingUser.rows.length > 0) {
    throw new AppError('User with this email or phone already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // Frontend sends first_name/last_name at the top level; older clients nest them under metadata.
  const firstName = metadata?.first_name || req.body.first_name || 'User';
  const lastName = metadata?.last_name || req.body.last_name || null;

  const verificationCode = generateNumericCode();
  const codeHash = await bcrypt.hash(verificationCode, 10);

  await transaction(async (client) => {
    await client.query('DELETE FROM pending_signups WHERE email = $1', [email]);
    await client.query(
      `INSERT INTO pending_signups
       (email, phone, password_hash, first_name, last_name, country_code, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '15 minutes')`,
      [email, phone || null, passwordHash, firstName, lastName, country_code || null, codeHash]
    );
  });

  // Send verification email (async, outside transaction)
  sendEmail({
    to: email,
    subject: 'Verify your JAXOPAY account',
    template: 'email-verification',
    data: {
      name: firstName,
      verificationCode,
    },
  }).catch(err => logger.error('Error sending verification email:', err));

  logger.info('Signup pending email verification:', { email });

  res.status(201).json({
    success: true,
    message: 'Please check your email for a 6-digit code to verify your account.',
    // No user id and no session — nothing exists in `users` until the code is confirmed.
    data: { email },
  });
});

// Login
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // Get user with profile
  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.role, u.kyc_tier, u.is_active, 
            u.is_email_verified, u.two_fa_enabled, u.two_fa_method, u.two_fa_secret,
            up.first_name, up.last_name, up.avatar_url
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [email]
  );

  if (result.rows.length === 0) {
    logger.warn('Login failed: User not found', { email });
    throw new AppError('Invalid email or password', 401);
  }

  const user = result.rows[0];

  // Check if account is active
  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    logger.warn('Login failed: Invalid password', { email, userId: user.id });
    auditFromReq(req, { userId: user.id, action: 'login_failed', entityType: 'user', entityId: user.id, newValues: { email, reason: 'invalid_password' } });
    throw new AppError('Invalid email or password', 401);
  }

  // Block login until the email is verified — checked after password verification so we don't
  // leak account existence to someone who doesn't know the password. Fire off a fresh
  // verification email right now (best-effort) so "check your inbox" is actually true —
  // don't rely solely on the user noticing/clicking a separate "resend" action.
  if (!user.is_email_verified) {
    issueVerificationEmail(user, user.first_name).catch((err) =>
      logger.error('Failed to auto-send verification email on blocked login:', err.message)
    );
    throw new AppError(
      'Please verify your email before logging in. Check your inbox for the 6-digit verification code.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }

  // If 2FA is enabled
  if (user.two_fa_enabled) {
    let otp;

    if (user.two_fa_method !== 'authenticator') {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await bcrypt.hash(otp, 10);

      await query(
        `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
        [user.id, otpHash, '2fa_login']
      );
    }

    if (user.two_fa_method === 'sms') {
      const phoneResult = await query('SELECT phone FROM users WHERE id = $1', [user.id]);
      await sendSMS(phoneResult.rows[0].phone, `Your JAXOPAY login code is: ${otp}`);
    } else if (user.two_fa_method === 'authenticator') {
      // Do nothing, user will check their app
    } else {
      await sendEmail({
        to: email,
        subject: 'Your JAXOPAY login code',
        template: '2fa-code',
        data: { code: otp },
      });
    }

    return res.status(200).json({
      success: true,
      message: user.two_fa_method === 'authenticator' ? 'Please enter the code from your Authenticator app.' : '2FA code sent. Please verify to complete login.',
      data: {
        requires_2fa: true,
        method: user.two_fa_method || 'email', // default fallback
        user_id: user.id,
      },
    });
  }

  // Generate tokens
  const accessToken = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Create session (with timeout protection). A token handed back without a matching
  // user_sessions row is worse than no token at all — verifyToken() requires that row on
  // every subsequent request, so a silently-tolerated failure here means the client walks
  // away believing login succeeded while every following request 401s. Fail loudly instead
  // so the client can retry the login rather than limping along on a dead-on-arrival token.
  let sessionId;
  try {
    sessionId = await Promise.race([
      createSession(user.id, accessToken, req.deviceInfo),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Session creation timeout')), 5000))
    ]);
  } catch (error) {
    logger.warn('Session creation failed or timed out:', error.message);
  }
  if (!sessionId) {
    throw new AppError('Login service temporarily unavailable. Please try again.', 503);
  }

  // Store device info (with timeout protection)
  try {
    await Promise.race([
      storeDeviceInfo(user.id, req.deviceInfo),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Device storage timeout')), 5000))
    ]);
  } catch (error) {
    logger.warn('Device info storage failed or timed out (non-critical):', error.message);
  }

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  logger.info('User logged in successfully:', { userId: user.id, email });
  auditFromReq(req, { userId: user.id, action: 'login', entityType: 'user', entityId: user.id });
  notifyLogin(user.id, {
    device: req.deviceInfo?.deviceName && req.deviceInfo?.browser
      ? `${req.deviceInfo.browser} on ${req.deviceInfo.deviceName}`
      : req.deviceInfo?.browser || req.deviceInfo?.os,
    ipAddress: req.deviceInfo?.ipAddress,
  }).catch(() => {});

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_tier: user.kyc_tier,
        is_email_verified: user.is_email_verified,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url
      },
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: '15m',
      },
    },
  });
});

// Request OTP
export const requestOTP = catchAsync(async (req, res) => {
  const { phone } = req.body;

  // Check if user exists
  const result = await query(
    'SELECT id, is_active FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [phone]
  );

  if (result.rows.length === 0) {
    throw new AppError('No account found with this phone number', 404);
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);

  // Store OTP
  await query(
    `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
    [user.id, otpHash, 'phone_login']
  );

  // Send OTP via SMS
  await sendSMS(phone, `Your JAXOPAY login code is: ${otp}. Valid for 5 minutes.`);

  logger.info('OTP sent successfully:', { userId: user.id, phone });

  res.status(200).json({
    success: true,
    message: 'OTP sent successfully',
    data: {
      expires_in: 300, // 5 minutes in seconds
    },
  });
});

// Verify OTP
// Verify OTP / 2FA Challenge
export const verifyOTP = catchAsync(async (req, res) => {
  const { phone, userId, otp } = req.body;

  let user;
  if (userId) {
    const userResult = await query(
      `SELECT u.id, u.email, u.role, u.kyc_tier, u.is_active, 
              u.two_fa_enabled, u.two_fa_method, u.two_fa_secret,
              up.first_name, up.last_name, up.avatar_url
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404);
    }
    user = userResult.rows[0];
  } else if (phone) {
    const userResult = await query(
      `SELECT u.id, u.email, u.role, u.kyc_tier, u.is_active, 
              u.two_fa_enabled, u.two_fa_method, u.two_fa_secret,
              up.first_name, up.last_name, up.avatar_url
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE u.phone = $1 AND u.deleted_at IS NULL`,
      [phone]
    );
    if (userResult.rows.length === 0) {
      throw new AppError('Invalid phone number', 401);
    }
    user = userResult.rows[0];
  } else {
    throw new AppError('Phone or User ID is required', 400);
  }

  let isValid = false;

  // Authenticator (TOTP) Verification
  if (user.two_fa_enabled && user.two_fa_method === 'authenticator') {
    if (!user.two_fa_secret) {
      throw new AppError('2FA is enabled but secret is missing. Contact support.', 500);
    }
    isValid = speakeasy.totp.verify({
      secret: user.two_fa_secret,
      encoding: 'base32',
      token: otp,
      window: 1 // Allow 30s drift
    });
  } else {
    // SMS / Email OTP Verification (DB Check)
    const otpResult = await query(
      `SELECT id, code_hash, expires_at
       FROM otp_codes
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (otpResult.rows.length === 0) {
      throw new AppError('No valid OTP found. Please request a new one.', 401);
    }

    const otpRecord = otpResult.rows[0];

    if (new Date(otpRecord.expires_at) < new Date()) {
      throw new AppError('OTP has expired. Please request a new one.', 401);
    }

    isValid = await bcrypt.compare(otp, otpRecord.code_hash);

    if (isValid) {
      await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otpRecord.id]);
    }
  }

  if (!isValid) {
    throw new AppError('Invalid OTP', 401);
  }

  // Generate tokens
  const accessToken = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Create session. Must succeed — a token without a matching user_sessions row fails
  // verifyToken() on its very next use, so a silent failure here would report a
  // successful login that's actually dead on arrival.
  const sessionId = await createSession(user.id, accessToken, req.deviceInfo);
  if (!sessionId) {
    throw new AppError('Login service temporarily unavailable. Please try again.', 503);
  }

  // Store device info
  if (req.deviceInfo) {
    await storeDeviceInfo(user.id, req.deviceInfo);
  }

  // Update last login
  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  // If verified by phone, mark phone as verified
  if (phone) {
    await query('UPDATE users SET is_phone_verified = true WHERE id = $1', [user.id]);
  }

  logger.info('User logged in via 2FA/OTP:', { userId: user.id });
  auditFromReq(req, { userId: user.id, action: 'login', entityType: 'user', entityId: user.id, newValues: { method: '2fa' } });

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_tier: user.kyc_tier,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url
      },
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: '15m',
      },
    },
  });
});

// Logout
export const logout = catchAsync(async (req, res) => {
  // Invalidate current session
  await query(
    'UPDATE user_sessions SET is_active = false WHERE id = $1',
    [req.sessionId]
  );

  logger.info('User logged out:', { userId: req.user.id });
  auditFromReq(req, { action: 'logout', entityType: 'user', entityId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

// Refresh token
export const refreshToken = catchAsync(async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    throw new AppError('Refresh token is required', 400);
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
  }

  // Get user info
  let user;
  try {
    const result = await query(
      'SELECT id, email, role, kyc_tier, kyc_status, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId],
      { timeout: 8000, retries: 1 }
    );
    if (result.rows.length === 0) {
      throw new AppError('The user belonging to this token no longer exists.', 401);
    }
    user = result.rows[0];
  } catch (err) {
    if (err.statusCode === 401 || err.status === 401) throw err;
    // DB is unavailable — return 503 so clients know to retry, not log out
    throw new AppError('Session service temporarily unavailable. Please try again.', 503);
  }

  // Generate new access token
  const accessToken = generateToken(user.id);

  // Create new session in DB so verifyToken recognizes it. This must succeed — verifyToken()
  // requires a matching, active user_sessions row on every request, so silently returning a
  // token without one (the old "best-effort" behavior) meant a refresh could report success
  // while handing back a token that 401s on its very next use, degrading the app mid-session
  // with no explanation. Fail loudly instead so the client retries the refresh.
  const sessionId = await createSession(user.id, accessToken, req.deviceInfo);
  if (!sessionId) {
    throw new AppError('Session service temporarily unavailable. Please try again.', 503);
  }

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_tier: user.kyc_tier,
        kyc_status: user.kyc_status,
        created_at: user.created_at,
      },
      access_token: accessToken,
      refresh_token: refresh_token,
      expires_in: '15m',
    },
  });
});

// Forgot password
export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  // Check if user exists
  const result = await query(
    'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );

  // Always return success to prevent email enumeration
  if (result.rows.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  }

  const user = result.rows[0];

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = await bcrypt.hash(resetToken, 10);

  // Store reset token
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [user.id, resetTokenHash]
  );

  // Send reset email
  await sendEmail({
    to: email,
    subject: 'Reset your JAXOPAY password',
    template: 'password-reset',
    data: {
      name: 'User',
      resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
    },
  });

  logger.info('Password reset requested:', { userId: user.id, email });

  res.status(200).json({
    success: true,
    message: 'If an account exists with this email, a password reset link has been sent.',
  });
});

// Reset password
export const resetPassword = catchAsync(async (req, res) => {
  const { token, password } = req.body;

  // Find the matching reset token among recent, unused, non-expired records.
  // Tokens are hashed, so we cannot look up by token directly — compare against
  // each candidate. (The previous "latest token only" approach broke whenever a
  // second user requested a reset before the first used their link.)
  const result = await query(
    `SELECT pr.id, pr.user_id, pr.token_hash, pr.expires_at
     FROM password_resets pr
     WHERE pr.used_at IS NULL AND pr.expires_at > NOW()
     ORDER BY pr.created_at DESC
     LIMIT 50`
  );

  let resetRecord = null;
  for (const row of result.rows) {
    if (await bcrypt.compare(token, row.token_hash)) {
      resetRecord = row;
      break;
    }
  }

  if (!resetRecord) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(password, 12);

  // Update password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [passwordHash, resetRecord.user_id]
  );

  // Mark token as used
  await query(
    'UPDATE password_resets SET used_at = NOW() WHERE id = $1',
    [resetRecord.id]
  );

  // Invalidate all sessions
  await query(
    'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
    [resetRecord.user_id]
  );

  logger.info('Password reset successful:', { userId: resetRecord.user_id });
  auditFromReq(req, { userId: resetRecord.user_id, action: 'password_reset', entityType: 'user', entityId: resetRecord.user_id });

  res.status(200).json({
    success: true,
    message: 'Password reset successful. Please log in with your new password.',
  });
});

// Change password
export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Get user's current password
  const result = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );

  const user = result.rows[0];

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isPasswordValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [passwordHash, req.user.id]
  );

  logger.info('Password changed:', { userId: req.user.id });
  auditFromReq(req, { action: 'password_changed', entityType: 'user', entityId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
});

// Verify email — 6-digit code, not a clickable link.
//
// The previous link-based flow had a decisive, unfixable problem: real verification links are
// routinely visited before the actual user ever clicks them — corporate "safe links" email
// scanners (Microsoft Defender, Proofpoint, Mimecast) and some email clients' link-preview
// features fetch and execute the destination page to check it isn't a phishing site, silently
// consuming a one-shot token. No amount of DNS/SPF/DKIM correctness prevents that (confirmed
// live — domain auth was fully verified and it still happened). A code the user has to read out
// of their inbox and type in by hand can't be "clicked" by an automated scanner.
//
// On success, logs the user straight in (same session shape as login()) — the frontend goes
// directly from "enter your code" to the dashboard instead of a separate login step.
export const verifyEmailCode = catchAsync(async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) throw new AppError('email and code are required', 400);

  const userResult = await query(
    `SELECT u.id, u.email, u.role, u.kyc_tier, u.is_email_verified, u.is_active,
            up.first_name, up.last_name, up.avatar_url
     FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [email]
  );
  let user = userResult.rows[0];

  // Already a real, verified account (e.g. a second submit after success) — idempotent success,
  // still logs them in. Anything else means no `users` row exists yet for this email, since
  // signup no longer creates one — look for the pending signup instead and promote it.
  if (!user || !user.is_email_verified) {
    if (user) {
      // Real account exists but isn't verified yet — a row from before this change (signup used
      // to create the user row immediately; this handles anyone already sitting in that state
      // rather than leaving them stuck), verified via the original otp_codes-based check.
      const otpResult = await query(
        `SELECT id, code_hash, expires_at, attempts FROM otp_codes
         WHERE user_id = $1 AND purpose = 'email_verification' AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );
      if (otpResult.rows.length === 0) {
        throw new AppError('Invalid or expired verification code. Please request a new one.', 400);
      }
      const otp = otpResult.rows[0];

      if (new Date(otp.expires_at) < new Date()) {
        throw new AppError('Verification code has expired. Please request a new one.', 400);
      }
      if (otp.attempts >= 5) {
        throw new AppError('Too many incorrect attempts. Please request a new code.', 429);
      }

      const isValid = await bcrypt.compare(String(code).trim(), otp.code_hash);
      if (!isValid) {
        await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
        const remaining = 5 - (otp.attempts + 1);
        throw new AppError(
          remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Too many incorrect attempts. Please request a new code.',
          400
        );
      }

      await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otp.id]);
      await query('UPDATE users SET is_email_verified = true WHERE id = $1', [user.id]);
      user.is_email_verified = true;
      logger.info('Email verified via code (legacy row):', { userId: user.id });
    } else {
      const pendingResult = await query(
        `SELECT * FROM pending_signups WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
        [email]
      );
      if (pendingResult.rows.length === 0) {
        throw new AppError('Invalid or expired verification code. Please sign up again.', 400);
      }
      const pending = pendingResult.rows[0];

      if (new Date(pending.expires_at) < new Date()) {
        throw new AppError('Verification code has expired. Please request a new one.', 400);
      }
      if (pending.attempts >= 5) {
        throw new AppError('Too many incorrect attempts. Please request a new code.', 429);
      }

      const isValid = await bcrypt.compare(String(code).trim(), pending.code_hash);
      if (!isValid) {
        await query('UPDATE pending_signups SET attempts = attempts + 1 WHERE id = $1', [pending.id]);
        const remaining = 5 - (pending.attempts + 1);
        throw new AppError(
          remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Too many incorrect attempts. Please request a new code.',
          400
        );
      }

      // Code confirmed — this is the moment the account actually gets created. Wrapped in a
      // transaction with the pending row's own deletion so a crash partway through can't leave
      // a promoted user AND a still-usable pending row (which could re-promote on retry and
      // collide with the users.email unique constraint).
      try {
        const created = await transaction(async (client) => {
          const userInsert = await client.query(
            `INSERT INTO users (email, phone, password_hash, country_code, is_email_verified)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id, email, role, kyc_tier, is_email_verified, is_active`,
            [pending.email, pending.phone, pending.password_hash, pending.country_code]
          );
          const newUser = userInsert.rows[0];

          const lastName = pending.last_name || newUser.id.substring(0, 8);
          await client.query(
            `INSERT INTO user_profiles (user_id, first_name, last_name, country)
             VALUES ($1, $2, $3, $4)`,
            [newUser.id, pending.first_name || 'User', lastName, pending.country_code || 'NG']
          );

          for (const currency of ['NGN', 'USD']) {
            await client.query(
              `INSERT INTO wallets (user_id, currency, wallet_type, balance) VALUES ($1, $2, 'fiat', 0)`,
              [newUser.id, currency]
            );
          }

          await storeDeviceInfo(newUser.id, req.deviceInfo, (...args) => client.query(...args));

          // OPTIONAL: Sync with Supabase Auth (if service role key is provided) — same
          // best-effort behavior signup used to have before account creation moved here, minus
          // the password field: only the bcrypt hash survives into pending_signups (the raw
          // plaintext is never persisted), and Supabase's admin API needs the raw password, not
          // a pre-computed hash. Currently inactive in every environment (no
          // SUPABASE_SERVICE_ROLE_KEY configured) — if this is ever reactivated, a synced user
          // would need to set their Supabase-side password separately (e.g. on first login).
          if (supabaseAdmin) {
            try {
              const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email: pending.email,
                email_confirm: true,
                user_metadata: { first_name: pending.first_name, last_name: pending.last_name },
              });
              if (authError) {
                logger.warn('Supabase Auth sync failed (non-critical):', authError.message);
              } else {
                await client.query('UPDATE users SET id = $1 WHERE id = $2', [authUser.user.id, newUser.id]);
                newUser.id = authUser.user.id;
              }
            } catch (err) {
              logger.error('Unexpected error during Supabase sync:', err);
            }
          }

          await client.query('DELETE FROM pending_signups WHERE email = $1', [pending.email]);

          return newUser;
        });

        user = { ...created, first_name: pending.first_name, last_name: pending.last_name || created.id.substring(0, 8), avatar_url: null };
        logger.info('Signup promoted after email verification:', { userId: user.id, email: user.email });
      } catch (err) {
        // 23505 = unique_violation — someone else claimed this email/phone between signup and
        // this verification (e.g. two pending signups for the same email both got verified).
        if (err.code === '23505') {
          throw new AppError('This email or phone was just registered. Please try logging in.', 409);
        }
        throw err;
      }
    }
  }

  if (!user.is_active) {
    // Verified but deactivated — don't hand out a session.
    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  }

  // Log the user straight in — same shape/side-effects as login().
  const accessToken = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  // Must succeed — see refreshToken()/login() above for why a token without a matching
  // user_sessions row is worse than an honest failure the client can retry.
  let sessionId;
  try {
    sessionId = await Promise.race([
      createSession(user.id, accessToken, req.deviceInfo),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Session creation timeout')), 5000)),
    ]);
  } catch (error) {
    logger.warn('Session creation failed or timed out:', error.message);
  }
  if (!sessionId) {
    throw new AppError('Login service temporarily unavailable. Please try logging in.', 503);
  }
  try {
    await Promise.race([
      storeDeviceInfo(user.id, req.deviceInfo),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Device storage timeout')), 5000)),
    ]);
  } catch (error) {
    logger.warn('Device info storage failed or timed out (non-critical):', error.message);
  }
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  auditFromReq(req, { userId: user.id, action: 'login', entityType: 'user', entityId: user.id, newValues: { method: 'email_verification' } });

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_tier: user.kyc_tier,
        is_email_verified: user.is_email_verified,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
      },
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: '15m',
      },
    },
  });
});

// Resend verification email
// Public (no login required — a user with an unverified email can't log in at all, so they
// can't reach an authenticated endpoint to ask for this). Takes `email` in the body instead of
// req.user. Always returns a generic success message to prevent email enumeration, mirroring
// forgotPassword's pattern — only genuinely unverified accounts actually get an email.
export const resendVerificationEmail = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new AppError('email is required', 400);

  const generic = { success: true, message: 'If that account exists and needs verification, a new code has been sent.' };

  // Legacy path: a real users row from before signup stopped creating one immediately, still
  // sitting unverified.
  const result = await query(
    `SELECT id, email, is_email_verified FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  if (result.rows.length > 0) {
    const user = result.rows[0];
    if (!user.is_email_verified) await issueVerificationEmail(user);
    return res.status(200).json(generic);
  }

  // Normal path: an unpromoted pending signup — refresh its code/expiry/attempts and resend,
  // rather than requiring the user to redo the whole signup form just to get a new code.
  const pendingResult = await query(
    `SELECT id, email, first_name FROM pending_signups WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  if (pendingResult.rows.length === 0) return res.status(200).json(generic);

  const pending = pendingResult.rows[0];
  const verificationCode = generateNumericCode();
  const codeHash = await bcrypt.hash(verificationCode, 10);
  await query(
    `UPDATE pending_signups SET code_hash = $1, expires_at = NOW() + INTERVAL '15 minutes', attempts = 0 WHERE id = $2`,
    [codeHash, pending.id]
  );

  await sendEmail({
    to: pending.email,
    subject: 'Verify your JAXOPAY account',
    template: 'email-verification',
    data: { name: pending.first_name || 'User', verificationCode },
  });

  res.status(200).json(generic);
});

// Placeholder functions for 2FA and device/session management
// Enable 2FA
export const enable2FA = catchAsync(async (req, res) => {
  const { method } = req.body; // 'authenticator', 'sms', 'email'

  if (method === 'authenticator') {
    const secret = speakeasy.generateSecret({
      name: `JAXOPAY:${req.user.email}`,
    });

    // Store secret temporarily (or update user with pending status)
    // For simplicity, we'll store it directly but enable flag remains false until verified
    await query(
      'UPDATE users SET two_fa_secret = $1, two_fa_method = $2 WHERE id = $3',
      [secret.base32, 'authenticator', req.user.id]
    );

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qr_code: qrCodeUrl,
        method: 'authenticator',
      },
    });
  }

  // Handle other methods if needed (SMS/Email usually already verified via phone/email verification)
  // For now, just allow them
  await query(
    'UPDATE users SET two_fa_method = $1 WHERE id = $2',
    [method, req.user.id]
  );

  res.status(200).json({
    success: true,
    message: `Two-factor authentication via ${method} initiated`,
    data: { method },
  });
});

// Verify 2FA (Setup confirmation)
export const verify2FA = catchAsync(async (req, res) => {
  const { code, method } = req.body;

  if (method === 'authenticator') {
    const userResult = await query(
      'SELECT two_fa_secret FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0].two_fa_secret) {
      throw new AppError('2FA setup not initiated', 400);
    }

    const verified = speakeasy.totp.verify({
      secret: userResult.rows[0].two_fa_secret,
      encoding: 'base32',
      token: code,
    });

    if (!verified) {
      throw new AppError('Invalid authentication code', 401);
    }
  }

  // Enable 2FA
  await query(
    'UPDATE users SET two_fa_enabled = true WHERE id = $1',
    [req.user.id]
  );

  auditFromReq(req, { action: '2fa_enabled', entityType: 'user', entityId: req.user.id });
  res.status(200).json({
    success: true,
    message: 'Two-factor authentication enabled successfully',
  });
});

// Disable 2FA
export const disable2FA = catchAsync(async (req, res) => {
  const { password } = req.body;

  // Verify password for security
  if (password) {
    const userResult = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const isPasswordValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!isPasswordValid) {
      throw new AppError('Invalid password', 401);
    }
  }

  await query(
    'UPDATE users SET two_fa_enabled = false, two_fa_secret = NULL, two_fa_method = NULL WHERE id = $1',
    [req.user.id]
  );

  auditFromReq(req, { action: '2fa_disabled', entityType: 'user', entityId: req.user.id });
  res.status(200).json({
    success: true,
    message: 'Two-factor authentication disabled',
  });
});

export const getUserDevices = catchAsync(async (req, res) => {
  const result = await query(
    'SELECT id, device_name, device_type, os, browser, last_seen_at, ip_address FROM user_devices WHERE user_id = $1 ORDER BY last_seen_at DESC',
    [req.user.id]
  );

  res.status(200).json({ success: true, data: result.rows });
});

export const removeDevice = catchAsync(async (req, res) => {
  await query('DELETE FROM user_devices WHERE id = $1 AND user_id = $2', [req.params.deviceId, req.user.id]);
  res.status(200).json({ success: true, message: 'Device removed' });
});

export const getUserSessions = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, ip_address, user_agent, last_activity_at, created_at,
     CASE WHEN id = $2 THEN true ELSE false END as is_current
     FROM user_sessions 
     WHERE user_id = $1 AND is_active = true 
     ORDER BY last_activity_at DESC`,
    [req.user.id, req.sessionId]
  );

  res.status(200).json({ success: true, data: { sessions: result.rows } });
});

export const terminateSession = catchAsync(async (req, res) => {
  await query('UPDATE user_sessions SET is_active = false WHERE id = $1 AND user_id = $2', [req.params.sessionId, req.user.id]);
  res.status(200).json({ success: true, message: 'Session terminated' });
});

export const terminateAllSessions = catchAsync(async (req, res) => {
  await query('UPDATE user_sessions SET is_active = false WHERE user_id = $1 AND id != $2', [req.user.id, req.sessionId]);
  auditFromReq(req, { action: 'logout_all_devices', entityType: 'user', entityId: req.user.id });
  res.status(200).json({ success: true, message: 'All other sessions terminated' });
});

