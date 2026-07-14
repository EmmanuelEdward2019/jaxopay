import express from 'express';
import * as crossBorderController from '../controllers/cross_border.controller.js';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';

const router = express.Router();

// Public webhook (no auth) — must be registered before verifyToken.
router.post('/webhook', crossBorderController.handleYellowCardWebhook);

router.use(verifyToken);

// Currency Rates
router.get('/rates', crossBorderController.getExchangeRate);

// Currency Swap
router.post('/swap', requireKYCTier(1), crossBorderController.swapCurrency);

// Payout destination metadata (Yellow Card)
router.get('/countries', crossBorderController.getPayoutCountries);
router.get('/networks', crossBorderController.getPayoutNetworks);

// International Payments
router.post('/transfers/international', requireKYCTier(1), crossBorderController.sendInternationalPayment);

// Crypto on/off-ramp (Yellow Card Direct Settlement)
router.get('/ramp/status', crossBorderController.getRampStatus);
router.get('/ramp/options', crossBorderController.getRampOptions);
router.post('/ramp/deposit', requireKYCTier(1), crossBorderController.cryptoRampDeposit);
router.post('/ramp/withdraw', requireKYCTier(1), crossBorderController.cryptoRampWithdraw);
router.get('/ramp/:id/status', crossBorderController.getRampTransactionStatus);

// Provider wallet balances (Yellow Card)
router.get('/balances', crossBorderController.getFxWalletBalances);

// Transaction Status
router.get('/transactions/:transactionId/status', crossBorderController.checkTransactionStatus);

export default router;
