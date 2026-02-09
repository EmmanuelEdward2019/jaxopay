import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Get supported cryptocurrencies
export const getSupportedCryptos = catchAsync(async (req, res) => {
  const cryptos = [
    { symbol: 'BTC', name: 'Bitcoin', min_amount: 0.0001 },
    { symbol: 'ETH', name: 'Ethereum', min_amount: 0.001 },
    { symbol: 'USDT', name: 'Tether', min_amount: 1 },
    { symbol: 'BNB', name: 'Binance Coin', min_amount: 0.01 },
    { symbol: 'SOL', name: 'Solana', min_amount: 0.01 },
    { symbol: 'XRP', name: 'Ripple', min_amount: 1 },
    { symbol: 'USDC', name: 'USD Coin', min_amount: 1 },
    { symbol: 'ADA', name: 'Cardano', min_amount: 1 },
    { symbol: 'DOGE', name: 'Dogecoin', min_amount: 1 },
    { symbol: 'TRX', name: 'TRON', min_amount: 1 },
  ];

  res.status(200).json({
    success: true,
    data: cryptos,
  });
});

// Get exchange rates
export const getExchangeRates = catchAsync(async (req, res) => {
  const { from, to, from_currency, to_currency, amount } = req.query;
  const fromCurr = from || from_currency;
  const toCurr = to || to_currency;

  if (!fromCurr || !toCurr) {
    throw new AppError('From and to currencies are required', 400);
  }

  // In production, this would call CoinGecko/Binance API
  // For now, using mock rates
  const rate = await getMockExchangeRate(fromCurr, toCurr);
  const exchangeAmount = amount ? parseFloat(amount) * rate : null;

  res.status(200).json({
    success: true,
    data: {
      from: fromCurr.toUpperCase(),
      to: toCurr.toUpperCase(),
      rate,
      amount: amount ? parseFloat(amount) : null,
      exchange_amount: exchangeAmount,
      timestamp: new Date().toISOString(),
    },
  });
});

// Exchange crypto to fiat
export const exchangeCryptoToFiat = catchAsync(async (req, res) => {
  const { crypto_currency, fiat_currency, crypto_amount } = req.body;

  // Check KYC tier (Tier 2+ required for crypto)
  if (req.user.kyc_tier < 2) {
    throw new AppError(
      'KYC Tier 2 or higher required for crypto exchange',
      403
    );
  }

  if (crypto_amount <= 0) {
    throw new AppError('Amount must be greater than 0', 400);
  }

  const result = await transaction(async (client) => {
    // Get crypto wallet with lock
    const cryptoWallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND deleted_at IS NULL
       FOR UPDATE`,
      [req.user.id, crypto_currency.toUpperCase()]
    );

    if (cryptoWallet.rows.length === 0) {
      throw new AppError(`No ${crypto_currency} wallet found`, 404);
    }

    if (parseFloat(cryptoWallet.rows[0].balance) < crypto_amount) {
      throw new AppError('Insufficient crypto balance', 400);
    }

    // Get exchange rate
    const rate = await getMockExchangeRate(crypto_currency, fiat_currency);
    const fiatAmount = crypto_amount * rate;
    const fee = fiatAmount * 0.01; // 1% fee
    const netAmount = fiatAmount - fee;

    // Get or create fiat wallet
    let fiatWallet = await client.query(
      `SELECT id FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'fiat' AND deleted_at IS NULL`,
      [req.user.id, fiat_currency.toUpperCase()]
    );

    if (fiatWallet.rows.length === 0) {
      fiatWallet = await client.query(
        `INSERT INTO wallets (user_id, currency, wallet_type, balance)
         VALUES ($1, $2, 'fiat', 0)
         RETURNING id`,
        [req.user.id, fiat_currency.toUpperCase()]
      );
    }

    // Deduct crypto
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [crypto_amount, cryptoWallet.rows[0].id]
    );

    // Add fiat
    await client.query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [netAmount, fiatWallet.rows[0].id]
    );

    // Create crypto transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'crypto_sell', $2, $3, 'completed', 'Crypto to fiat exchange', $4)`,
      [
        cryptoWallet.rows[0].id,
        crypto_amount,
        crypto_currency.toUpperCase(),
        JSON.stringify({
          exchange_rate: rate,
          fiat_currency: fiat_currency.toUpperCase(),
          fiat_amount: fiatAmount,
          fee,
          net_amount: netAmount,
        }),
      ]
    );

    // Create fiat transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'crypto_exchange', $2, $3, 'completed', 'Crypto exchange credit', $4)`,
      [
        fiatWallet.rows[0].id,
        netAmount,
        fiat_currency.toUpperCase(),
        JSON.stringify({
          crypto_currency: crypto_currency.toUpperCase(),
          crypto_amount,
          exchange_rate: rate,
          fee,
        }),
      ]
    );

    return { rate, fiatAmount, fee, netAmount };
  });

  logger.info('Crypto to fiat exchange:', {
    userId: req.user.id,
    from: crypto_currency,
    to: fiat_currency,
    amount: crypto_amount,
  });

  res.status(200).json({
    success: true,
    message: 'Exchange completed successfully',
    data: {
      crypto_amount,
      crypto_currency: crypto_currency.toUpperCase(),
      fiat_amount: result.fiatAmount,
      fiat_currency: fiat_currency.toUpperCase(),
      exchange_rate: result.rate,
      fee: result.fee,
      net_amount: result.netAmount,
    },
  });
});

