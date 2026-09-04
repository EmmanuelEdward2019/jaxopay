import { AppError, catchAsync } from '../middleware/errorHandler.js';
import currencyEngine from '../services/CurrencyEngineService.js';
import { verifyTransactionPin } from '../services/transactionPin.service.js';
import { auditFromReq } from '../services/audit.service.js';
import logger from '../utils/logger.js';
import { assertDepositsAllowed, assertWithdrawalsAllowed } from '../services/financialControls.service.js';
import { getYcMarkupPercentage, applyYcMarkup, YC_MARKUP_PRODUCTS } from '../services/ycMarkup.service.js';

// The customer-facing rate for a pair — marked up, never Yellow Card's raw rate, so a preview can
// never quote better than what actually executes.
//
// Swap and International Transfer are priced independently, so the caller must say which one it's
// quoting for: ?product=yc_swap (default) or yc_international_transfer. Getting this wrong shows a
// rate from the other product's markup — which is exactly what happened when the Global Finance
// rate strip and RN's transfer form both defaulted to the swap markup and so never reflected a
// transfer markup at all.
export const getExchangeRate = catchAsync(async (req, res) => {
    const { from, to, product } = req.query;
    if (!from || !to) throw new AppError('params from and to are required', 400);

    const forProduct = YC_MARKUP_PRODUCTS.includes(product) ? product : 'yc_swap';
    const rateData = await currencyEngine.getRate(from, to);
    const markupPct = await getYcMarkupPercentage(forProduct, from, to);
    res.status(200).json({
        success: true,
        data: {
            ...rateData,
            rate: applyYcMarkup(parseFloat(rateData.rate), markupPct),
            product: forProduct,
        },
    });
});

// Read-only preview of what sendInternationalPayment will do — the customer rate and what the
// recipient receives. There is no fee to disclose: JAXOPAY's margin is inside the rate, and the
// sender is debited exactly the amount they entered.
export const getInternationalTransferQuote = catchAsync(async (req, res) => {
    const { fromCurrency, toCurrency, amount } = req.query;
    if (!fromCurrency || !toCurrency || !amount) {
        throw new AppError('params fromCurrency, toCurrency and amount are required', 400);
    }
    const quote = await currencyEngine.getInternationalTransferQuote(fromCurrency, toCurrency, parseFloat(amount));
    res.status(200).json({ success: true, data: quote });
});

export const swapCurrency = catchAsync(async (req, res) => {
    const { fromCurrency, toCurrency, amount } = req.body;
    if (!fromCurrency || !toCurrency || !amount) {
        throw new AppError('Missing required swap parameters', 400);
    }

    const result = await currencyEngine.swapCurrency(req.user.id, fromCurrency, toCurrency, amount);
    auditFromReq(req, { action: 'currency_swap', entityType: 'fx_transaction', entityId: result?.transactionId || null, newValues: { fromCurrency, toCurrency, amount } });
    res.status(200).json({ success: true, data: result });
});

export const sendInternationalPayment = catchAsync(async (req, res) => {
    const b = req.body;

    if (!b.amount || !b.currency || !b.recipientCountry || !b.recipientName || !b.accountNumber || !b.networkId) {
        throw new AppError('Missing required transfer parameters (amount, currency, recipientCountry, recipientName, accountNumber, networkId)', 400);
    }

    await assertWithdrawalsAllowed(req.user.id, 'fiat');

    // Require the transaction PIN — this moves money out of the user's wallet.
    await verifyTransactionPin(req.user.id, b.pin);

    const mappedPayload = {
        fromCurrency: b.currency,                          // user's wallet currency
        targetCurrency: b.targetCurrency || b.currency,     // destination local currency
        amount: parseFloat(b.amount),
        recipientName: b.recipientName,
        accountNumber: b.accountNumber,
        recipientCountry: b.recipientCountry,               // ISO2, e.g. NG
        networkId: b.networkId,
        networkName: b.networkName,
        networkAccountType: b.networkAccountType,           // 'bank' | 'phone'
        networkChannelIds: b.networkChannelIds,
    };

    const result = await currencyEngine.sendInternationalPayment(req.user.id, mappedPayload);
    auditFromReq(req, { action: 'international_transfer', entityType: 'fx_transaction', entityId: result?.transactionId || null, newValues: { amount: mappedPayload.amount, currency: mappedPayload.fromCurrency, country: mappedPayload.recipientCountry, recipient: mappedPayload.recipientName } });
    res.status(200).json({ success: true, data: result });
});

