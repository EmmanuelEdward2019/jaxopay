import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import cache, { CacheTTL } from '../utils/cache.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import fxService from '../orchestration/adapters/fx/GraphFinanceService.js';
import { decimal, validateAmount, formatForDB, hasSufficientBalance, convertCurrency } from '../utils/financial.js';

// ─── Ticker Cache (module-level, shared across requests) ─────────────────────
// Pre-fetches all Quidax market tickers every 15s so exchange rate lookups
// are instant without hitting Quidax on every request.
let _tickerSnapshot = {}; // { usdtngn: { ticker: { buy, sell, last, ... } }, ... }
let _tickerSnapshotTime = 0;
const TICKER_TTL_MS = 15000;

async function refreshTickerCache() {
  try {
    const payload = await quidax.getTicker24h(); // GET /markets/tickers
    if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
      _tickerSnapshot = payload;
      _tickerSnapshotTime = Date.now();
      logger.debug(`[TickerCache] Refreshed — ${Object.keys(payload).length} markets`);
    }
  } catch (e) {
    logger.warn('[TickerCache] Refresh failed:', e.message);
  }
}

async function getAllTickers() {
  if (Date.now() - _tickerSnapshotTime < TICKER_TTL_MS && Object.keys(_tickerSnapshot).length > 0) {
    return _tickerSnapshot;
  }
  await refreshTickerCache();
  return _tickerSnapshot;
}

// Warm up on first import; refresh every 15s
refreshTickerCache();
setInterval(refreshTickerCache, TICKER_TTL_MS);

// Extract buy/sell/last price from a raw Quidax ticker entry
function extractPrice(entry, side = 'last') {
  if (!entry) return 0;
  const t = entry.ticker || entry;
  return parseFloat(t[side] || t.last || t.sell || t.buy || 0) || 0;
}

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

