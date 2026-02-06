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

router.post(
  '/verify-email/:token',
  authController.verifyEmail
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

router.post(
  '/resend-verification',
  authRateLimiter,
  authController.resendVerificationEmail
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

