import express from 'express';
import { getDashboardSummary } from '../controllers/dashboard.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get dashboard summary (wallets, transactions, stats in one call)
router.get('/summary', getDashboardSummary);

export default router;
