import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  getWallets,
  getWallet,
  getWalletByCurrency,
  createWallet,
  transferBetweenWallets,
  getBalance,
  getAllBalances,
  toggleWalletStatus,
  getWalletTransactions,
  addFunds,
} from '../controllers/wallet.controller.js';

const router = express.Router();

// All wallet routes require authentication
router.use(verifyToken);

// Get all user wallets
router.get('/', getWallets);

// Get all balances summary
router.get('/balances', getAllBalances);

// Get wallet by currency
router.get(
  '/currency/:currency',
  param('currency').isString().isLength({ min: 3, max: 3 }),
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
  body('currency').isString().isLength({ min: 3, max: 3 }),
  body('wallet_type').optional().isIn(['fiat', 'crypto']),
  validate,
  createWallet
);

// Transfer between wallets
router.post(
  '/transfer',
  body('recipient_id').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  body('currency').isString().isLength({ min: 3, max: 3 }),
  body('description').optional().isString(),
  validate,
  transferBetweenWallets
);

// Add funds to wallet (for testing)
router.post(
  '/:walletId/add-funds',
  param('walletId').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  body('description').optional().isString(),
  validate,
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

