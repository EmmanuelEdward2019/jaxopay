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

// Generate JWT token
const generateToken = (userId, expiresIn = process.env.JWT_EXPIRES_IN || '15m') => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
};

// Create session
const createSession = async (userId, token, deviceInfo, executor = query) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  const result = await executor(
    `INSERT INTO user_sessions (user_id, session_token, device_fingerprint, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, token, deviceInfo.fingerprint, deviceInfo.ipAddress, deviceInfo.userAgent, expiresAt]
  );

  return result.rows[0].id;
};

// Store device information
const storeDeviceInfo = async (userId, deviceInfo, executor = query) => {
  const parsedDevice = parseUserAgent(deviceInfo.userAgent);

  // Check if device already exists
  const existingDevice = await executor(
    'SELECT id FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2',
    [userId, deviceInfo.fingerprint]
  );

  if (existingDevice.rows.length === 0) {
    await executor(
      `INSERT INTO user_devices (user_id, device_fingerprint, device_name, device_type, os, browser, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        deviceInfo.fingerprint,
        parsedDevice.deviceName,
        parsedDevice.deviceType,
        parsedDevice.os,
        parsedDevice.browser,
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
};

// Signup
export const signup = catchAsync(async (req, res) => {
  console.log('--- SIGNUP REQUEST START ---');
  console.log('Body:', req.body);
  const { email, password, phone, country_code, metadata } = req.body;

  // Check if user already exists
  // Handle null/empty phone to avoid matching all users with null phones
  let existingUser;
  const phoneToCheck = phone && phone.trim() !== '' ? phone : null;

  if (phoneToCheck) {
    existingUser = await query(
      'SELECT id, email, phone FROM users WHERE email = $1 OR phone = $2',
      [email, phoneToCheck]
    );
  } else {
    existingUser = await query(
      'SELECT id, email, phone FROM users WHERE email = $1',
      [email]
    );
  }

  if (existingUser.rows.length > 0) {
    throw new AppError('User with this email or phone already exists', 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create user and profile in a transaction
  const result = await transaction(async (client) => {
    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, phone, password_hash, country_code)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, phone, role, kyc_tier, kyc_status, created_at`,
      [email, phone, passwordHash, country_code]
    );

    const user = userResult.rows[0];

    // Create user profile
    if (metadata) {
      await client.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, country)
         VALUES ($1, $2, $3, $4)`,
        [user.id, metadata.first_name, metadata.last_name, country_code]
      );
    }

    // Create default wallets
    const defaultCurrencies = ['NGN', 'USD'];
    for (const currency of defaultCurrencies) {
      await client.query(
        `INSERT INTO wallets (user_id, currency, wallet_type, balance)
         VALUES ($1, $2, $3, $4)`,
        [user.id, currency, 'fiat', 0]
      );
    }

    // Generate tokens
    const accessToken = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Create session (inside transaction)
    await createSession(user.id, accessToken, req.deviceInfo, (...args) => client.query(...args));

    // Store device info (inside transaction)
    await storeDeviceInfo(user.id, req.deviceInfo, (...args) => client.query(...args));

    // Send verification email (generate token)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await client.query(
      `INSERT INTO email_verifications (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.id, verificationToken]
    );

    return { user, accessToken, refreshToken, verificationToken };
  });

  // Send verification email (async, outside transaction)
  sendEmail({
    to: email,
    subject: 'Verify your JAXOPAY account',
    template: 'email-verification',
    data: {
      name: metadata?.first_name || 'User',
      verificationLink: `${process.env.FRONTEND_URL}/verify-email/${result.verificationToken}`,
    },
  }).catch(err => logger.error('Error sending verification email:', err));

  logger.info('User signed up successfully:', { userId: result.user.id, email });

  res.status(201).json({
    success: true,
    message: 'Account created successfully. Please check your email to verify your account.',
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        phone: result.user.phone,
        role: result.user.role,
        kyc_tier: result.user.kyc_tier,
        kyc_status: result.user.kyc_status,
        created_at: result.user.created_at,
      },
      session: {
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        expires_in: '15m',
      },
    },
  });
});

// Login
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  // Get user
  const result = await query(
    `SELECT id, email, password_hash, role, kyc_tier, is_active, is_email_verified, two_fa_enabled, two_fa_method
     FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );

  if (result.rows.length === 0) {
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
    throw new AppError('Invalid email or password', 401);
  }

  // If 2FA is enabled, send OTP and return pending status
  if (user.two_fa_enabled) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await query(
      `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
      [user.id, otpHash, '2fa_login']
    );

    if (user.two_fa_method === 'sms') {
      const phoneResult = await query('SELECT phone FROM users WHERE id = $1', [user.id]);
      await sendSMS(phoneResult.rows[0].phone, `Your JAXOPAY login code is: ${otp}`);
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
      message: '2FA code sent. Please verify to complete login.',
      data: {
        requires_2fa: true,
        method: user.two_fa_method,
        user_id: user.id,
      },
    });
  }

  // Generate tokens
  const accessToken = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Create session
  await createSession(user.id, accessToken, req.deviceInfo);

  // Store device info
  await storeDeviceInfo(user.id, req.deviceInfo);

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  logger.info('User logged in successfully:', { userId: user.id, email });

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
export const verifyOTP = catchAsync(async (req, res) => {
  const { phone, otp } = req.body;

  // Get user
  const userResult = await query(
    'SELECT id, email, role, kyc_tier, is_active FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [phone]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('Invalid phone number', 401);
  }

  const user = userResult.rows[0];

  // Get latest OTP
  const otpResult = await query(
    `SELECT id, code_hash, expires_at
     FROM otp_codes
     WHERE user_id = $1 AND purpose = 'phone_login' AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id]
  );

  if (otpResult.rows.length === 0) {
    throw new AppError('No valid OTP found. Please request a new one.', 401);
  }

  const otpRecord = otpResult.rows[0];

  // Check if OTP is expired
  if (new Date(otpRecord.expires_at) < new Date()) {
    throw new AppError('OTP has expired. Please request a new one.', 401);
  }

  // Verify OTP
  const isOTPValid = await bcrypt.compare(otp, otpRecord.code_hash);
  if (!isOTPValid) {
    throw new AppError('Invalid OTP', 401);
  }

  // Mark OTP as used
  await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otpRecord.id]);

  // Generate tokens
  const accessToken = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Create session
  await createSession(user.id, accessToken, req.deviceInfo);

  // Store device info
  await storeDeviceInfo(user.id, req.deviceInfo);

  // Update last login and mark phone as verified
  await query(
    'UPDATE users SET last_login_at = NOW(), is_phone_verified = true WHERE id = $1',
    [user.id]
  );

  logger.info('User logged in via OTP:', { userId: user.id, phone });

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_tier: user.kyc_tier,
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
  const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

  // Get user info
  const result = await query(
    'SELECT id, email, role, kyc_tier, kyc_status, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('The user belonging to this token no longer exists.', 401);
  }

  const user = result.rows[0];

  // Generate new access token
  const accessToken = generateToken(user.id);

  // Create new session in DB so verifyToken recognizes it
  await createSession(user.id, accessToken, req.deviceInfo);

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
      resetLink: `${process.env.FRONTEND_URL}/reset-password/${resetToken}`,
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

  // Find valid reset token
  const result = await query(
    `SELECT pr.id, pr.user_id, pr.token_hash, pr.expires_at
     FROM password_resets pr
     WHERE pr.used_at IS NULL
     ORDER BY pr.created_at DESC
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  const resetRecord = result.rows[0];

  // Verify token
  const isTokenValid = await bcrypt.compare(token, resetRecord.token_hash);
  if (!isTokenValid) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  // Check if token is expired
  if (new Date(resetRecord.expires_at) < new Date()) {
    throw new AppError('Reset token has expired', 400);
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

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
});

// Verify email
export const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.params;

  // Find verification record
  const result = await query(
    `SELECT ev.id, ev.user_id, ev.expires_at
     FROM email_verifications ev
     WHERE ev.token = $1 AND ev.verified_at IS NULL`,
    [token]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid or expired verification token', 400);
  }

  const verification = result.rows[0];

  // Check if expired
  if (new Date(verification.expires_at) < new Date()) {
    throw new AppError('Verification token has expired', 400);
  }

  // Mark email as verified
  await query(
    'UPDATE users SET is_email_verified = true WHERE id = $1',
    [verification.user_id]
  );

  // Mark verification as complete
  await query(
    'UPDATE email_verifications SET verified_at = NOW() WHERE id = $1',
    [verification.id]
  );

  logger.info('Email verified:', { userId: verification.user_id });

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
  });
});

// Resend verification email
export const resendVerificationEmail = catchAsync(async (req, res) => {
  if (req.user.is_email_verified) {
    throw new AppError('Email is already verified', 400);
  }

  // Generate new verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  await query(
    `INSERT INTO email_verifications (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [req.user.id, verificationToken]
  );

  await sendEmail({
    to: req.user.email,
    subject: 'Verify your JAXOPAY account',
    template: 'email-verification',
    data: {
      name: 'User',
      verificationLink: `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Verification email sent',
  });
});

// Placeholder functions for 2FA and device/session management
export const enable2FA = catchAsync(async (req, res) => {
  res.json({ success: true, message: '2FA enable endpoint - To be fully implemented' });
});

export const verify2FA = catchAsync(async (req, res) => {
  res.json({ success: true, message: '2FA verify endpoint - To be fully implemented' });
});

export const disable2FA = catchAsync(async (req, res) => {
  res.json({ success: true, message: '2FA disable endpoint - To be fully implemented' });
});

export const getUserDevices = catchAsync(async (req, res) => {
  const result = await query(
    'SELECT id, device_name, device_type, os, browser, last_seen_at FROM user_devices WHERE user_id = $1 ORDER BY last_seen_at DESC',
    [req.user.id]
  );

  res.json({ success: true, data: result.rows });
});

export const removeDevice = catchAsync(async (req, res) => {
  await query('DELETE FROM user_devices WHERE id = $1 AND user_id = $2', [req.params.deviceId, req.user.id]);
  res.json({ success: true, message: 'Device removed' });
});

export const getUserSessions = catchAsync(async (req, res) => {
  const result = await query(
    'SELECT id, ip_address, user_agent, last_activity_at, created_at FROM user_sessions WHERE user_id = $1 AND is_active = true ORDER BY last_activity_at DESC',
    [req.user.id]
  );

  res.json({ success: true, data: result.rows });
});

export const terminateSession = catchAsync(async (req, res) => {
  await query('UPDATE user_sessions SET is_active = false WHERE id = $1 AND user_id = $2', [req.params.sessionId, req.user.id]);
  res.json({ success: true, message: 'Session terminated' });
});

export const terminateAllSessions = catchAsync(async (req, res) => {
  await query('UPDATE user_sessions SET is_active = false WHERE user_id = $1 AND id != $2', [req.user.id, req.sessionId]);
  res.json({ success: true, message: 'All other sessions terminated' });
});

