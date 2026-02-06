import express from 'express';
import { verifyToken, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  getUsers,
  getUser,
  updateUser,
  suspendUser,
  verifyKYCDocument,
  getSystemStats,
  getPendingKYC,
} from '../controllers/admin.controller.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(verifyToken);
router.use(restrictTo('admin', 'super_admin'));

// Get system statistics
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

// Get single user
router.get(
  '/users/:userId',
  param('userId').isUUID(),
  validate,
  getUser
);

// Update user
router.patch(
  '/users/:userId',
  param('userId').isUUID(),
  body('kyc_tier').optional().isInt({ min: 0, max: 3 }),
  body('status').optional().isIn(['active', 'suspended', 'inactive']),
  body('role').optional().isIn(['user', 'admin']),
  validate,
  updateUser
);

// Suspend user
router.post(
  '/users/:userId/suspend',
  param('userId').isUUID(),
  body('reason').isString(),
  validate,
  suspendUser
);

// Verify KYC document
router.patch(
  '/kyc/:documentId/verify',
  param('documentId').isUUID(),
  body('status').isIn(['approved', 'rejected']),
  body('rejection_reason').optional().isString(),
  validate,
  verifyKYCDocument
);

export default router;