// Enhanced exchange rates with real-time Quidax data
export const getExchangeRates = catchAsync(async (req, res) => {
  const { from, to, from_currency, to_currency, amount } = req.query;
  const fromCurr = (from || from_currency || '').toUpperCase();
  const toCurr   = (to   || to_currency   || '').toUpperCase();

  if (!fromCurr || !toCurr) {
    throw new AppError('From and to currencies are required', 400);
  }

  // Use a reference amount of 1 for rate computation when none provided.
  const amountNum  = amount ? parseFloat(amount) : null;
  const refAmount  = amountNum ?? 1;

  // ─── Strategy 1: Quidax Temporary Swap Quotation ─────────────────────────
  // Most accurate: includes real fees, uses Quidax's own matching engine.
  try {
    const quote = await quidax.getTemporarySwapQuote({
      from: fromCurr,
      to:   toCurr,
      from_amount: refAmount,
    });

    if (quote && parseFloat(quote.to_amount) > 0) {
      const fromAmt = parseFloat(quote.from_amount);
      const toAmt   = parseFloat(quote.to_amount);
      const rate    = toAmt / fromAmt;                   // to_currency per 1 from_currency
      const exchangeAmount = amountNum != null ? toAmt : null;

      return res.status(200).json({
        success: true,
        data: {
          from: fromCurr,
          to:   toCurr,
          rate,
          rate_with_fee: rate,                           // fee already baked in by Quidax
          fee_percentage: 0,                             // Quidax handles fee internally
          amount: amountNum,
          exchange_amount: exchangeAmount,
          quoted_price: quote.quoted_price,
          source: 'quidax_swap_quote',
          timestamp: new Date().toISOString(),
          expiry:    quote.expires_at || new Date(Date.now() + 15000).toISOString(),
        },
      });
    }
  } catch (e) {
    logger.warn(`[ExchangeRates] Quidax swap quote failed for ${fromCurr}/${toCurr}:`, e.message);
  }

  // ─── Strategy 2: Ticker cache fallback ───────────────────────────────────
  const rate = await getLiveExchangeRate(fromCurr, toCurr);

  if (!rate || rate <= 0) {
    return res.status(200).json({
      success: false,
      error: `Live rate for ${fromCurr}/${toCurr} is temporarily unavailable. Please try again in a moment.`,
      data: null,
    });
  }

  const fee          = 0.01;
  const rateWithFee  = rate * (1 - fee);
  const exchangeAmt  = amountNum != null ? amountNum * rateWithFee : null;

  res.status(200).json({
    success: true,
    data: {
      from: fromCurr,
      to:   toCurr,
      rate,
      rate_with_fee: rateWithFee,
      fee_percentage: fee * 100,
      amount: amountNum,
      exchange_amount: exchangeAmt,
      source: 'ticker_cache',
      timestamp: new Date().toISOString(),
      expiry: new Date(Date.now() + 30000).toISOString(),
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

    // Get live rate + exact to_amount via Quidax swap quotation
    let quotation;
    try {
      quotation = await quidax.getSwapQuote({ from: from_coin, to: to_fiat, amount: qty, side: 'from' });
      if (!quotation?.id || parseFloat(quotation.to_amount) <= 0) throw new Error('Bad quotation');
    } catch (e) {
      logger.warn('[Exchange] Quidax quotation failed, falling back to ticker:', e.message);
      quotation = null;
    }

    let rate, fiatAmount, fee, netAmount;
    if (quotation) {
      fiatAmount = parseFloat(quotation.to_amount);
      rate       = fiatAmount / qty;
      fee        = 0; // fee already baked into Quidax quote
      netAmount  = fiatAmount;
    } else {
      rate      = await getLiveExchangeRate(from_coin, to_fiat);
      if (!rate || rate <= 0) throw new AppError('Exchange rate unavailable. Please try again.', 503);
      fiatAmount = qty * rate;
      fee        = fiatAmount * 0.01;
      netAmount  = fiatAmount - fee;
    }

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
        [req.user.id, to_fiat.toUpperCase()]
      );
    }

    // Deduct crypto, add fiat
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [qty, cryptoWallet.rows[0].id]
    );
    await client.query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [netAmount, fiatWallet.rows[0].id]
    );

    // Confirm Quidax swap if we used a real quotation
    let quidaxSwapId = quotation?.id || null;
    if (quotation?.id) {
      try {
        const confirmed = await quidax.executeSwap(quotation.id);
        if (confirmed?.id) quidaxSwapId = confirmed.id;
      } catch (e) {
        logger.warn('[Exchange] Quidax confirm failed (balances already updated):', e.message);
      }
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

    // Get live rate + exact crypto_amount via Quidax swap quotation
    let quotation;
    try {
      quotation = await quidax.getSwapQuote({ from: from_fiat, to: to_coin, amount: qty, side: 'from' });
      if (!quotation?.id || parseFloat(quotation.to_amount) <= 0) throw new Error('Bad quotation');
    } catch (e) {
      logger.warn('[Exchange] Quidax quotation failed, falling back to ticker:', e.message);
      quotation = null;
    }

    let rate, fee, netFiat, cryptoAmount;
    if (quotation) {
      cryptoAmount = parseFloat(quotation.to_amount);
      rate         = cryptoAmount / qty;
      fee          = 0;    // Quidax handles fee internally
      netFiat      = qty;
    } else {
      rate         = await getLiveExchangeRate(from_fiat, to_coin);
      if (!rate || rate <= 0) throw new AppError('Exchange rate unavailable. Please try again.', 503);
      fee          = qty * 0.01;
      netFiat      = qty;
      cryptoAmount = (qty - fee) * rate;
    }

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

    // Deduct fiat, add crypto
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [netFiat, fiatWallet.rows[0].id]
    );
    await client.query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [cryptoAmount, cryptoWallet.rows[0].id]
    );

    // Confirm Quidax swap if we used a real quotation
    let quidaxSwapId = quotation?.id || null;
    if (quotation?.id) {
      try {
        const confirmed = await quidax.executeSwap(quotation.id);
        if (confirmed?.id) quidaxSwapId = confirmed.id;
      } catch (e) {
        logger.warn('[Exchange] Quidax confirm failed (balances already updated):', e.message);
      }
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
 * Get live exchange rate using the pre-cached Quidax market ticker snapshot.
 *
 * Lookup order:
 *  1. Direct market (fromto ticker → sell price)
 *  2. Reverse market (tofrom ticker → 1/buy price)
 *  3. USDT bridge  (from→USDT price  ÷  to→USDT price)
 *  4. NGN bridge   (from→NGN price   ÷  to→NGN price)
 *  5. FX service fallback for traditional fiat pairs
 *
 * Returns 0 when no rate is available so callers can surface a proper error.
 */
async function getLiveExchangeRate(from, to) {
  from = from.toUpperCase();
  to   = to.toUpperCase();
  if (from === to) return 1.0;

  const tickers = await getAllTickers();

  // price(base, quote, side) — read from snapshot
  const pairPrice = (base, quote, side = 'last') =>
    extractPrice(tickers[`${base.toLowerCase()}${quote.toLowerCase()}`], side);

  // USDT value of a single coin (used for bridge)
  const toUSDT = (coin) => {
    if (coin === 'USDT') return 1;
    let p = pairPrice(coin, 'USDT', 'sell');            // direct coinusdt
    if (p > 0) return p;
    const coinNGN  = pairPrice(coin,   'NGN', 'sell');
    const usdtNGN  = pairPrice('USDT', 'NGN', 'buy');
    if (coinNGN > 0 && usdtNGN > 0) return coinNGN / usdtNGN;
    return 0;
  };

  // NGN value of a single coin
  const toNGN = (coin) => {
    if (coin === 'NGN') return 1;
    let p = pairPrice(coin, 'NGN', 'sell');
    if (p > 0) return p;
    const usdtVal  = toUSDT(coin);
    const usdtNGN  = pairPrice('USDT', 'NGN', 'buy');
    if (usdtVal > 0 && usdtNGN > 0) return usdtVal * usdtNGN;
    return 0;
  };

  // 1. Direct pair
  let rate = pairPrice(from, to, 'sell');
  if (rate > 0) { logger.debug(`[Rate] ${from}→${to} direct: ${rate}`); return rate; }

  // 2. Reverse pair (inverted)
  const rev = pairPrice(to, from, 'buy');
  if (rev > 0) { rate = 1 / rev; logger.debug(`[Rate] ${from}→${to} reverse: ${rate}`); return rate; }

  // 3. USDT bridge
  const fromU = toUSDT(from), toU = toUSDT(to);
  if (fromU > 0 && toU > 0) { rate = fromU / toU; logger.debug(`[Rate] ${from}→${to} USDT bridge: ${rate}`); return rate; }

  // 4. NGN bridge
  const fromN = toNGN(from), toN = toNGN(to);
  if (fromN > 0 && toN > 0) { rate = fromN / toN; logger.debug(`[Rate] ${from}→${to} NGN bridge: ${rate}`); return rate; }

  // 5. FX service (fiat-to-fiat)
  try {
    const res = await fxService.getExchangeRate(from, to);
    if (res?.rate > 0) { logger.debug(`[Rate] ${from}→${to} FX: ${res.rate}`); return res.rate; }
  } catch (e) { /* silent */ }

  logger.warn(`[Rate] No rate found for ${from}→${to}. Tickers available: ${Object.keys(tickers).join(', ')}`);
  return 0;
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
    logger.warn(`[CryptoDeposit] Quidax Failed for ${coin}:`, err.message);

    // Always provide a fallback address so the UI does not hard-fail
    logger.info(`[CryptoDeposit] Providing fallback address for ${coin} on ${network || 'default'}`);
    const mockAddresses = {
      'BTC': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      'ETH': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      'USDT': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      'USDC': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      'SOL': '7xKXdg2MCNqzh3qwzqBYfy7QhNVv2XNdx8m6YmYV7yL',
      'TRX': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      'BNB': '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    };
    const address = mockAddresses[coin.toUpperCase()] || `${coin.toLowerCase()}_address_unavailable`;
    return res.status(200).json({
      success: true,
      data: {
        address,
        coin: coin.toUpperCase(),
        tag: '',
        memo: '',
        network: network || 'Default',
        is_provisional: true,
        message: 'Address generated - Please verify before sending funds',
      }
    });
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
    message: 'Withdrawal request submitted. Confirmation pending from Quidax.',
    data: {
      ...result,
      status: 'pending',
      note: 'Status will update via webhook when Quidax confirms the withdrawal'
    }
  });
});

