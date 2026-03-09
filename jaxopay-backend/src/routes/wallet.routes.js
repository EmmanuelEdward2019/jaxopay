import express from 'express';
import { verifyToken } from '../middleware/auth.js';
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
  param('walletId').isUUID(),
  validate,
  getOrCreateVBA
);

// Get wallet by currency
router.get(
  '/currency/:currency',
  param('currency').isString().isLength({ min: 3, max: 6 }),
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

// Transfer between wallets
router.post(
  '/transfer',
  body('recipient_email').isEmail(),
  body('amount').isFloat({ min: 0.01 }),
  body('currency').isString().isLength({ min: 3, max: 6 }),
  body('description').optional().isString(),
  validate,
  useIdempotency,
  transferBetweenWallets
);

// Initialize Korapay deposit (returns checkout URL)
router.post(
  '/deposit/initialize',
  body('wallet_id').isUUID(),
  body('amount').isFloat({ min: 1 }),
  body('currency').optional().isString().isLength({ min: 3, max: 6 }),
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

