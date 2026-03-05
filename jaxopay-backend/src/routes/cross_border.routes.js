import express from 'express';
import * as crossBorderController from '../controllers/cross_border.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

// Currency Rates
router.get('/rates', crossBorderController.getExchangeRate);

// Currency Swap
router.post('/swap', crossBorderController.swapCurrency);

// International Payments
router.post('/transfers/international', crossBorderController.sendInternationalPayment);

// Wallet Balances (Graph)
router.get('/balances', crossBorderController.getGraphWalletBalances);

// Transaction Status
router.get('/transactions/:transactionId/status', crossBorderController.checkTransactionStatus);

export default router;
