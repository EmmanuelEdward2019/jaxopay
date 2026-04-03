import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import fxService from '../orchestration/adapters/fx/GraphFinanceService.js';

// Helper to bridge rates between assets when direct market doesn't exist
async function bridgeRate(from, to, bridgeCoin = 'USDT') {
  if (from === bridgeCoin) {
    const rate = await quidax.getExchangeRate(bridgeCoin, to);
    return rate || 0;
  }
  if (to === bridgeCoin) {
    const rate = await quidax.getExchangeRate(from, bridgeCoin);
    return rate || 0;
  }
  const fromPrice = await quidax.getExchangeRate(from, bridgeCoin);
  const toPrice = await quidax.getExchangeRate(to, bridgeCoin);
  if (!fromPrice || !toPrice) return 0;
  return fromPrice / toPrice;
}

// Get all supported assets from Quidax (fiat and crypto)
export const getSupportedCryptos = catchAsync(async (req, res) => {
  try {
    const currencies = await quidax.getCurrencies();
    
    // Map to unified format for frontend
    const assets = currencies.map(cur => ({
      code: cur.code.toUpperCase(),
      name: cur.name,
      type: cur.type === 'coin' ? 'crypto' : 'fiat',
      min_amount: parseFloat(cur.min_deposit_amount || 0),
      precision: parseInt(cur.precision || 8),
      networks: cur.networks || []
    }));

    res.status(200).json({
      success: true,
      data: assets,
    });
  } catch (err) {
    logger.error('[SupportedCryptos] Quidax Failed:', err.message);
    // Minimal fallback as last resort (not hardcoded rates, just asset codes)
    const fallback = [
        { code: 'BTC', name: 'Bitcoin', type: 'crypto' },
        { code: 'ETH', name: 'Ethereum', type: 'crypto' },
        { code: 'USDT', name: 'Tether', type: 'crypto' },
        { code: 'NGN', name: 'Nigerian Naira', type: 'fiat' },
        { code: 'USD', name: 'US Dollar', type: 'fiat' }
    ];
    res.status(200).json({ success: true, data: fallback });
  }
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
        qty,
        from_coin.toUpperCase(),
        JSON.stringify({
          exchange_rate: rate,
          fiat_currency: to_fiat.toUpperCase(),
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
        to_fiat.toUpperCase(),
        JSON.stringify({
          crypto_currency: from_coin.toUpperCase(),
          crypto_amount: qty,
          exchange_rate: rate,
          fee,
        }),
      ]
    );

    return { rate, fiatAmount, fee, netAmount };
  });

  logger.info('Crypto to fiat exchange:', {
    userId: req.user.id,
    from: from_coin,
    to: to_fiat,
    amount: qty,
  });

  res.status(200).json({
    success: true,
    message: 'Exchange completed successfully',
    data: {
      crypto_amount: qty,
      crypto_currency: from_coin.toUpperCase(),
      fiat_amount: result.fiatAmount,
      fiat_currency: to_fiat.toUpperCase(),
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
    const fee = qty * 0.01; // 1% fee
    const netFiat = qty; // qty (You Pay) is the total deducted
    const amountToExchange = qty - fee;
    const cryptoAmount = amountToExchange * rate;

    if (parseFloat(fiatWallet.rows[0].balance) < netFiat) {
      throw new AppError('Insufficient balance to cover trade and fees', 400);
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
          from: from_fiat,
          to: to_coin,
          amount: qty,
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
        from_fiat.toUpperCase(),
        JSON.stringify({
          exchange_rate: rate,
          crypto_currency: to_coin.toUpperCase(),
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
        to_coin.toUpperCase(),
        JSON.stringify({
          fiat_currency: from_fiat.toUpperCase(),
          fiat_amount: qty,
          exchange_rate: rate,
          fee,
        }),
      ]
    );

    return { rate, cryptoAmount, fee };
  });

  logger.info('Fiat to crypto exchange:', {
    userId: req.user.id,
    from: from_fiat,
    to: to_coin,
    amount: qty,
  });

  res.status(200).json({
    success: true,
    message: 'Exchange completed successfully',
    data: {
      fiat_amount: qty,
      fiat_currency: from_fiat.toUpperCase(),
      crypto_amount: result.cryptoAmount,
      crypto_currency: to_coin.toUpperCase(),
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
/**
 * Get Live Exchange Rate solely from Quidax
 */
async function getLiveExchangeRate(from, to) {
  from = from.toUpperCase();
  to = to.toUpperCase();
  
  if (from === to) return 1.0;

  try {
    // 1. Try Quidax Swap Quote (Most accurate for instant swaps)
    try {
       const quote = await quidax.getSwapQuote({
         from: from,
         to: to,
         amount: 1,
         side: 'from'
       });
       if (quote && (quote.rate || quote.price)) {
          return parseFloat(quote.rate || quote.price);
       }
    } catch (e) {
      logger.debug(`[ExchangeRate] Swap Quote failed for ${from}->${to}:`, e.message);
    }

    // 2. Try Quidax Market Ticker
    let rate = await quidax.getExchangeRate(from, to);
    if (rate !== null && rate > 0) return rate;

    // 3. Bridging Logic through USDT then USDC then NGN
    const bridges = ['USDT', 'USDC', 'NGN'];
    for (const bridge of bridges) {
        const bridgeRateValue = await bridgeRate(from, to, bridge);
        if (bridgeRateValue > 0) return bridgeRateValue;
    }

    // 4. Fallback to FX service ONLY for fiat-fiat bridges that Quidax doesn't cover
    // If Quidax has NO market at all for either, it might be a traditional fiat bridge
    const res = await fxService.getExchangeRate(from, to);
    return res.rate || 1.0;

  } catch (err) {
    logger.error(`[ExchangeRate] Error fetching live rate for ${from}->${to}:`, err.message);
    return 1.0;
  }
}

// Fallback logic for safety (Dynamic)
async function getMockExchangeRate(from, to) {
    return await getLiveExchangeRate(from, to);
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

// Get all markets
export const getMarkets = catchAsync(async (req, res) => {
  const data = await quidax.getMarkets();
  res.status(200).json({ success: true, data });
});
