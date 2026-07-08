import express from 'express';
import * as crossBorderController from '../controllers/cross_border.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Public webhook (no auth) — must be registered before verifyToken.
router.post('/webhook', crossBorderController.handleYellowCardWebhook);

router.use(verifyToken);

// Currency Rates
router.get('/rates', crossBorderController.getExchangeRate);

// Currency Swap
router.post('/swap', crossBorderController.swapCurrency);

// Payout destination metadata (Yellow Card)
router.get('/countries', crossBorderController.getPayoutCountries);
router.get('/networks', crossBorderController.getPayoutNetworks);

// International Payments
router.post('/transfers/international', crossBorderController.sendInternationalPayment);

// Crypto on/off-ramp (Yellow Card Direct Settlement)
router.get('/ramp/status', crossBorderController.getRampStatus);
router.get('/ramp/options', crossBorderController.getRampOptions);
router.post('/ramp/deposit', crossBorderController.cryptoRampDeposit);
router.post('/ramp/withdraw', crossBorderController.cryptoRampWithdraw);

// Wallet Balances (Graph)
router.get('/balances', crossBorderController.getGraphWalletBalances);

// Transaction Status
router.get('/transactions/:transactionId/status', crossBorderController.checkTransactionStatus);

export default router;
