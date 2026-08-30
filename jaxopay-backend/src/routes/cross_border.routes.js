import express from 'express';
import * as crossBorderController from '../controllers/cross_border.controller.js';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGuard.js';

const router = express.Router();

// Public webhook (no auth) — must be registered before verifyToken.
router.post('/webhook', crossBorderController.handleYellowCardWebhook);

router.use(verifyToken);

// Currency Rates
router.get('/rates', crossBorderController.getExchangeRate);

// Currency Swap
router.post('/swap', requireKYCTier(2), crossBorderController.swapCurrency);

// Payout destination metadata (Yellow Card)
router.get('/countries', crossBorderController.getPayoutCountries);
router.get('/networks', crossBorderController.getPayoutNetworks);

// International Payments
router.get('/transfers/international/fee-quote', crossBorderController.getInternationalTransferFeeQuote);
router.post('/transfers/international', requireFeature('withdrawals_fiat'), requireKYCTier(2), crossBorderController.sendInternationalPayment);

// Crypto on/off-ramp (Yellow Card Direct Settlement) — gated by its own toggle, separate from
// deposits_crypto/withdrawals_crypto which also gate plain (non-ramp) crypto deposits/withdraws
// in crypto.routes.js. /status and /options stay ungated so the frontend can still show a
// friendly "unavailable" state instead of erroring when the ramp is off.
router.get('/ramp/status', crossBorderController.getRampStatus);
router.get('/ramp/options', crossBorderController.getRampOptions);
router.post('/ramp/deposit', requireFeature('crypto_ramp'), requireKYCTier(2), crossBorderController.cryptoRampDeposit);
router.post('/ramp/withdraw', requireFeature('crypto_ramp'), requireKYCTier(2), crossBorderController.cryptoRampWithdraw);
router.get('/ramp/:id/status', crossBorderController.getRampTransactionStatus);

// Provider wallet balances (Yellow Card)
router.get('/balances', crossBorderController.getFxWalletBalances);

// Transaction Status
router.get('/transactions/:transactionId/status', crossBorderController.checkTransactionStatus);

export default router;
