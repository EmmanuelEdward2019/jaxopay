import { body, param, query, validationResult } from 'express-validator';
import { AppError } from './errorHandler.js';

// Validation result handler
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));
    
    throw new AppError(
      JSON.stringify(errorMessages),
      400
    );
  }
  next();
};

// Auth validation rules
export const signupValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('country_code')
    .optional()
    .isLength({ min: 2, max: 2 })
    .withMessage('Country code must be 2 characters'),
  validate,
];

export const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate,
];

export const otpRequestValidation = [
  body('phone')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  validate,
];

export const otpVerifyValidation = [
  body('phone')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number'),
  validate,
];

export const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  validate,
];

export const resetPasswordValidation = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  validate,
];

export const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d])(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  validate,
];

// Transaction validation
export const transferValidation = [
  body('recipient_id')
    .isUUID()
    .withMessage('Invalid recipient ID'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .isIn(['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'GBP', 'CAD', 'CNY'])
    .withMessage('Invalid currency'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  validate,
];

// Wallet validation
export const createWalletValidation = [
  body('currency')
    .isIn(['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'GBP', 'CAD', 'CNY', 'USDT', 'BTC', 'ETH', 'USDC'])
    .withMessage('Invalid currency'),
  body('wallet_type')
    .isIn(['fiat', 'crypto'])
    .withMessage('Wallet type must be either fiat or crypto'),
  validate,
];

// UUID param validation
export const uuidParamValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid ID format'),
  validate,
];

// Pagination validation
export const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate,
];

export default {
  validate,
  signupValidation,
  loginValidation,
  otpRequestValidation,
  otpVerifyValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  transferValidation,
  createWalletValidation,
  uuidParamValidation,
  paginationValidation,
};