// ── Payment Collection (receive money from a payer abroad) ──────────────────────

// Read-only preview of the fee submitPaymentCollection will charge, before the user submits.
export const getPaymentCollectionFeeQuote = catchAsync(async (req, res) => {
    const { userCurrency, amount } = req.query;
    if (!userCurrency || !amount) {
        throw new AppError('params userCurrency and amount are required', 400);
    }
    const quote = await currencyEngine.getPaymentCollectionFeeQuote(userCurrency, parseFloat(amount));
    res.status(200).json({ success: true, data: quote });
});

// Submit a receive request — no wallet debit happens here (nothing is at risk until the payer
// actually pays), so unlike swap/transfer/ramp this doesn't require the transaction PIN.
export const submitPaymentCollection = catchAsync(async (req, res) => {
    const b = req.body;
    if (!b.userCurrency || !b.amount || !b.payerCountry || !b.payerCurrency || !b.channelType || !b.payer || !b.networkId) {
        throw new AppError('Missing required parameters (userCurrency, amount, payerCountry, payerCurrency, channelType, payer, networkId)', 400);
    }
    await assertDepositsAllowed(req.user.id, 'fiat');
    const result = await currencyEngine.submitPaymentCollection(req.user.id, {
        userCurrency: b.userCurrency,
        amountLocal: parseFloat(b.amount),
        payerCountry: b.payerCountry,
        payerCurrency: b.payerCurrency,
        channelType: b.channelType,
        payer: b.payer,
        networkId: b.networkId,
        accountNumber: b.accountNumber,
    });
    auditFromReq(req, { action: 'payment_collection', entityType: 'fx_transaction', entityId: result?.transactionId || null, newValues: { amount: b.amount, currency: b.userCurrency, payerCountry: b.payerCountry } });
    res.status(200).json({ success: true, data: result });
});

// Live status of a payment collection — reconciles against Yellow Card, so no admin/webhook
// dependency is needed for the frontend's poll loop to see the final result.
export const getPaymentCollectionStatus = catchAsync(async (req, res) => {
    const result = await currencyEngine.reconcilePaymentCollection(req.params.id);
    if (!result) throw new AppError('Payment collection request not found', 404);
    res.status(200).json({ success: true, data: { status: result } });
});

// Supported payout countries (from active Yellow Card withdraw channels)
export const getPayoutCountries = catchAsync(async (req, res) => {
    const data = await currencyEngine.getPayoutCountries();
    res.status(200).json({ success: true, data });
});

// Banks / mobile-money networks for a destination country (recipient picker)
export const getPayoutNetworks = catchAsync(async (req, res) => {
    const { country } = req.query;
    if (!country) throw new AppError('country query parameter is required', 400);
    const data = await currencyEngine.getPayoutNetworks(country);
    res.status(200).json({ success: true, data });
});

// ── Crypto on/off-ramp (Yellow Card Direct Settlement) ──────────────────────────

// Ramp eligibility for the current user (NG users must have a verified BVN/NIN).
export const getRampStatus = catchAsync(async (req, res) => {
    const kyc = await currencyEngine.getRampKycStatus(req.user.id);
    res.status(200).json({ success: true, data: kyc });
});

// Supported stablecoins + networks (catalog for the ramp UI).
export const getRampOptions = catchAsync(async (req, res) => {
    const data = await currencyEngine.getRampOptions(req.query.currency || 'NGN');
    res.status(200).json({ success: true, data });
});