// Exchange fiat to crypto
export const exchangeFiatToCrypto = catchAsync(async (req, res) => {
  const { fiat_currency, crypto_currency, fiat_amount } = req.body;

  // Check KYC tier
  if (req.user.kyc_tier < 2) {
    throw new AppError(
      'KYC Tier 2 or higher required for crypto exchange',
      403
    );
  }

  if (fiat_amount <= 0) {
    throw new AppError('Amount must be greater than 0', 400);
  }

  const result = await transaction(async (client) => {
    // Get fiat wallet with lock
    const fiatWallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'fiat' AND deleted_at IS NULL
       FOR UPDATE`,
      [req.user.id, fiat_currency.toUpperCase()]
    );

    if (fiatWallet.rows.length === 0) {
      throw new AppError(`No ${fiat_currency} wallet found`, 404);
    }

    if (parseFloat(fiatWallet.rows[0].balance) < fiat_amount) {
      throw new AppError('Insufficient fiat balance', 400);
    }

    // Get exchange rate
    const rate = await getMockExchangeRate(fiat_currency, crypto_currency);
    const cryptoAmount = fiat_amount * rate;
    const fee = fiat_amount * 0.01; // 1% fee
    const netFiat = fiat_amount + fee;

    if (parseFloat(fiatWallet.rows[0].balance) < netFiat) {
      throw new AppError('Insufficient balance to cover fees', 400);
    }

    // Get or create crypto wallet
    let cryptoWallet = await client.query(
      `SELECT id FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND deleted_at IS NULL`,
      [req.user.id, crypto_currency.toUpperCase()]
    );

    if (cryptoWallet.rows.length === 0) {
      cryptoWallet = await client.query(
        `INSERT INTO wallets (user_id, currency, wallet_type, balance)
         VALUES ($1, $2, 'crypto', 0)
         RETURNING id`,
        [req.user.id, crypto_currency.toUpperCase()]
      );
    }

    // Deduct fiat (including fee)
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [netFiat, fiatWallet.rows[0].id]
    );

    // Add crypto
    await client.query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [cryptoAmount, cryptoWallet.rows[0].id]
    );

    // Create fiat transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'crypto_buy', $2, $3, 'completed', 'Fiat to crypto exchange', $4)`,
      [
        fiatWallet.rows[0].id,
        netFiat,
        fiat_currency.toUpperCase(),
        JSON.stringify({
          exchange_rate: rate,
          crypto_currency: crypto_currency.toUpperCase(),
          crypto_amount: cryptoAmount,
          fee,
        }),
      ]
    );

    // Create crypto transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'crypto_exchange', $2, $3, 'completed', 'Crypto purchase', $4)`,
      [
        cryptoWallet.rows[0].id,
        cryptoAmount,
        crypto_currency.toUpperCase(),
        JSON.stringify({
          fiat_currency: fiat_currency.toUpperCase(),
          fiat_amount,
          exchange_rate: rate,
          fee,
        }),
      ]
    );

    return { rate, cryptoAmount, fee };
  });

  logger.info('Fiat to crypto exchange:', {
    userId: req.user.id,
    from: fiat_currency,
    to: crypto_currency,
    amount: fiat_amount,
  });

  res.status(200).json({
    success: true,
    message: 'Exchange completed successfully',
    data: {
      fiat_amount,
      fiat_currency: fiat_currency.toUpperCase(),
      crypto_amount: result.cryptoAmount,
      crypto_currency: crypto_currency.toUpperCase(),
      exchange_rate: result.rate,
      fee: result.fee,
    },
  });
});

// Get crypto exchange history
export const getExchangeHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT wt.id, wt.transaction_type, wt.amount, wt.currency, wt.status,
            wt.description, wt.metadata, wt.created_at
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE w.user_id = $1
       AND wt.transaction_type IN ('crypto_buy', 'crypto_sell', 'crypto_exchange')
     ORDER BY wt.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE w.user_id = $1
       AND wt.transaction_type IN ('crypto_buy', 'crypto_sell', 'crypto_exchange')`,
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    data: {
      exchanges: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Mock exchange rate function (replace with real API in production)
async function getMockExchangeRate(from, to) {
  const rates = {
    BTC_USD: 45000,
    ETH_USD: 2500,
    USDT_USD: 1,
    BNB_USD: 300,
    SOL_USD: 100,
    XRP_USD: 0.5,
    USDC_USD: 1,
    ADA_USD: 0.4,
    DOGE_USD: 0.08,
    TRX_USD: 0.1,
    USD_BTC: 1 / 45000,
    USD_ETH: 1 / 2500,
    USD_BNB: 1 / 300,
    USD_SOL: 1 / 100,
  };

  const key = `${from.toUpperCase()}_${to.toUpperCase()}`;
  const reverseKey = `${to.toUpperCase()}_${from.toUpperCase()}`;

  if (rates[key]) {
    return rates[key];
  } else if (rates[reverseKey]) {
    return 1 / rates[reverseKey];
  }

  return 1; // Default rate
}

