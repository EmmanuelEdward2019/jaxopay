import express from 'express';
import { verifyToken, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  getUsers,
  createUser,
  getUser,
  updateUser,
  suspendUser,
  verifyKYCDocument,
  getSystemStats,
  getPendingKYC,
  getFeatureToggles,
  updateFeatureToggle,
  getAuditLogs,
  getExchangeRates,
  createExchangeRate,
  updateExchangeRate,
  getFeeConfigs,
  createFeeConfig,
  updateFeeConfig,
  toggleEmergencyShutdown,
  processRefund,
  getComplianceStats,
  getAllWallets,
  getAllCards,
  getAllTransactions,
  sendAdminBulkSMS,
  getUserFeatureAccess,
  updateUserFeatureAccess,
  getOrchestrationStatus,
  updateCardStatus,
} from '../controllers/admin.controller.js';
import { getHighRiskUsers, refreshUserRiskScore } from '../controllers/aml.controller.js';

const router = express.Router();

// All admin routes require authentication
router.use(verifyToken);
// Base restriction for all admin routes - broaden to include compliance officer
router.use(restrictTo('admin', 'super_admin', 'compliance_officer'));

// Get system statistics - Available to all
router.get('/stats', getSystemStats);

// Get pending KYC documents
router.get(
  '/kyc/pending',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getPendingKYC
);

// Get all users
router.get(
  '/users',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('kyc_tier').optional().isInt({ min: 0, max: 3 }),
  query('status').optional().isString(),
  query('role').optional().isString(),
  validate,
  getUsers
);

// Create user
router.post(
  '/users',
  restrictTo('admin', 'super_admin'),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('phone').isString(),
  body('first_name').isString(),
  body('last_name').isString(),
  body('role').optional().isIn(['end_user', 'admin']),
  body('kyc_tier').optional().isIn(['tier_0', 'tier_1', 'tier_2']),
  validate,
  createUser
);

// Get single user
router.get(
  '/users/:userId',
  param('userId').isUUID(),
  validate,
  getUser
);

// Update user - Admin/Super Admin only
router.patch(
  '/users/:userId',
  restrictTo('admin', 'super_admin'),
  param('userId').isUUID(),
  body('kyc_tier').optional().isInt({ min: 0, max: 3 }),
  body('status').optional().isIn(['active', 'suspended', 'inactive']),
  body('role').optional().isIn(['user', 'admin']),
  validate,
  updateUser
);

// Suspend user - Available to Compliance Officer too? Yes, for AML.
router.post(
  '/users/:userId/suspend',
  param('userId').isUUID(),
  body('reason').isString(),
  validate,
  suspendUser
);

// Verify KYC document - Compliance Officer task
router.patch(
  '/kyc/:documentId/verify',
  param('documentId').isUUID(),
  body('status').isIn(['approved', 'rejected']),
  body('rejection_reason').optional().isString(),
  validate,
  verifyKYCDocument
);

// Feature toggles
router.get('/toggles', getFeatureToggles);
router.patch(
  '/toggles/:featureId',
  restrictTo('super_admin'),
  param('featureId').isUUID(),
  body('is_enabled').optional().isBoolean(),
  body('enabled_countries').optional().isArray(),
  body('disabled_countries').optional().isArray(),
  body('config').optional().isObject(),
  validate,
  updateFeatureToggle
);

// AML Risk Scoring
router.get('/aml/high-risk', getHighRiskUsers);
router.post('/users/:userId/aml-refresh', param('userId').isUUID(), validate, refreshUserRiskScore);

// Audit Logs
router.get('/audit-logs', getAuditLogs);

// FX & Fee Management - Admin/Super Admin Only
router.get('/fx/rates', getExchangeRates);
router.post('/fx/rates', restrictTo('admin', 'super_admin'), createExchangeRate);
router.patch('/fx/rates/:rateId', restrictTo('admin', 'super_admin'), updateExchangeRate);
router.get('/fees/configs', getFeeConfigs);
router.post('/fees/configs', restrictTo('admin', 'super_admin'), createFeeConfig);
router.patch('/fees/configs/:feeId', restrictTo('admin', 'super_admin'), updateFeeConfig);

// Emergency Shutdown
router.post('/system/shutdown', restrictTo('super_admin'), toggleEmergencyShutdown);

// Manual Refunds & Overrides
router.post('/transactions/:transactionId/refund', restrictTo('admin', 'super_admin'), processRefund);

// Compliance Reports
router.get('/compliance/stats', getComplianceStats);

// Wallet & Card Management
router.get('/wallets', getAllWallets);
router.get('/cards', getAllCards); // Read-only for compliance is fine?
router.patch('/cards/:cardId/status', restrictTo('admin', 'super_admin'), updateCardStatus);
router.get('/transactions', getAllTransactions);

// Admin SMS
router.post('/sms/bulk', restrictTo('admin', 'super_admin'), sendAdminBulkSMS);

// SuperAdmin Advanced Controls
router.get('/users/:userId/features', restrictTo('super_admin'), getUserFeatureAccess);
router.patch('/users/:userId/features', restrictTo('super_admin'), updateUserFeatureAccess);
router.get('/system/orchestration', restrictTo('super_admin', 'admin'), getOrchestrationStatus);

export default router;

