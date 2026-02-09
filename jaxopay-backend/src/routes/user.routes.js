import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  getProfile,
  updateProfile,
  updateAvatar,
  updatePhone,
  updateEmail,
  getUserStats,
  getActivityLog,
  deleteAccount,
  getUserById,
  searchUsers,
  updateSettings,
} from '../controllers/user.controller.js';

const router = express.Router();

// All user routes require authentication
router.use(verifyToken);

// Get current user profile
router.get('/profile', getProfile);

// Update user settings
router.patch('/settings', updateSettings);

// Get user statistics
router.get('/statistics', getUserStats);

// Get activity log
router.get(
  '/activity',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getActivityLog
);

// Search users
router.get(
  '/search',
  query('query').isString().isLength({ min: 3 }),
  validate,
  searchUsers
);

// Get user by ID
router.get(
  '/:userId',
  param('userId').isUUID(),
  validate,
  getUserById
);

// Update profile
router.patch(
  '/profile',
  body('first_name').optional().isString().trim(),
  body('last_name').optional().isString().trim(),
  body('date_of_birth').optional().isISO8601(),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('country').optional().isString(),
  body('city').optional().isString(),
  body('address').optional().isString(),
  body('postal_code').optional().isString(),
  body('bio').optional().isString().isLength({ max: 500 }),
  validate,
  updateProfile
);

// Update avatar
router.patch(
  '/avatar',
  body('avatar_url').isURL(),
  validate,
  updateAvatar
);

// Update phone
router.patch(
  '/phone',
  body('phone').isMobilePhone(),
  body('country_code').isString().isLength({ min: 2, max: 3 }),
  validate,
  updatePhone
);

// Update email
router.patch(
  '/email',
  body('email').isEmail(),
  validate,
  updateEmail
);

// Delete account
router.delete(
  '/account',
  body('password').isString(),
  validate,
  deleteAccount
);

export default router;

