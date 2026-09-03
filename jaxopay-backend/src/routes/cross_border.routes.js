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
// Path kept as-is (rather than renamed to match the handler) so bundles built before the
// rate-markup change keep getting a valid quote instead of a 404 — see the back-compat fields in
// CurrencyEngineService.getInternationalTransferQuote.
router.get('/transfers/international/fee-quote', crossBorderController.getInternationalTransferQuote);
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

// Payment Collection (receive money from a payer abroad) — gated by its own toggle so it can be
// turned off centrally if Yellow Card's /receive API misbehaves, mirroring crypto_ramp's toggle.
router.get('/collections/fee-quote', crossBorderController.getPaymentCollectionFeeQuote);
router.post('/collections', requireFeature('payment_collection'), requireKYCTier(2), crossBorderController.submitPaymentCollection);
router.get('/collections/:id/status', crossBorderController.getPaymentCollectionStatus);

// Provider wallet balances (Yellow Card)
router.get('/balances', crossBorderController.getFxWalletBalances);

// Transaction Status
router.get('/transactions/:transactionId/status', crossBorderController.checkTransactionStatus);

export default router;