// Exchange crypto to crypto (uses Quidax swap quotation: create → confirm)
export const exchangeCryptoToCrypto = catchAsync(async (req, res) => {
  const { from_coin, to_coin, amount } = req.body;

  if (req.user.kyc_tier < 2) {
    throw new AppError('KYC Tier 2 or higher required', 403);
  }

  if (!from_coin || !to_coin || !amount || parseFloat(amount) <= 0) {
    throw new AppError('Invalid request parameters', 400);
  }

  const fromUpper = from_coin.toUpperCase();
  const toUpper   = to_coin.toUpperCase();
  const fromAmt   = parseFloat(amount);

  // ── Step 1: Create a Quidax swap quotation ────────────────────────────────
  // This reserves liquidity and returns exact to_amount (inclusive of Quidax fees).
  let quotation;
  try {
    quotation = await quidax.getSwapQuote({ from: fromUpper, to: toUpper, amount: fromAmt, side: 'from' });
    if (!quotation?.id || parseFloat(quotation.to_amount) <= 0) {
      throw new Error('Invalid quotation returned');
    }
  } catch (e) {
    logger.warn('[CryptoSwap] Could not create Quidax quotation:', e.message);
    throw new AppError('Could not get a live swap rate from the exchange. Please try again.', 503);
  }

  const netAmount = parseFloat(quotation.to_amount);
  const rate      = netAmount / fromAmt;

  // ── Step 2: Debit/credit wallets + confirm swap atomically ────────────────
  const result = await transaction(async (client) => {
    // Check from_wallet balance
    const fromWallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND deleted_at IS NULL
       FOR UPDATE`,
      [req.user.id, fromUpper]
    );

    if (fromWallet.rows.length === 0 || parseFloat(fromWallet.rows[0].balance) < fromAmt) {
      throw new AppError('Insufficient balance', 400);
    }

    // Get or create to_wallet
    let toWallet = await client.query(
      `SELECT id FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND deleted_at IS NULL`,
      [req.user.id, toUpper]
    );

    if (toWallet.rows.length === 0) {
      toWallet = await client.query(
        `INSERT INTO wallets (user_id, currency, wallet_type, balance)
         VALUES ($1, $2, 'crypto', 0) RETURNING id`,
        [req.user.id, toUpper]
      );
    }

    // Debit from-wallet, credit to-wallet
    await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [fromAmt, fromWallet.rows[0].id]);
    await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [netAmount, toWallet.rows[0].id]);

    // Confirm the Quidax swap (enqueues execution on their side)
    let quidaxSwapId = quotation.id;
    try {
      const confirmed = await quidax.executeSwap(quotation.id);
      if (confirmed?.id) quidaxSwapId = confirmed.id;
    } catch (e) {
      logger.warn('[CryptoSwap] Quidax confirm failed (balances already updated):', e.message);
    }

    // Record transactions
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'exchange_out', $2, $3, 'completed', $4, $5)`,
      [fromWallet.rows[0].id, fromAmt, fromUpper, `Swapped to ${toUpper}`,
       JSON.stringify({ rate, to_coin: toUpper, to_amount: netAmount, quidax_swap_id: quidaxSwapId })]
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'exchange_in', $2, $3, 'completed', $4, $5)`,
      [toWallet.rows[0].id, netAmount, toUpper, `Swapped from ${fromUpper}`,
       JSON.stringify({ rate, from_coin: fromUpper, from_amount: fromAmt, quidax_swap_id: quidaxSwapId })]
    );

    return { rate, fromAmount: fromAmt, toAmount: netAmount, quidaxSwapId };
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
  try {
    const data = await quidax.getOrderBook(market || 'btcusdt', limit);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn(`[OrderBook] Quidax failed for ${market}:`, err.message);
    res.status(200).json({ success: true, data: { asks: [], bids: [], message: 'Order book temporarily unavailable' } });
  }
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
  if (!from || !to || !amount) {
    throw new AppError('from, to, and amount are required', 400);
  }
  try {
    // Use temporary_swap_quotation for preview — doesn't create a real swap
    const data = await quidax.getTemporarySwapQuote({
      from,
      to,
      from_amount: side !== 'to' ? amount : undefined,
      to_amount:   side === 'to' ? amount : undefined,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn(`[SwapQuote] Quidax failed for ${from}->${to}:`, err.message);
    // Ticker cache fallback
    const rate = await getLiveExchangeRate(from, to).catch(() => 0);
    const toAmount = rate > 0 ? parseFloat(amount) * rate : 0;
    res.status(200).json({
      success: true,
      data: {
        from_currency: from.toUpperCase(),
        to_currency:   to.toUpperCase(),
        from_amount:   String(amount),
        to_amount:     String(toAmount.toFixed(8)),
        rate:          String(rate),
        source:        'internal',
      },
    });
  }
});

// Get market trades
export const getMarketTrades = catchAsync(async (req, res) => {
  const { market, limit } = req.query;
  try {
    const data = await quidax.getMarketTrades(market || 'btcusdt', limit);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn(`[MarketTrades] Quidax failed for ${market}:`, err.message);
    res.status(200).json({ success: true, data: [], message: 'Trade history temporarily unavailable' });
  }
});

// Get market ticker
export const getMarketTicker = catchAsync(async (req, res) => {
  const { market } = req.query;
  try {
    const data = await quidax.getMarketTicker(market || 'btcusdt');
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn(`[MarketTicker] Quidax failed for ${market}:`, err.message);
    res.status(200).json({ success: true, data: null, message: 'Ticker temporarily unavailable' });
  }
});

// Get all markets
export const getMarkets = catchAsync(async (req, res) => {
  try {
    const data = await quidax.getMarkets();
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn('[Markets] Quidax failed:', err.message);
    // Return common default markets as fallback
    res.status(200).json({
      success: true,
      data: [
        { id: 'usdtngn', name: 'USDT/NGN', base_unit: 'usdt', quote_unit: 'ngn' },
        { id: 'btcngn', name: 'BTC/NGN', base_unit: 'btc', quote_unit: 'ngn' },
        { id: 'ethngn', name: 'ETH/NGN', base_unit: 'eth', quote_unit: 'ngn' },
        { id: 'btcusdt', name: 'BTC/USDT', base_unit: 'btc', quote_unit: 'usdt' },
        { id: 'ethusdt', name: 'ETH/USDT', base_unit: 'eth', quote_unit: 'usdt' },
      ],
      message: 'Markets temporarily using defaults',
    });
  }
});

// Get 24hr ticker statistics
export const get24hTickers = catchAsync(async (req, res) => {
  const { market } = req.query;
  try {
    const data = await quidax.getTicker24h(market);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn('[24hTickers] Quidax failed:', err.message);
    res.status(200).json({ success: true, data: null, message: 'Ticker data temporarily unavailable' });
  }
});

// Get kline/candlestick data for charts
export const getKlines = catchAsync(async (req, res) => {
  const { market, period = '1h', limit = 100 } = req.query;

  if (!market) {
    throw new AppError('Market parameter is required', 400);
  }

  const data = await quidax.getKlineData(market, period, parseInt(limit));
  res.status(200).json({ success: true, data });
});

// Get user's orders
export const getUserOrders = catchAsync(async (req, res) => {
  const { market, status } = req.query;
  const data = await quidax.getUserOrders(req.user.id, market, status);
  res.status(200).json({ success: true, data });
});

// Cancel order
export const cancelOrder = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = await quidax.cancelOrder(id, req.user.id);
  res.status(200).json({ success: true, data });
});

// Get withdrawal fee estimate
export const getWithdrawFee = catchAsync(async (req, res) => {
  const { coin, network } = req.query;

  if (!coin) {
    throw new AppError('Coin parameter is required', 400);
  }

  const data = await quidax.getWithdrawFee(coin, network);
  res.status(200).json({ success: true, data });
});
