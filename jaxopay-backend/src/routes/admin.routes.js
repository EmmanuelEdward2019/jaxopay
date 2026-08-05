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
  getApprovedKYC,
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
  getUserFinancialControlsAdmin,
  updateUserFinancialControlsAdmin,
  getOrchestrationStatus,
  updateCardStatus,
  getPendingRamps,
  confirmRamp,
  failRamp,
  sendAdminMessage,
  getAccountDeletionRequests,
  approveAccountDeletionRequest,
  rejectAccountDeletionRequest,
} from '../controllers/admin.controller.js';
import { getHighRiskUsers, refreshUserRiskScore } from '../controllers/aml.controller.js';
import { getTreasuryOverview, getFundMovements } from '../controllers/treasury.controller.js';

const router = express.Router();

// Role groups per the platform's admin RBAC:
//   admin / super_admin — all access
//   compliance_officer  — KYC review only
//   finance             — treasury & transactions only
//   support             — announcements & support tickets only (see ticket/announcement routes)
const STAFF_ROLES = ['admin', 'super_admin', 'compliance_officer', 'finance', 'support'];
const COMPLIANCE_ACCESS = ['admin', 'super_admin', 'compliance_officer'];
const FINANCE_ACCESS = ['admin', 'super_admin', 'finance'];

// All admin routes require authentication
router.use(verifyToken);
// Base restriction: general admin/user-management routes are admin & super_admin only.
// compliance/finance/support get access to their own specific routes below, not this catch-all.
router.use(restrictTo('admin', 'super_admin'));

// Get system statistics - Available to all
router.get('/stats', getSystemStats);

// Treasury / reconciliation overview (finance)
router.get('/treasury', restrictTo(...FINANCE_ACCESS), getTreasuryOverview);
// Fund movements — internal double-entry ledger (finance)
router.get('/ledger', restrictTo(...FINANCE_ACCESS), getFundMovements);

// Send email / dashboard notification to selected users (admin & super_admin)
router.post('/messages', restrictTo('admin', 'super_admin'), sendAdminMessage);

// Crypto ramp settlement queue (manual ops — finance)
router.get('/ramps', restrictTo(...FINANCE_ACCESS), getPendingRamps);
router.post('/ramps/:id/confirm', restrictTo(...FINANCE_ACCESS), confirmRamp);
router.post('/ramps/:id/fail', restrictTo(...FINANCE_ACCESS), failRamp);

// Get pending KYC documents (compliance)
router.get(
  '/kyc/pending',
  restrictTo(...COMPLIANCE_ACCESS),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getPendingKYC
);

router.get(
  '/kyc/approved',
  restrictTo(...COMPLIANCE_ACCESS),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getApprovedKYC
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
  body('role').optional().isIn(['end_user', ...STAFF_ROLES]),
  body('roles').optional().isArray(),
  body('roles.*').optional().isIn(['end_user', ...STAFF_ROLES]),
  body('kyc_tier').optional().isIn(['tier_0', 'tier_1', 'tier_2']),
  body('date_of_birth').optional({ checkFalsy: true }).isISO8601(),
  body('gender').optional({ checkFalsy: true }).isIn(['male', 'female', 'other']),
  body('country').optional({ checkFalsy: true }).isString(),
  body('city').optional({ checkFalsy: true }).isString(),
  body('address').optional({ checkFalsy: true }).isString(),
  body('postal_code').optional({ checkFalsy: true }).isString(),
  body('id_type').optional({ checkFalsy: true }).isIn(['bvn', 'nin']),
  body('id_number').optional({ checkFalsy: true }).isString(),
  body('photo_url').optional({ checkFalsy: true }).isString(),
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
  body('role').optional().isIn(['user', 'end_user', ...STAFF_ROLES]),
  body('roles').optional().isArray(),
  body('roles.*').optional().isIn(['end_user', ...STAFF_ROLES]),
  validate,
  updateUser
);

