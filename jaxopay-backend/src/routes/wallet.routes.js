import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGuard.js';
import { validate, createWalletValidation } from '../middleware/validator.js';
import { useIdempotency } from '../middleware/idempotency.js';
import { body, param, query } from 'express-validator';
import {
  getWallets,
  getWallet,
  getWalletByCurrency,
  createWallet,
  initializeDeposit,
  verifyDeposit,
  transferBetweenWallets,
  getBalance,
  getAllBalances,
  toggleWalletStatus,
  getWalletTransactions,
  addFunds,
  getOrCreateVBA,
  getRecentDeposits,
} from '../controllers/wallet.controller.js';

const router = express.Router();

// All wallet routes require authentication
router.use(verifyToken);

// Get all user wallets
router.get('/', getWallets);

// Get all balances summary
router.get('/balances', getAllBalances);

// Get or create Virtual Bank Account (VBA) for receiving funds
router.get(
  '/vba/:walletId',
  requireFeature('deposits_fiat'),
  requireKYCTier(2),
  param('walletId').isUUID(),
  validate,
  getOrCreateVBA
);

// Recent completed deposits for a wallet, since a given timestamp (deposit-screen polling)
router.get(
  '/:walletId/recent-deposits',
  param('walletId').isUUID(),
  query('since').optional().isISO8601(),
  validate,
  getRecentDeposits
);

// Get wallet by currency
router.get(
  '/currency/:currency',
  param('currency').isString().isLength({ min: 1, max: 10 }),
  validate,
  getWalletByCurrency
);

// Get single wallet
router.get(
  '/:walletId',
  param('walletId').isUUID(),
  validate,
  getWallet
);

// Get wallet balance
router.get(
  '/:walletId/balance',
  param('walletId').isUUID(),
  validate,
  getBalance
);

// Get wallet transactions
router.get(
  '/:walletId/transactions',
  param('walletId').isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isString(),
  query('status').optional().isString(),
  validate,
  getWalletTransactions
);

// Create new wallet
router.post(
  '/',
  createWalletValidation,
  createWallet
);

// Transfer between wallets — recipient may be an email, username, or user ID (UID).
// `recipient_email` (legacy, email-only) is still accepted for backward compatibility.
router.post(
  '/transfer',
  requireKYCTier(2),
  body('recipient').optional({ checkFalsy: true }).isString().trim(),
  body('recipient_email').optional({ checkFalsy: true }).isString().trim(),
  body('amount').isFloat({ min: 0.01 }),
  body('currency').isString().isLength({ min: 1, max: 10 }),
  body('description').optional().isString(),
  validate,
  useIdempotency,
  transferBetweenWallets
);

// Initialize Korapay deposit (returns checkout URL)
router.post(
  '/deposit/initialize',
  requireFeature('deposits_fiat'),
  requireKYCTier(2),
  body('wallet_id').isUUID(),
  body('amount').isFloat({ min: 1 }),
  body('currency').optional().isString().isLength({ min: 1, max: 10 }),
  validate,
  initializeDeposit
);

// Verify Korapay deposit after payment (checks status and credits wallet)
router.post(
  '/deposit/verify',
  body('reference').isString().notEmpty(),
  validate,
  verifyDeposit
);

// Add funds to wallet (for testing)
router.post(
  '/:walletId/add-funds',
  requireKYCTier(2),
  param('walletId').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  body('description').optional().isString(),
  validate,
  useIdempotency,
  addFunds
);

// Toggle wallet status (freeze/unfreeze)
router.patch(
  '/:walletId/status',
  param('walletId').isUUID(),
  body('is_active').isBoolean(),
  validate,
  toggleWalletStatus
);

export default router;

