import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { param, query } from 'express-validator';
import {
  getTransactions,
  getTransaction,
  getTransactionStats,
} from '../controllers/transaction.controller.js';

const router = express.Router();

// All transaction routes require authentication
router.use(verifyToken);

// Get transaction statistics
router.get(
  '/stats',
  query('period').optional().isInt({ min: 1, max: 365 }),
  validate,
  getTransactionStats
);

// Get all transactions
router.get(
  '/',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isString(),
  query('status').optional().isString(),
  query('currency').optional().isString(),
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  validate,
  getTransactions
);

// Get single transaction
router.get(
  '/:transactionId',
  param('transactionId').isUUID(),
  validate,
  getTransaction
);

export default router;