// Suspend user - available to Compliance too (AML action)
router.post(
  '/users/:userId/suspend',
  restrictTo(...COMPLIANCE_ACCESS),
  param('userId').isUUID(),
  body('reason').isString(),
  validate,
  suspendUser
);

// Verify KYC document - Compliance Officer task
router.patch(
  '/kyc/:documentId/verify',
  restrictTo(...COMPLIANCE_ACCESS),
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

// AML Risk Scoring (compliance)
router.get('/aml/high-risk', restrictTo(...COMPLIANCE_ACCESS), getHighRiskUsers);
router.post('/users/:userId/aml-refresh', restrictTo(...COMPLIANCE_ACCESS), param('userId').isUUID(), validate, refreshUserRiskScore);

// Audit Logs
router.get('/audit-logs', getAuditLogs);

// FX & Fee Management (finance)
router.get('/fx/rates', restrictTo(...FINANCE_ACCESS), getExchangeRates);
router.post('/fx/rates', restrictTo(...FINANCE_ACCESS), createExchangeRate);
router.patch('/fx/rates/:rateId', restrictTo(...FINANCE_ACCESS), updateExchangeRate);
router.get('/fees/configs', restrictTo(...FINANCE_ACCESS), getFeeConfigs);
router.post('/fees/configs', restrictTo(...FINANCE_ACCESS), createFeeConfig);
router.patch('/fees/configs/:feeId', restrictTo(...FINANCE_ACCESS), updateFeeConfig);

// Emergency Shutdown
router.post('/system/shutdown', restrictTo('super_admin'), toggleEmergencyShutdown);

// Manual Refunds & Overrides (finance)
router.post('/transactions/:transactionId/refund', restrictTo(...FINANCE_ACCESS), processRefund);

// Compliance Reports
router.get('/compliance/stats', restrictTo(...COMPLIANCE_ACCESS), getComplianceStats);

// Wallet & Card Management
router.get('/wallets', restrictTo(...FINANCE_ACCESS), getAllWallets);
router.get('/cards', getAllCards);
router.patch('/cards/:cardId/status', restrictTo('admin', 'super_admin'), updateCardStatus);
router.get('/transactions', restrictTo(...FINANCE_ACCESS), getAllTransactions);

// Admin SMS
router.post('/sms/bulk', restrictTo('admin', 'super_admin'), sendAdminBulkSMS);

// Account deletion requests — super_admin approval only
router.get('/account-deletion-requests', restrictTo('super_admin'), getAccountDeletionRequests);
router.post('/account-deletion-requests/:id/approve', restrictTo('super_admin'), param('id').isUUID(), validate, approveAccountDeletionRequest);
router.post(
  '/account-deletion-requests/:id/reject',
  restrictTo('super_admin'),
  param('id').isUUID(),
  body('admin_note').optional({ checkFalsy: true }).isString().isLength({ max: 500 }),
  validate,
  rejectAccountDeletionRequest
);

// SuperAdmin Advanced Controls
router.get('/users/:userId/features', restrictTo('super_admin'), getUserFeatureAccess);
router.patch('/users/:userId/features', restrictTo('super_admin'), updateUserFeatureAccess);

// Per-user financial controls: enable/disable deposits/withdrawals + custom limit override
router.get('/users/:userId/financial-controls', restrictTo('super_admin'), param('userId').isUUID(), validate, getUserFinancialControlsAdmin);
router.patch(
  '/users/:userId/financial-controls',
  restrictTo('super_admin'),
  param('userId').isUUID(),
  body('deposits_enabled').optional().isBoolean(),
  body('withdrawals_enabled').optional().isBoolean(),
  body('custom_deposit_limit_ngn').optional({ nullable: true }).isFloat({ min: 0 }),
  body('custom_withdrawal_limit_usd').optional({ nullable: true }).isFloat({ min: 0 }),
  validate,
  updateUserFinancialControlsAdmin
);
router.get('/system/orchestration', restrictTo('super_admin', 'admin'), getOrchestrationStatus);

export default router;

