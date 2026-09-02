import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { param, query, body } from 'express-validator';
import {
  getTransactions,
  getTransaction,
  getTransactionStats,
  getStatementSummary,
  downloadStatementPDF,
  downloadStatementCSV,
  emailStatement,
} from '../controllers/transaction.controller.js';

const router = express.Router();

// All transaction routes require authentication
router.use(verifyToken);

// Get transaction statistics
router.get(
  '/statistics',
  query('period').optional().isString(),
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

// Statement — filters shared across all four (preset required; direction/category default to
// 'all'; start_date/end_date only used when preset='custom'). Registered before /:transactionId
// so "statement" is never mistaken for a transaction id.
const statementFilters = [
  query('preset').isIn(['today', 'this_week', 'last_7_days', 'this_month', 'last_month', 'last_30_days', '6_months', '1_year', 'custom']),
  query('direction').optional().isIn(['all', 'credit', 'debit']),
  query('category').optional().isIn(['all', 'fiat', 'crypto', 'swap', 'bills']),
  query('start_date').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
];
router.get('/statement/summary', ...statementFilters, validate, getStatementSummary);
router.get('/statement/pdf', ...statementFilters, validate, downloadStatementPDF);
router.get('/statement/csv', ...statementFilters, validate, downloadStatementCSV);
router.post(
  '/statement/email',
  body('preset').isIn(['today', 'this_week', 'last_7_days', 'this_month', 'last_month', 'last_30_days', '6_months', '1_year', 'custom']),
  body('direction').optional().isIn(['all', 'credit', 'debit']),
  body('category').optional().isIn(['all', 'fiat', 'crypto', 'swap', 'bills']),
  body('start_date').optional().isISO8601(),
  body('end_date').optional().isISO8601(),
  body('format').optional().isIn(['pdf', 'csv']),
  validate,
  emailStatement
);

// Get single transaction
router.get(
  '/:transactionId',
  param('transactionId').isUUID(),
  validate,
  getTransaction
);

export default router;

