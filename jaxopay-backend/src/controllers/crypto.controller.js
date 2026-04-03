import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import fxService from '../orchestration/adapters/fx/GraphFinanceService.js';

const usdRates = {
  BTC: 93450, ETH: 3620, USDT: 1.0, BNB: 685, SOL: 242,
  XRP: 1.6, USDC: 1.0, ADA: 0.8, DOGE: 0.4, TRX: 0.2,
  USD: 1.0, NGN: 1 / 1650, EUR: 1.05, GBP: 1.25
};

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

  const rate = await getLiveExchangeRate(fromCurr, toCurr);
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
  const { crypto_currency, fiat_currency, crypto_amount, coin, amount, fiat } = req.body;
  const from_coin = crypto_currency || coin;
  const to_fiat = fiat_currency || fiat;
  const qty = crypto_amount || amount;

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

    if (parseFloat(cryptoWallet.rows[0].balance) < qty) {
      throw new AppError('Insufficient crypto balance', 400);
    }

    // Get exchange rate (Live from Quidax)
    const rate = await getLiveExchangeRate(from_coin, to_fiat);
    const fiatAmount = qty * rate;
    const fee = fiatAmount * 0.01; // 1% fee
    const netAmount = fiatAmount - fee;

    // Get or create fiat wallet
    let fiatWallet = await client.query(
      `SELECT id FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'fiat' AND deleted_at IS NULL`,
      [req.user.id, to_fiat.toUpperCase()]
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

    // Optional: Synchronize Liquidity with Quidax
    let quidaxSwapId = null;
    try {
      if (process.env.QUIDAX_SECRET_KEY) {
        // Use Instant Swap for liquidity
        const quote = await quidax.getSwapQuote({
          from: crypto_currency,
          to: fiat_currency,
          amount: crypto_amount,
          side: 'from'
        });
        if (quote && quote.id) {
          const swap = await quidax.executeSwap(quote.id);
          quidaxSwapId = swap.id;
        }
      }
    } catch (e) {
      logger.warn('[Exchange] Quidax Swap Sync Failed (Processed internally):', e.message);
    }

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
          quidax_swap_id: quidaxSwapId,
          source: 'quidax_live'
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
  const { fiat_currency, crypto_currency, fiat_amount, fiat, coin, amount } = req.body;
  const from_fiat = fiat_currency || fiat;
  const to_coin = crypto_currency || coin;
  const qty = fiat_amount || amount;

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

    if (parseFloat(fiatWallet.rows[0].balance) < qty) {
      throw new AppError('Insufficient fiat balance', 400);
    }

    // Get exchange rate (Live from Quidax)
    const rate = await getLiveExchangeRate(from_fiat, to_coin);
    const cryptoAmount = qty * rate;
    const fee = qty * 0.01; // 1% fee
    const netFiat = qty + fee;

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

    // Optional: Synchronize Liquidity with Quidax
    let quidaxSwapId = null;
    try {
      if (process.env.QUIDAX_SECRET_KEY) {
        const quote = await quidax.getSwapQuote({
          from: fiat_currency,
          to: crypto_currency,
          amount: fiat_amount,
          side: 'from'
        });
        if (quote && quote.id) {
          const swap = await quidax.executeSwap(quote.id);
          quidaxSwapId = swap.id;
        }
      }
    } catch (e) {
      logger.warn('[Exchange] Quidax Swap Sync Failed (Processed internally):', e.message);
    }

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
          quidax_swap_id: quidaxSwapId,
          source: 'quidax_live'
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

/**
 * Get Live Exchange Rate using MEXC for Crypto 
 * and Graph Finance for Fiat bridges.
 */
async function getLiveExchangeRate(from, to) {
  from = from.toUpperCase();
  to = to.toUpperCase();
  const cryptoAssets = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'USDC', 'ADA', 'DOGE', 'TRX'];
  const isFromCrypto = cryptoAssets.includes(from);
  const isToCrypto = cryptoAssets.includes(to);

  try {
    // 1. Try Quidax Swap Quote (Most accurate for instant swaps)
    try {
      if (isFromCrypto || isToCrypto) {
         const quote = await quidax.getSwapQuote({
           from: from,
           to: to,
           amount: 1,
           side: 'from'
         });
         // Handle both 'rate' and 'price' fields in Quidax response
         if (quote && (quote.rate || quote.price)) {
            return parseFloat(quote.rate || quote.price);
         }
      }
    } catch (e) {
      logger.debug(`[ExchangeRate] Swap Quote failed for ${from}->${to}:`, e.message);
    }

    // 2. Try Quidax (Ticker)
    let rate = await quidax.getExchangeRate(from, to);
    if (rate !== null && rate > 0) return rate;

    // 3. Bridging Logic
    // Case: Crypto to Crypto (Bridge through USDT)
    if (isFromCrypto && isToCrypto) {
       const u_from = (await quidax.getExchangeRate(from, 'USDT')) || (usdRates[from] || 1.0);
       const u_to = (await quidax.getExchangeRate(to, 'USDT')) || (usdRates[to] || 1.0);
       return u_from / u_to;
    }

    // Case: Crypto to Fiat (Bridge through USD)
    if (isFromCrypto && !isToCrypto) {
      const cryptoInUsd = (await quidax.getExchangeRate(from, 'USDT')) || (usdRates[from] || 1.0);
      const usdInFiat = (await fxService.getExchangeRate('USD', to))?.rate || (to === 'NGN' ? 1650 : 1.0);
      return cryptoInUsd * usdInFiat;
    }

    // Case: Fiat to Crypto (Bridge through USD)
    if (!isFromCrypto && isToCrypto) {
      const fiatInUsd = (await fxService.getExchangeRate(from, 'USD'))?.rate || (from === 'NGN' ? 1 / 1650 : 1.0);
      const usdInCrypto = 1 / ((await quidax.getExchangeRate(to, 'USDT')) || (usdRates[to] || 1.0));
      return fiatInUsd * usdInCrypto;
    }

    // Case: Fiat to Fiat
    if (!isFromCrypto && !isToCrypto) {
      const res = await fxService.getExchangeRate(from, to);
      return res.rate;
    }

    // Final Fallback to older mock logic
    return await getMockExchangeRate(from, to);
  } catch (err) {
    logger.error(`[ExchangeRate] Error fetching live rate for ${from}->${to}:`, err.message);
    return await getMockExchangeRate(from, to);
  }
}

