import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { verifyToken, captureDeviceFingerprint } from '../middleware/auth.js';
import { authRateLimiter, otpRateLimiter } from '../middleware/rateLimiter.js';
import {
  signupValidation,
  loginValidation,
  otpRequestValidation,
  otpVerifyValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
} from '../middleware/validator.js';

const router = express.Router();

// Public routes
router.post(
  '/signup',
  authRateLimiter,
  captureDeviceFingerprint,
  signupValidation,
  authController.signup
);

router.post(
  '/login',
  authRateLimiter,
  captureDeviceFingerprint,
  loginValidation,
  authController.login
);

router.post(
  '/login/otp',
  otpRateLimiter,
  otpRequestValidation,
  authController.requestOTP
);

router.post(
  '/verify-otp',
  authRateLimiter,
  captureDeviceFingerprint,
  otpVerifyValidation,
  authController.verifyOTP
);

router.post(
  '/forgot-password',
  authRateLimiter,
  forgotPasswordValidation,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authRateLimiter,
  resetPasswordValidation,
  authController.resetPassword
);

router.post(
  '/refresh-token',
  captureDeviceFingerprint,
  authController.refreshToken
);

// 6-digit code, not a link — see verifyEmailCode's own comment for why. authRateLimiter guards
// brute-force attempts at the route level on top of the per-code attempt lockout in the
// controller (5 wrong guesses kills the code even within the rate-limit window).
router.post(
  '/verify-email-code',
  authRateLimiter,
  authController.verifyEmailCode
);

// Public — must be reachable by a user who hasn't verified their email yet, so isn't logged in
// (login is now blocked until email is verified). Takes `email` in the body. otpRateLimiter (not
// authRateLimiter) specifically because this route always returns 200 regardless of outcome —
// authRateLimiter's skipSuccessfulRequests would never actually count a call against the limit.
router.post(
  '/resend-verification',
  otpRateLimiter,
  authController.resendVerificationEmail
);

// Protected routes
router.use(verifyToken);

router.post(
  '/logout',
  authController.logout
);

router.post(
  '/change-password',
  changePasswordValidation,
  authController.changePassword
);

// 2FA routes
router.post(
  '/2fa/enable',
  authController.enable2FA
);

router.post(
  '/2fa/verify',
  authController.verify2FA
);

router.post(
  '/2fa/disable',
  authController.disable2FA
);

// Device management
router.get(
  '/devices',
  authController.getUserDevices
);

router.delete(
  '/devices/:deviceId',
  authController.removeDevice
);

// Session management
router.get(
  '/sessions',
  authController.getUserSessions
);

router.delete(
  '/sessions/:sessionId',
  authController.terminateSession
);

router.delete(
  '/sessions',
  authController.terminateAllSessions
);

export default router;

