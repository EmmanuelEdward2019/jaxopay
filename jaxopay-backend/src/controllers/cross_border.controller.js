import { AppError, catchAsync } from '../middleware/errorHandler.js';
import currencyEngine from '../services/CurrencyEngineService.js';
import logger from '../utils/logger.js';

export const getExchangeRate = catchAsync(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) throw new AppError('params from and to are required', 400);

    const rate = await currencyEngine.getRate(from, to);
    res.status(200).json({ success: true, data: rate });
});

export const swapCurrency = catchAsync(async (req, res) => {
    const { fromCurrency, toCurrency, amount } = req.body;
    if (!fromCurrency || !toCurrency || !amount) {
        throw new AppError('Missing required swap parameters', 400);
    }

    const result = await currencyEngine.swapCurrency(req.user.id, fromCurrency, toCurrency, amount);
    res.status(200).json({ success: true, data: result });
});

export const sendInternationalPayment = catchAsync(async (req, res) => {
    const payload = req.body;

    if (!payload.amount || !payload.currency || !payload.destinationCountry || !payload.recipientName || !payload.recipientBank || !payload.accountNumber) {
        throw new AppError('Missing required transfer parameters', 400);
    }

    // Format payload properties mapping
    const mappedPayload = {
        fromCurrency: payload.currency,
        targetCurrency: payload.targetCurrency || payload.currency,
        amount: parseFloat(payload.amount),
        recipientName: payload.recipientName,
        recipientBank: payload.recipientBank,
        accountNumber: payload.accountNumber,
        recipientCountry: payload.destinationCountry
    };

    const result = await currencyEngine.sendInternationalPayment(req.user.id, mappedPayload);
    res.status(200).json({ success: true, data: result });
});

export const getGraphWalletBalances = catchAsync(async (req, res) => {
    const balances = await currencyEngine.getWalletBalances();
    res.status(200).json({ success: true, data: balances });
});

export const checkTransactionStatus = catchAsync(async (req, res) => {
    const { transactionId } = req.params;
    const status = await currencyEngine.checkStatus(transactionId);
    res.status(200).json({ success: true, data: status });
});