// Fallback logic for safety
async function getMockExchangeRate(from, to) {
  const f = usdRates[from.toUpperCase()] || 1.0;
  const t = usdRates[to.toUpperCase()] || 1.0;
  return f / t;
}

// Get deposit address for crypto
export const getCryptoDepositAddress = catchAsync(async (req, res) => {
  const { coin, network } = req.query;

  if (!coin) {
    throw new AppError('Coin symbol is required', 400);
  }

  try {
    const dataResponse = await quidax.getDepositAddress(coin.toLowerCase());
    // Direct Quidax mapping: data.data.address
    const addressData = dataResponse?.data || dataResponse;
    const address = addressData.address;
    const tag = addressData.tag || addressData.memo || '';

    // Persist to DB for webhook matching
    await query(
      'UPDATE wallets SET crypto_address = $1, crypto_tag = $2, updated_at = NOW() WHERE user_id = $3 AND currency = $4 AND wallet_type = \'crypto\'',
      [address, tag, req.user.id, coin.toUpperCase()]
    );

    res.status(200).json({
      success: true,
      data: {
        address,
        coin: coin.toUpperCase(),
        tag,
        memo: tag,
        network: addressData.network || network || 'Default',
      }
    });
  } catch (err) {
    logger.error(`[CryptoDeposit] Quidax Failed for ${coin}:`, err.message);

    // Provide a mock address as fallback if not in production or keys missing
    if (process.env.NODE_ENV !== 'production' || err.message.includes('not configured')) {
      logger.info(`[CryptoDeposit] Providing MOCK fallback for ${coin} on ${network || 'default'}`);

      const mockAddresses = {
        'BTC': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'ETH': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        'USDT': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        'USDC': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        'SOL': '7xKXdg2MCNqzh3qwzqBYfy7QhNVv2XNdx8m6YmYV7yL',
        'TRX': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
      };

      const address = mockAddresses[coin.toUpperCase()] || `mock_${coin.toLowerCase()}_address_${Math.random().toString(36).substring(7)}`;

      return res.status(200).json({
        success: true,
        data: {
          address,
          coin: coin.toUpperCase(),
          tag: '',
          memo: '',
          network: network || 'Default',
          is_mock: true
        }
      });
    }

    throw new AppError(err.message || 'Failed to generate deposit address', err.statusCode || 500);
  }
});