// Buy USDT/USDC with fiat (on-ramp). Debits the user's fiat wallet; ops settles, admin confirms.
export const cryptoRampDeposit = catchAsync(async (req, res) => {
    const b = req.body;
    if (!b.cryptoCurrency || !b.cryptoNetwork || !b.fiatAmount) {
        throw new AppError('Missing required parameters (cryptoCurrency, cryptoNetwork, fiatAmount)', 400);
    }
    await assertDepositsAllowed(req.user.id, 'crypto');
    await verifyTransactionPin(req.user.id, b.pin);
    const result = await currencyEngine.cryptoRampDeposit(req.user.id, {
        cryptoCurrency: b.cryptoCurrency, cryptoNetwork: b.cryptoNetwork, fiatAmount: parseFloat(b.fiatAmount),
        mode: b.mode, fiatCurrency: b.fiatCurrency || 'NGN', country: b.country || 'NG',
        walletAddress: b.walletAddress, walletTag: b.walletTag,
    });
    auditFromReq(req, { action: 'crypto_onramp', entityType: 'fx_transaction', entityId: result?.rampId || null, newValues: { fiatAmount: b.fiatAmount, cryptoCurrency: b.cryptoCurrency, mode: result?.mode } });
    res.status(200).json({ success: true, data: result });
});

// Sell USDT/USDC for fiat (off-ramp). Debits the user's crypto wallet; ops settles, admin confirms.
export const cryptoRampWithdraw = catchAsync(async (req, res) => {
    const b = req.body;
    if (!b.cryptoCurrency || !b.cryptoNetwork || !b.cryptoAmount) {
        throw new AppError('Missing required parameters (cryptoCurrency, cryptoNetwork, cryptoAmount)', 400);
    }
    // Bank details are only needed when paying out to an external bank; internal credits the wallet.
    if (b.mode === 'external' && (!b.networkId || !b.accountNumber || !b.recipientName)) {
        throw new AppError('Recipient bank details are required (networkId, accountNumber, recipientName)', 400);
    }
    await assertWithdrawalsAllowed(req.user.id, 'crypto');
    await verifyTransactionPin(req.user.id, b.pin);
    const result = await currencyEngine.cryptoRampWithdraw(req.user.id, {
        cryptoCurrency: b.cryptoCurrency, cryptoNetwork: b.cryptoNetwork, cryptoAmount: parseFloat(b.cryptoAmount),
        mode: b.mode, destinationCountry: b.destinationCountry || 'NG', fiatCurrency: b.fiatCurrency || 'NGN',
        recipientName: b.recipientName, accountNumber: b.accountNumber, networkId: b.networkId,
        networkName: b.networkName, networkAccountType: b.networkAccountType, networkChannelIds: b.networkChannelIds,
        refundAddress: b.refundAddress,
    });
    auditFromReq(req, { action: 'crypto_offramp', entityType: 'fx_transaction', entityId: result?.rampId || null, newValues: { cryptoAmount: b.cryptoAmount, cryptoCurrency: b.cryptoCurrency, mode: result?.mode } });
    res.status(200).json({ success: true, data: result });
});

// Live status of a ramp — reconciles against Yellow Card, so no admin click is needed.
export const getRampTransactionStatus = catchAsync(async (req, res) => {
    const result = await currencyEngine.reconcileRamp(req.params.id, req.user.id);
    if (!result) throw new AppError('Ramp not found', 404);
    res.status(200).json({ success: true, data: result });
});

export const getFxWalletBalances = catchAsync(async (req, res) => {
    const balances = await currencyEngine.getWalletBalances();
    res.status(200).json({ success: true, data: balances });
});

export const checkTransactionStatus = catchAsync(async (req, res) => {
    const { transactionId } = req.params;
    const status = await currencyEngine.checkStatus(transactionId);
    res.status(200).json({ success: true, data: status });
});

// Public Yellow Card webhook — reconciles payout status (refund on async failure).
// We re-fetch the authoritative status from YC, so an unsigned/forged call can't cause harm.
export const handleYellowCardWebhook = catchAsync(async (req, res) => {
    const b = req.body || {};
    const paymentId = b.id || b.paymentId || b.data?.id || b.payment?.id || b.data?.paymentId;
    logger.info('[YC webhook] received', { paymentId, event: b.event || b.type });
    if (paymentId) {
        // A payout/transfer, a crypto ramp, OR a payment collection — try all reconcilers
        // (each no-ops if it isn't theirs).
        await currencyEngine.reconcileYcPayment(paymentId).catch((e) => logger.error('[YC webhook] payout reconcile error:', e.message));
        await currencyEngine.reconcileRamp(paymentId).catch((e) => logger.error('[YC webhook] ramp reconcile error:', e.message));
        await currencyEngine.reconcilePaymentCollection(paymentId).catch((e) => logger.error('[YC webhook] collection reconcile error:', e.message));
    }
    res.status(200).json({ success: true });
});
