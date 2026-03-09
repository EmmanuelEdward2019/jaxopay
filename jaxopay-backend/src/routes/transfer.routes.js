import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, query } from 'express-validator';
import {
    listBanks,
    resolveAccount,
    sendTransfer,
    getTransferHistory,
    getMerchantBalances,
} from '../controllers/transfer.controller.js';

const router = express.Router();

// All transfer routes require authentication
router.use(verifyToken);

// GET /transfers/banks?currency=NGN — list all banks
router.get('/banks', listBanks);

// GET /transfers/merchant-balances — Korapay merchant balances
router.get('/merchant-balances', getMerchantBalances);

// GET /transfers/history — user's transfer history
router.get(
    '/history',
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    validate,
    getTransferHistory
);

// POST /transfers/resolve — verify bank account
router.post(
    '/resolve',
    body('bank_code').isString().notEmpty(),
    body('account_number').isString().isLength({ min: 10, max: 18 }),
    body('currency').optional().isString().isLength({ min: 3, max: 6 }),
    validate,
    resolveAccount
);

// POST /transfers/send — send money to bank account (requires KYC Tier 1)
router.post(
    '/send',
    requireKYCTier(1),
    body('wallet_id').isUUID().withMessage('Valid wallet_id required'),
    body('bank_code').isString().notEmpty().withMessage('bank_code required'),
    body('account_number').isString().isLength({ min: 10, max: 18 }).withMessage('Valid account_number required'),
    body('account_name').isString().notEmpty().withMessage('account_name required'),
    body('amount').isFloat({ min: 100 }).withMessage('Minimum transfer amount is 100'),
    body('currency').optional().isString().isLength({ min: 3, max: 6 }),
    body('narration').optional().isString().isLength({ max: 100 }),
    validate,
    sendTransfer
);

export default router;