// Withdraw crypto to external wallet
export const withdrawCrypto = catchAsync(async (req, res) => {
  const { coin, network, address, amount, memo } = req.body;

  if (req.user.kyc_tier < 2) {
    throw new AppError('KYC Tier 2 or higher required for crypto withdrawals', 403);
  }

  if (!coin || !address || !amount) {
    throw new AppError('Coin, address, and amount are required', 400);
  }

  const result = await transaction(async (client) => {
    // 1. Get wallet and lock
    const wallet = await client.query(
      `SELECT id, balance FROM wallets 
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND deleted_at IS NULL
       FOR UPDATE`,
      [req.user.id, coin.toUpperCase()]
    );

    if (wallet.rows.length === 0) {
      throw new AppError(`No ${coin} wallet found`, 404);
    }

    if (parseFloat(wallet.rows[0].balance) < amount) {
      throw new AppError('Insufficient balance for withdrawal', 400);
    }

    // 2. Perform withdrawal on Quidax
    let quidaxWithdrawId = null;
    try {
      const withdrawRes = await quidax.withdraw({
        currency: coin,
        network,
        fund_uid: address,
        amount,
        fund_uid2: memo
      });
      quidaxWithdrawId = withdrawRes?.data?.id || withdrawRes?.id;
    } catch (err) {
      logger.error(`[CryptoWithdraw] Quidax Failed:`, err.message);
      throw new AppError(`External withdrawal failed: ${err.message}`, 502);
    }

    // 3. Deduct from local wallet
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [amount, wallet.rows[0].id]
    );

    // 4. Record transaction
    const txResult = await client.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'withdrawal', $2, $3, 'pending', $4, $5)
       RETURNING id`,
      [
        wallet.rows[0].id,
        amount,
        coin.toUpperCase(),
        `Withdrawal to ${address}`,
        JSON.stringify({
          network,
          address,
          quidax_withdraw_id: quidaxWithdrawId,
          memo
        })
      ]
    );

    return { txId: txResult.rows[0].id };
  });

  res.status(200).json({
    success: true,
    message: 'Withdrawal request submitted successfully',
    data: result
  });
});

// Exchange crypto to crypto
export const exchangeCryptoToCrypto = catchAsync(async (req, res) => {
  const { from_coin, to_coin, amount } = req.body;

  if (req.user.kyc_tier < 2) {
    throw new AppError('KYC Tier 2 or higher required', 403);
  }

  if (!from_coin || !to_coin || !amount || amount <= 0) {
    throw new AppError('Invalid request parameters', 400);
  }

  const result = await transaction(async (client) => {
    // 1. Check from_wallet
    const fromWallet = await client.query(
      `SELECT id, balance FROM wallets 
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND deleted_at IS NULL
       FOR UPDATE`,
      [req.user.id, from_coin.toUpperCase()]
    );

    if (fromWallet.rows.length === 0 || parseFloat(fromWallet.rows[0].balance) < amount) {
      throw new AppError('Insufficient balance', 400);
    }

    // 2. Get rates and calculate receive amount
    const rate = await getLiveExchangeRate(from_coin, to_coin);
    const toAmount = amount * rate;
    const fee = toAmount * 0.005; // 0.5% crypto-to-crypto fee
    const netAmount = toAmount - fee;

    // 3. Get or create to_wallet
    let toWallet = await client.query(
      `SELECT id FROM wallets 
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND deleted_at IS NULL`,
      [req.user.id, to_coin.toUpperCase()]
    );

    if (toWallet.rows.length === 0) {
      toWallet = await client.query(
        `INSERT INTO wallets (user_id, currency, wallet_type, balance)
         VALUES ($1, $2, 'crypto', 0) RETURNING id`,
        [req.user.id, to_coin.toUpperCase()]
      );
    }

    // 4. Update balances
    await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amount, fromWallet.rows[0].id]);
    await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [netAmount, toWallet.rows[0].id]);

    // 5. Quidax Liquidity sync (Instant Swap)
    let quidaxSwapId = null;
    try {
      if (process.env.QUIDAX_SECRET_KEY) {
        const quote = await quidax.getSwapQuote({
          from: from_coin,
          to: to_coin,
          amount: amount,
          side: 'from'
        });
        if (quote && quote.id) {
          const swap = await quidax.executeSwap(quote.id);
          quidaxSwapId = swap.id;
        }
      }
    } catch (e) {
      logger.warn('[CryptoSwap] Quidax Sync partial/failed:', e.message);
    }

    // 6. Record transactions
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'exchange_out', $2, $3, 'completed', $4, $5)`,
      [fromWallet.rows[0].id, amount, from_coin.toUpperCase(), `Swapped to ${to_coin}`, JSON.stringify({ rate, to_coin, to_amount: toAmount })]
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'exchange_in', $2, $3, 'completed', $4, $5)`,
      [toWallet.rows[0].id, netAmount, to_coin.toUpperCase(), `Swapped from ${from_coin}`, JSON.stringify({ rate, from_coin, from_amount: amount, fee })]
    );

    return { rate, toAmount, netAmount, fee };
  });

  res.status(200).json({
    success: true,
    data: result
  });
});

// Get crypto config (networks, etc)
export const getCryptoConfig = catchAsync(async (req, res) => {
  try {
    const currencies = await quidax.getCurrencies();
    
    // Map Quidax response to our unified config format
    const configData = currencies.map(cur => ({
      coin: cur.code.toUpperCase(),
      name: cur.name,
      networks: cur.networks || [
        { network: cur.code.toUpperCase(), name: cur.name, withdrawFee: '0', withdrawMin: '0' }
      ],
      // Compatibility for older frontend versions
      networkList: cur.networks || [
        { network: cur.code.toUpperCase(), name: cur.name, withdrawFee: '0', withdrawMin: '0' }
      ]
    }));

    res.status(200).json({
      success: true,
      data: configData
    });
  } catch (err) {
    logger.error('[CryptoConfig] Quidax Config Failed:', err.message);
    
    // Fallback to static config if Quidax is down
    const mockConfig = [
        { coin: 'BTC', networkList: [{ network: 'BTC', name: 'Bitcoin', withdrawFee: '0.0005', withdrawMax: '100', withdrawMin: '0.001' }] },
        { coin: 'ETH', networkList: [{ network: 'ERC20', name: 'Ethereum', withdrawFee: '0.005', withdrawMax: '1000', withdrawMin: '0.01' }] },
        {
          coin: 'USDT', networkList: [
            { network: 'TRC20', name: 'TRON', withdrawFee: '1', withdrawMax: '100000', withdrawMin: '10' },
            { network: 'ERC20', name: 'Ethereum', withdrawFee: '10', withdrawMax: '100000', withdrawMin: '20' },
            { network: 'BEP20', name: 'BSC', withdrawFee: '0.5', withdrawMax: '100000', withdrawMin: '10' }
          ]
        },
        { coin: 'USDC', networkList: [{ network: 'ERC20', name: 'Ethereum', withdrawFee: '10', withdrawMax: '100000', withdrawMin: '20' }] },
        { coin: 'SOL', networkList: [{ network: 'SOL', name: 'Solana', withdrawFee: '0.01', withdrawMax: '5000', withdrawMin: '0.1' }] },
        { coin: 'TRX', networkList: [{ network: 'TRC20', name: 'TRON', withdrawFee: '1', withdrawMax: '1000000', withdrawMin: '2' }] }
      ];

    res.status(200).json({
      success: true,
      data: mockConfig
    });
  }
});

// Get order book
export const getOrderBook = catchAsync(async (req, res) => {
  const { market, limit } = req.query;
  const data = await quidax.getOrderBook(market || 'btcusdt', limit);
  res.status(200).json({ success: true, data });
});

// Create trading order
export const createOrder = catchAsync(async (req, res) => {
  const { market, side, type, volume, price, total } = req.body;
  const data = await quidax.createOrder({ market, side, type, volume, price, total });
  res.status(201).json({ success: true, data });
});

// Get swap quote
export const getSwapQuote = catchAsync(async (req, res) => {
  const { from, to, amount, side } = req.query;
  const data = await quidax.getSwapQuote({ from, to, amount, side });
  res.status(200).json({ success: true, data });
});

// Get market trades
export const getMarketTrades = catchAsync(async (req, res) => {
  const { market, limit } = req.query;
  const data = await quidax.getMarketTrades(market || 'btcusdt', limit);
  res.status(200).json({ success: true, data });
});

// Get market ticker
export const getMarketTicker = catchAsync(async (req, res) => {
  const { market } = req.query;
  const data = await quidax.getMarketTicker(market || 'btcusdt');
  res.status(200).json({ success: true, data });
});
