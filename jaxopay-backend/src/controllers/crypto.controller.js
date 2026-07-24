import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { auditFromReq } from '../services/audit.service.js';
import cache, { CacheTTL } from '../utils/cache.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import obiex from '../orchestration/adapters/crypto/ObiexAdapter.js';
import fxService from '../orchestration/adapters/fx/YellowCardService.js';
import { verifyTransactionPin } from '../services/transactionPin.service.js';
import { enforceTierLimit } from '../services/kycLimits.service.js';
import { kycTierLevel } from '../middleware/auth.js';
import { decimal, validateAmount, formatForDB, hasSufficientBalance, convertCurrency } from '../utils/financial.js';
import { getSpendableBalance } from '../utils/walletBalance.js';
import { getQuidaxErrorMessage } from '../utils/quidax.js';
import { randomUUID } from 'crypto';

// Crypto deposit/withdrawal/swap provider — Obiex by default; set CRYPTO_PROVIDER=quidax to
// fall back (e.g. during an Obiex outage). Order-book spot trading (createOrder, getOrderBook,
// getUserOrders, cancelOrder, klines, getMarkets/getMarketTicker for the Trade page) has no
// Obiex equivalent and always uses `quidax` directly, regardless of this setting.
const CRYPTO_PROVIDER = (process.env.CRYPTO_PROVIDER || 'obiex').toLowerCase() === 'quidax' ? 'quidax' : 'obiex';
const cryptoFx = CRYPTO_PROVIDER === 'quidax' ? quidax : obiex;

// ─── Ticker Cache (module-level, shared across requests) ─────────────────────
// Pre-fetches ticker prices on a fixed interval so exchange rate lookups are instant without
// hitting the provider on every request. Obiex-first (matches the rate the swap actually
// executes at — this is the dashboard's "live price" bar, not the Quidax order-book page,
// which calls its own market-data endpoints directly and is unaffected by this cache).
// Falls back to Quidax's bulk ticker snapshot if Obiex is unreachable or disabled below.
//
// IMPORTANT: this refresh is a server-wide background loop that runs continuously regardless
// of user traffic. At the previous 15s interval, the 12-pair Obiex fetch alone generated ~2,880
// calls/hour, well past Obiex's documented per-key rate limit (200/min) when sustained — this is
// what got the API key temporarily disabled on 2026-07-23. Fixed by: (1) a much longer interval,
// and (2) an instant, no-redeploy-needed kill switch (OBIEX_TICKER_DISABLED=true) to fall back to
// Quidax-only for the ticker without touching CRYPTO_PROVIDER (which governs real money-moving
// deposit/withdraw/swap calls and should stay independent of this decorative ticker).
let _tickerSnapshot = {}; // { usdtngn: { ticker: { buy, sell, last, ... } }, ... }
let _tickerSnapshotTime = 0;
const TICKER_TTL_MS = 5 * 60 * 1000; // 5 minutes — 12 pairs/refresh = ~144 calls/hour to Obiex, well under its 200/min limit
const OBIEX_TICKER_DISABLED = String(process.env.OBIEX_TICKER_DISABLED || '').toLowerCase() === 'true';

function createCryptoWithdrawalReference(userId) {
  const userPart = String(userId || 'user').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'user';
  const uniquePart = randomUUID().replace(/-/g, '').slice(0, 12);
  return `QWD-${userPart}-${Date.now()}-${uniquePart}`;
}

// market id -> { base, quote } for the fixed set of pairs the dashboard ticker bar shows.
// MATIC is aliased to Obiex's current ticker (POL, post-rebrand) only for the lookup itself —
// the market id / displayed pair label stay "MATIC/USDT" on the frontend, unchanged.
const TICKER_PAIRS = {
  btcusdt: ['BTC', 'USDT'], ethusdt: ['ETH', 'USDT'], btcngn: ['BTC', 'NGN'], ethngn: ['ETH', 'NGN'],
  usdtngn: ['USDT', 'NGN'], solusdt: ['SOL', 'USDT'], bnbusdt: ['BNB', 'USDT'], xrpusdt: ['XRP', 'USDT'],
  adausdt: ['ADA', 'USDT'], dogeusdt: ['DOGE', 'USDT'], dotusdt: ['DOT', 'USDT'], maticusdt: ['POL', 'USDT'],
};

async function refreshTickerCacheFromObiex() {
  const entries = await Promise.all(
    Object.entries(TICKER_PAIRS).map(async ([marketId, [base, quote]]) => {
      const rate = await obiex.getExchangeRate(base, quote).catch(() => null);
      if (!(rate > 0)) return null;
      return [marketId, { ticker: { last: rate, buy: rate, sell: rate, change: 0, vol: 0, high: 0, low: 0 } }];
    })
  );
  const payload = Object.fromEntries(entries.filter(Boolean));
  return payload;
}

async function refreshTickerCache() {
  try {
    if (CRYPTO_PROVIDER === 'obiex' && !OBIEX_TICKER_DISABLED) {
      const payload = await refreshTickerCacheFromObiex();
      if (Object.keys(payload).length > 0) {
        _tickerSnapshot = payload;
        _tickerSnapshotTime = Date.now();
        logger.debug(`[TickerCache] Refreshed via Obiex — ${Object.keys(payload).length} markets`);
        return;
      }
      logger.warn('[TickerCache] Obiex returned no usable rates — falling back to Quidax');
    }
    const payload = await quidax.getTicker24h(); // GET /markets/tickers
    if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
      _tickerSnapshot = payload;
      _tickerSnapshotTime = Date.now();
      logger.debug(`[TickerCache] Refreshed via Quidax (fallback) — ${Object.keys(payload).length} markets`);
    }
  } catch (e) {
    logger.warn('[TickerCache] Refresh failed:', e.message);
  }
}

async function getAllTickers() {
  const hasData = Object.keys(_tickerSnapshot).length > 0;
  const fresh = Date.now() - _tickerSnapshotTime < TICKER_TTL_MS;
  if (hasData) {
    // Always serve the in-memory snapshot instantly. If it's stale, refresh in the BACKGROUND
    // (never await) so a slow/timing-out Quidax can't block the request — display prices being a
    // few seconds old is fine, and this stops the dashboard ticker from hanging the page.
    if (!fresh) refreshTickerCache().catch(() => {});
    return _tickerSnapshot;
  }
  // Cold start only (no snapshot yet): wait for the first fetch.
  await refreshTickerCache();
  return _tickerSnapshot;
}

// Warm up on first import; refresh every 5 minutes thereafter
refreshTickerCache();
setInterval(refreshTickerCache, TICKER_TTL_MS).unref?.();

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
    const currencies = await cryptoFx.getCurrencies();

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

  // ─── Strategy 1: Live Temporary Swap Quotation (Obiex primary, Quidax fallback) ──
  // Most accurate: includes real fees, uses the provider's own matching engine.
  try {
    if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
    const quote = await cryptoFx.getTemporarySwapQuote({
      from: fromCurr,
      to:   toCurr,
      from_amount: refAmount
    });

    if (quote && parseFloat(quote.to_amount) > 0) {
      const fromAmt = parseFloat(quote.from_amount);
      const toAmt   = parseFloat(quote.to_amount);
      const rate    = toAmt / fromAmt;  // to_currency per 1 from_currency

      // Sanity-check: if both currencies are crypto the rate should NOT be ~1.0
      // (1 BTC ≠ 1 USDT). A rate of ~1 for cross-crypto pairs means the API
      // returned bad data — discard and fall through to the ticker cache.
      const isCrossAsset = CRYPTO_SYMBOLS.has(fromCurr) && CRYPTO_SYMBOLS.has(toCurr)
                        && fromCurr !== toCurr
                        && !(fromCurr === 'USDT' || toCurr === 'USDT'
                          || fromCurr === 'USDC' || toCurr === 'USDC');
      if (isCrossAsset && rate >= 0.9 && rate <= 1.1) {
        logger.warn(`[ExchangeRates] ${CRYPTO_PROVIDER} quote for ${fromCurr}/${toCurr} returned suspicious rate ${rate} — discarding`);
        throw new Error('Suspicious rate');
      }

      const exchangeAmount = amountNum != null ? toAmt : null;

      return res.status(200).json({
        success: true,
        data: {
          from: fromCurr,
          to:   toCurr,
          rate,
          rate_with_fee: rate,          // fee already baked in by the provider
          fee_percentage: 0,
          amount: amountNum,
          exchange_amount: exchangeAmount,
          quoted_price: quote.quoted_price,
          source: `${CRYPTO_PROVIDER}_swap_quote`,
          timestamp: new Date().toISOString(),
          expiry:    quote.expires_at || new Date(Date.now() + 15000).toISOString(),
        },
      });
    }
  } catch (e) {
    logger.warn(`[ExchangeRates] ${CRYPTO_PROVIDER} swap quote failed for ${fromCurr}/${toCurr}:`, e.message);
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

  // Check KYC tier (verified users only)
  if (kycTierLevel(req.user.kyc_tier) < 1) {
    throw new AppError(
      'Please verify your identity (KYC) to use crypto features.',
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
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND is_active = true
       FOR UPDATE`,
      [req.user.id, crypto_currency.toUpperCase()]
    );

    if (cryptoWallet.rows.length === 0) {
      throw new AppError(`No ${crypto_currency} wallet found`, 404);
    }

    if (parseFloat(cryptoWallet.rows[0].balance) < qty) {
      throw new AppError('Insufficient crypto balance', 400);
    }

    // Get live rate + exact to_amount via a swap quotation (Obiex primary, Quidax fallback)
    let quotation;
    try {
      if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
      quotation = await cryptoFx.getSwapQuote({ from: from_coin, to: to_fiat, amount: qty, side: 'from' });
      if (!quotation?.id || parseFloat(quotation.to_amount) <= 0) throw new Error('Bad quotation');
    } catch (e) {
      logger.warn(`[Exchange] ${CRYPTO_PROVIDER} quotation failed, falling back to ticker:`, e.message);
      quotation = null;
    }

    let rate, fiatAmount, fee, netAmount;
    if (quotation) {
      fiatAmount = parseFloat(quotation.to_amount);
      rate       = fiatAmount / qty;
      fee        = 0; // fee already baked into the provider's quote
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
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'fiat' AND is_active = true`,
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

    // Confirm the swap on the provider if we used a real quotation
    let providerSwapId = quotation?.id || null;
    if (quotation?.id) {
      try {
        const confirmed = await cryptoFx.executeSwap(quotation.id);
        if (confirmed?.id) providerSwapId = confirmed.id;
      } catch (e) {
        logger.warn(`[Exchange] ${CRYPTO_PROVIDER} confirm failed (balances already updated):`, e.message);
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
          provider: CRYPTO_PROVIDER,
          provider_swap_id: providerSwapId,
          source: `${CRYPTO_PROVIDER}_live`
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

  // Check KYC tier (verified users only)
  if (kycTierLevel(req.user.kyc_tier) < 1) {
    throw new AppError(
      'Please verify your identity (KYC) to use crypto features.',
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
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'fiat' AND is_active = true
       FOR UPDATE`,
      [req.user.id, fiat_currency.toUpperCase()]
    );

    if (fiatWallet.rows.length === 0) {
      throw new AppError(`No ${fiat_currency} wallet found`, 404);
    }

    if (parseFloat(fiatWallet.rows[0].balance) < qty) {
      throw new AppError('Insufficient fiat balance', 400);
    }

    // Get live rate + exact crypto_amount via a swap quotation (Obiex primary, Quidax fallback)
    let quotation;
    try {
      if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
      quotation = await cryptoFx.getSwapQuote({ from: from_fiat, to: to_coin, amount: qty, side: 'from' });
      if (!quotation?.id || parseFloat(quotation.to_amount) <= 0) throw new Error('Bad quotation');
    } catch (e) {
      logger.warn(`[Exchange] ${CRYPTO_PROVIDER} quotation failed, falling back to ticker:`, e.message);
      quotation = null;
    }

    let rate, fee, netFiat, cryptoAmount;
    if (quotation) {
      cryptoAmount = parseFloat(quotation.to_amount);
      rate         = cryptoAmount / qty;
      fee          = 0;    // the provider handles fee internally
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
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND is_active = true`,
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

    // Confirm the swap on the provider if we used a real quotation
    let providerSwapId = quotation?.id || null;
    if (quotation?.id) {
      try {
        const confirmed = await cryptoFx.executeSwap(quotation.id);
        if (confirmed?.id) providerSwapId = confirmed.id;
      } catch (e) {
        logger.warn(`[Exchange] ${CRYPTO_PROVIDER} confirm failed (balances already updated):`, e.message);
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
          provider: CRYPTO_PROVIDER,
          provider_swap_id: providerSwapId,
          source: `${CRYPTO_PROVIDER}_live`
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
// Known crypto currencies — never use FX service (a forex API) for these.
// Includes all Quidax-supported coins + common industry symbols.
const CRYPTO_SYMBOLS = new Set([
  // Quidax-supported cryptocurrencies
  'BTC','ETH','USDT','USDC','BNB','SOL','XRP','ADA','DOGE','TRX',
  'LTC','DOT','POL','BCH','LINK','XLM','DASH','AAVE','CAKE','SHIB',
  'FLOKI','PEPE','BONK','QDX','SLP','ALGO','WIF','NOS','NEAR','TON',
  'SUI','RNDR','STRK','ZK','LSK','CFX','S','FARTCOIN','HYPE','XYO',
  'AXCNH','CNGN',
  // Additional common crypto symbols (for rate guard safety)
  'MATIC','UNI','AVAX','ATOM','FIL','EOS','ETC','VET','THETA','HBAR',
  'FTM','ONE','SAND','MANA','AXS','LRC','ENJ','GRT','COMP','MKR',
  'SNX','CRV','SUSHI','YFI','BAL','REN','KNC','ZRX','BAT','OMG',
  'ZEC','XMR','IOTA','XTZ','WAVES','QTUM','NEO','ONT','ZIL','ICX',
]);

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
    let p = pairPrice(coin, 'USDT', 'sell');
    if (p > 0) return p;
    const coinNGN = pairPrice(coin,   'NGN', 'sell');
    const usdtNGN = pairPrice('USDT', 'NGN', 'buy');
    if (coinNGN > 0 && usdtNGN > 0) return coinNGN / usdtNGN;
    return 0;
  };

  // NGN value of a single coin
  const toNGN = (coin) => {
    if (coin === 'NGN') return 1;
    let p = pairPrice(coin, 'NGN', 'sell');
    if (p > 0) return p;
    const usdtVal = toUSDT(coin);
    const usdtNGN = pairPrice('USDT', 'NGN', 'buy');
    if (usdtVal > 0 && usdtNGN > 0) return usdtVal * usdtNGN;
    return 0;
  };

  // 1. Direct pair (from the cache)
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

  // 5. Direct Quidax market ticker fetch (bypasses cache — handles cold-start / stale cache)
  // Try the most likely markets for this pair before giving up.
  const candidateMarkets = [
    `${from.toLowerCase()}${to.toLowerCase()}`,
    `${to.toLowerCase()}${from.toLowerCase()}`,
    `${from.toLowerCase()}usdt`,
    `${to.toLowerCase()}usdt`,
    `${from.toLowerCase()}ngn`,
    `${to.toLowerCase()}ngn`,
  ];
  for (const mkt of candidateMarkets) {
    try {
      const t = await quidax.getMarketTicker(mkt);
      if (!t) continue;
      const ticker = t.ticker || t;
      const p = parseFloat(ticker.sell || ticker.last || ticker.buy || 0);
      if (p <= 0) continue;

      // Determine if this market gives from→to directly or needs inversion
      if (mkt === `${from.toLowerCase()}${to.toLowerCase()}`) {
        logger.debug(`[Rate] ${from}→${to} live ticker (${mkt}): ${p}`);
        return p;
      }
      if (mkt === `${to.toLowerCase()}${from.toLowerCase()}`) {
        logger.debug(`[Rate] ${from}→${to} live ticker inverse (${mkt}): ${1/p}`);
        return 1 / p;
      }
      // Bridge via USDT
      if (mkt === `${from.toLowerCase()}usdt` && to === 'USDT') return p;
      if (mkt === `${to.toLowerCase()}usdt`   && from === 'USDT') return 1 / p;
      // Store for bridge calculation — don't return early
    } catch (e) { /* continue */ }
  }

  // 6. FX service — ONLY for pure fiat-to-fiat (never for crypto)
  if (!CRYPTO_SYMBOLS.has(from) && !CRYPTO_SYMBOLS.has(to)) {
    try {
      const res = await fxService.getExchangeRate(from, to);
      if (res?.rate > 0) { logger.debug(`[Rate] ${from}→${to} FX: ${res.rate}`); return res.rate; }
    } catch (e) { /* silent */ }
  }

  logger.warn(`[Rate] No rate found for ${from}→${to}. Cache has: ${Object.keys(tickers).slice(0,10).join(', ')}...`);
  return 0;
}

// Fallback logic for safety (Dynamic)
async function getMockExchangeRate(from, to) {
  return await getLiveExchangeRate(from, to);
}

/**
 * Ensure a Quidax sub-account exists for this Jaxopay user.
 *
 * Self-custody model: every Jaxopay user maps 1-to-1 with a Quidax sub-user.
 * Each sub-user has their own isolated wallets → unique deposit addresses.
 * Webhooks carry data.user.id so we can route deposits to the correct user.
 *
 * Returns the Quidax user ID (string).
 */
async function ensureQuidaxSubUser(jaxopayUserId, userEmail, firstName, lastName) {
  // 1. Return cached sub-user ID if already stored
  const existing = await query(
    'SELECT quidax_user_id FROM users WHERE id = $1',
    [jaxopayUserId]
  );
  if (existing.rows[0]?.quidax_user_id) {
    return existing.rows[0].quidax_user_id;
  }

  // 2. Create (or recover) the sub-user on Quidax — use app.quidax.io via accountClient
  let subUser;
  try {
    subUser = await quidax.createSubUser(
      userEmail,
      firstName || 'User',
      lastName || userEmail.split('@')[0]
    );
  } catch (err) {
    // Quidax enforces GLOBAL email uniqueness for sub-accounts. If this email was
    // registered on a different Quidax master account, createSubUser returns
    // "already exists" but recovery-by-email can't find it under our master, so it
    // throws. Retry once with a unique alias (name+jx<id>@domain) so the user still
    // gets their own sub-account. We link by quidax_user_id (never by email), so the
    // alias is invisible to the user. Only this previously-failing path is affected.
    const alreadyExists = /already exist|already registered|taken|\b409\b/i.test(err.message || '');
    if (alreadyExists) {
      const idPart = String(jaxopayUserId).replace(/[^a-z0-9]/gi, '').slice(0, 8);
      const aliasEmail = userEmail.replace(/@/, `+jx${idPart}@`);
      logger.warn(`[Quidax] ${userEmail} already registered on another Quidax account — retrying with alias ${aliasEmail}`);
      try {
        subUser = await quidax.createSubUser(
          aliasEmail,
          firstName || 'User',
          lastName || userEmail.split('@')[0]
        );
      } catch (aliasErr) {
        logger.error(`[Quidax] ensureQuidaxSubUser alias retry FAILED for ${jaxopayUserId} (${aliasEmail}): ${aliasErr.message}`);
        throw aliasErr;
      }
    } else {
      // Log the full error so we can diagnose auth/permission issues
      logger.error(`[Quidax] ensureQuidaxSubUser FAILED for user ${jaxopayUserId} (${userEmail}): ${err.message}`);
      logger.error(`[Quidax] ensureQuidaxSubUser stack: ${err.stack}`);
      throw err; // propagate — caller will return 202 pending
    }
  }

  // Extract the numeric Quidax user ID — MUST be the numeric id (not sn) so
  // that webhook deposit.successful data.user.id lookups work correctly.
  const quidaxId = quidax._extractSubUserId(subUser);

  // 3. Persist so we never call createSubUser twice for the same user
  await query(
    'UPDATE users SET quidax_user_id = $1, quidax_user_sn = $2, updated_at = NOW() WHERE id = $3',
    [quidaxId, subUser.sn || quidaxId, jaxopayUserId]
  );
  logger.info(`[Quidax] Sub-user linked: jaxopay=${jaxopayUserId} → quidax_id=${quidaxId} sn=${subUser.sn}`);
  return quidaxId;
}

async function getQuidaxSubUserIdForRequest(req) {
  const userRow = await query(
    `SELECT u.quidax_user_id, p.first_name, p.last_name
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  );
  const userProfile = userRow.rows[0] || {};

  return ensureQuidaxSubUser(
    req.user.id,
    req.user.email,
    userProfile.first_name,
    userProfile.last_name
  );
}

// Get deposit address for crypto
export const getCryptoDepositAddress = catchAsync(async (req, res) => {
  const { coin, network } = req.query;

  if (!coin) {
    throw new AppError('Coin symbol is required', 400);
  }

  try {
    let dataResponse;
    if (CRYPTO_PROVIDER === 'obiex') {
      // Obiex is a single pooled broker account — no sub-account provisioning needed.
      // uniqueUserIdentifier=our own user id is enough; Obiex returns the same address on
      // repeat calls (idempotent), and the deposit webhook is matched back by this address.
      dataResponse = await obiex.getDepositAddress(req.user.id, coin.toUpperCase(), network || coin.toUpperCase());
    } else {
      // ── Self-custody: fetch/create the Quidax sub-account for this user ──────
      // Each user has their own Quidax sub-user with unique wallet addresses.
      // This is the key fix: previously all users shared the master account,
      // so funds deposited went to Quidax but couldn't be attributed to a user.
      const userRow = await query(
        `SELECT u.quidax_user_id, p.first_name, p.last_name
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.id = $1`,
        [req.user.id]
      );
      const userProfile = userRow.rows[0] || {};
      const quidaxUserId = await ensureQuidaxSubUser(
        req.user.id,
        req.user.email,
        userProfile.first_name,
        userProfile.last_name
      );

      // ── Fetch deposit address from sub-user's wallet ──────────────────────────
      dataResponse = await quidax.getDepositAddressForUser(quidaxUserId, coin.toLowerCase(), network || null);
    }
    const addressData = dataResponse?.data || dataResponse;
    const address = addressData.deposit_address || addressData.address;
    const tag = addressData.destination_tag || addressData.tag || addressData.memo || '';

    if (address) {
      // Persist to DB so webhook handler can also fall back to address-matching.
      // Upsert here because the backend should not depend on the frontend having
      // already created the crypto wallet row.
      await query(
        `INSERT INTO wallets (user_id, currency, wallet_type, balance, available_balance, crypto_address, crypto_tag, is_active)
         VALUES ($1, $2, 'crypto', 0, 0, $3, $4, true)
         ON CONFLICT (user_id, currency) DO UPDATE
           SET crypto_address = EXCLUDED.crypto_address,
               crypto_tag = EXCLUDED.crypto_tag,
               is_active = true,
               updated_at = NOW()`,
        [req.user.id, coin.toUpperCase(), address, tag]
      );
    }

    if (!address && dataResponse?.pending) {
      return res.status(202).json({
        success: false,
        pending: true,
        data: null,
        error: 'Address is being generated. Please try again in a few seconds.',
      });
    }

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
    logger.warn(`[CryptoDeposit] ${CRYPTO_PROVIDER} failed for ${coin}/${network}:`, err.message);

    const isNotPermitted = /E0609|not permitted|not enabled/i.test(err.message);
    if (isNotPermitted) {
      return res.status(503).json({
        success: false,
        error: `Wallet address generation for ${coin.toUpperCase()} is not currently available. Please contact support.`,
      });
    }

    return res.status(202).json({
      success: false,
      pending: true,
      data: null,
      error: 'Address is being generated. Please wait a moment.',
    });
  }
});

// Withdraw crypto to external wallet
export const withdrawCrypto = catchAsync(async (req, res) => {
  const { coin, network, address, amount, memo } = req.body;

  if (kycTierLevel(req.user.kyc_tier) < 1) {
    throw new AppError('Please verify your identity (KYC) to withdraw crypto.', 403, 'KYC_TIER_REQUIRED');
  }

  if (!coin || !address || amount == null) {
    throw new AppError('Coin, address, and amount are required', 400);
  }

  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new AppError('Amount must be greater than zero', 400);
  }

  // Require the transaction PIN as the final authorization step.
  await verifyTransactionPin(req.user.id, req.body.pin);
  // KYC tier daily/monthly limit (stablecoins ≈ USD; other coins converted)
  await enforceTierLimit(req.user.id, amountValue, coin.toUpperCase(), req.user.kyc_tier);

  const coinUpper = coin.toUpperCase();
  const reference = createCryptoWithdrawalReference(req.user.id);
  const quidaxUserId = CRYPTO_PROVIDER === 'quidax' ? await getQuidaxSubUserIdForRequest(req) : null;

  const withdrawal = await transaction(async (client) => {
    // 1. Get wallet and lock
    const wallet = await client.query(
      `SELECT id, balance, available_balance, locked_balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND is_active = true
       FOR UPDATE`,
      [req.user.id, coinUpper]
    );

    if (wallet.rows.length === 0) {
      throw new AppError(`No ${coin} wallet found`, 404);
    }

    const spendableBalance = getSpendableBalance(wallet.rows[0]);
    if (spendableBalance < amountValue) {
      throw new AppError(`Insufficient balance for withdrawal. Available: ${coinUpper} ${spendableBalance.toLocaleString()}`, 400);
    }

    // 2. Deduct locally before calling Quidax so successful provider requests are never untracked.
    await client.query(
      `UPDATE wallets
       SET balance = balance - $1,
           available_balance = CASE
             WHEN COALESCE(locked_balance, 0) > 0 THEN GREATEST(
               (CASE WHEN available_balance IS NULL THEN balance - COALESCE(locked_balance, 0) ELSE available_balance END) - $1,
               0
             )
             WHEN COALESCE(available_balance, 0) <= 0 AND balance > 0 THEN GREATEST(balance - $1, 0)
             ELSE GREATEST(LEAST(COALESCE(available_balance, balance), balance) - $1, 0)
           END,
           updated_at = NOW()
       WHERE id = $2`,
      [amountValue, wallet.rows[0].id]
    );

    // 3. Record the pending transaction with the same reference sent to the provider.
    const txResult = await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'withdrawal', $2, $3, 'pending', $4, $5)
       RETURNING id`,
      [
        wallet.rows[0].id,
        amountValue,
        coinUpper,
        `Withdrawal to ${address}`,
        JSON.stringify({
          network,
          address,
          memo,
          provider: CRYPTO_PROVIDER,
          [`${CRYPTO_PROVIDER}_reference`]: reference,
          ...(quidaxUserId ? { quidax_user_id: quidaxUserId } : {}),
        })
      ]
    );

    return {
      txId: txResult.rows[0].id,
      walletId: wallet.rows[0].id,
    };
  });

  let providerWithdrawId = null;
  try {
    const withdrawRes = await cryptoFx.withdraw({
      currency: coin,
      network,
      fund_uid: address,
      amount: amountValue,
      fund_uid2: memo,
      reference,
      transaction_note: `Jaxopay withdrawal ${reference}`,
      narration: 'Jaxopay withdrawal'
    });
    providerWithdrawId = withdrawRes?.data?.id || withdrawRes?.id;

    try {
      await query(
        `UPDATE wallet_transactions
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({
            [`${CRYPTO_PROVIDER}_withdraw_id`]: providerWithdrawId,
            [`${CRYPTO_PROVIDER}_status`]: withdrawRes?.status || null,
            [`${CRYPTO_PROVIDER}_response_reference`]: withdrawRes?.reference || null,
          }),
          withdrawal.txId,
        ]
      );
    } catch (dbErr) {
      logger.error(`[CryptoWithdraw] Could not attach ${CRYPTO_PROVIDER} withdrawal id to local tx ${withdrawal.txId}:`, dbErr.message);
    }
  } catch (err) {
    const providerMessage = CRYPTO_PROVIDER === 'quidax' ? getQuidaxErrorMessage(err) : (err.message || 'Withdrawal failed');
    logger.error(`[CryptoWithdraw] ${CRYPTO_PROVIDER} failed for ${reference}: ${providerMessage}`);

    await transaction(async (client) => {
      await client.query(
        `UPDATE wallets
         SET balance = balance + $1,
             available_balance = COALESCE(available_balance, 0) + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [amountValue, withdrawal.walletId]
      );

      await client.query(
        `UPDATE wallet_transactions
         SET status = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({
            [`${CRYPTO_PROVIDER}_error`]: providerMessage,
            failed_at: new Date().toISOString(),
          }),
          withdrawal.txId,
        ]
      );
    });

    throw new AppError(`External withdrawal failed: ${providerMessage}`, 502);
  }

  auditFromReq(req, { action: 'crypto_withdrawal', entityType: 'wallet_transaction', entityId: withdrawal.txId, newValues: { coin: coinUpper, amount: amountValue, address, network, reference } });

  res.status(200).json({
    success: true,
    message: `Withdrawal request submitted. Confirmation pending from ${CRYPTO_PROVIDER === 'obiex' ? 'Obiex' : 'Quidax'}.`,
    data: {
      txId: withdrawal.txId,
      reference,
      provider_reference: providerWithdrawId,
      status: 'pending',
      note: `Status will update via webhook when ${CRYPTO_PROVIDER === 'obiex' ? 'Obiex' : 'Quidax'} confirms the withdrawal`
    }
  });
});

// Exchange crypto to crypto (uses Quidax swap quotation: create → confirm)
export const exchangeCryptoToCrypto = catchAsync(async (req, res) => {
  const { from_coin, to_coin, amount } = req.body;

  if (kycTierLevel(req.user.kyc_tier) < 1) {
    throw new AppError('Please verify your identity (KYC) to use crypto features.', 403, 'KYC_TIER_REQUIRED');
  }

  if (!from_coin || !to_coin || !amount || parseFloat(amount) <= 0) {
    throw new AppError('Invalid request parameters', 400);
  }

  const fromUpper = from_coin.toUpperCase();
  const toUpper   = to_coin.toUpperCase();
  const fromAmt   = parseFloat(amount);

  // ── Step 1: Create a swap quotation (Obiex primary, Quidax fallback) ──────
  // This reserves the rate and returns the exact to_amount (inclusive of provider fees).
  let quotation;
  try {
    if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
    quotation = await cryptoFx.getSwapQuote({ from: fromUpper, to: toUpper, amount: fromAmt, side: 'from' });
    if (!quotation?.id || parseFloat(quotation.to_amount) <= 0) {
      throw new Error('Invalid quotation returned');
    }
  } catch (e) {
    logger.warn(`[CryptoSwap] Could not create ${CRYPTO_PROVIDER} quotation:`, e.message);
    throw new AppError('Could not get a live swap rate from the exchange. Please try again.', 503);
  }

  const netAmount = parseFloat(quotation.to_amount);
  const rate      = netAmount / fromAmt;

  // ── Step 2: Debit/credit wallets + confirm swap atomically ────────────────
  const result = await transaction(async (client) => {
    // Check from_wallet balance
    const fromWallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND is_active = true
       FOR UPDATE`,
      [req.user.id, fromUpper]
    );

    if (fromWallet.rows.length === 0 || parseFloat(fromWallet.rows[0].balance) < fromAmt) {
      throw new AppError('Insufficient balance', 400);
    }

    // Get or create to_wallet
    let toWallet = await client.query(
      `SELECT id FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = 'crypto' AND is_active = true`,
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

    // Confirm the swap on the provider (enqueues/executes on their side)
    let providerSwapId = quotation.id;
    try {
      const confirmed = await cryptoFx.executeSwap(quotation.id);
      if (confirmed?.id) providerSwapId = confirmed.id;
    } catch (e) {
      logger.warn(`[CryptoSwap] ${CRYPTO_PROVIDER} confirm failed (balances already updated):`, e.message);
    }

    // Record transactions
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'exchange_out', $2, $3, 'completed', $4, $5)`,
      [fromWallet.rows[0].id, fromAmt, fromUpper, `Swapped to ${toUpper}`,
       JSON.stringify({ rate, to_coin: toUpper, to_amount: netAmount, provider: CRYPTO_PROVIDER, provider_swap_id: providerSwapId })]
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'exchange_in', $2, $3, 'completed', $4, $5)`,
      [toWallet.rows[0].id, netAmount, toUpper, `Swapped from ${fromUpper}`,
       JSON.stringify({ rate, from_coin: fromUpper, from_amount: fromAmt, provider: CRYPTO_PROVIDER, provider_swap_id: providerSwapId })]
    );

    return { rate, fromAmount: fromAmt, toAmount: netAmount, providerSwapId };
  });

  res.status(200).json({
    success: true,
    data: result
  });
});

// Get crypto config (networks per coin, derived from user's wallets)
export const getCryptoConfig = catchAsync(async (req, res) => {
  try {
    let configData;
    if (CRYPTO_PROVIDER === 'obiex') {
      // Obiex has no per-user wallet list — build config from tradable currencies +
      // the global active-networks map (fee/min per network, keyed by currency code).
      const currencies = await obiex.getCurrencies();
      configData = await Promise.all(currencies.map(async (c) => {
        const nets = await obiex.getNetworksForCurrency(c.code).catch(() => []);
        return { coin: c.code, name: c.name, networks: nets, networkList: nets };
      }));
    } else {
      // Networks live inside each wallet object — fetch all wallets at once
      const walletsRes = await quidax.getAllWallets();
      const walletList = walletsRes?.data || walletsRes || [];
      const wallets = Array.isArray(walletList) ? walletList : [];

      // Only include crypto wallets that have blockchain support
      configData = wallets
        .filter(w => w.is_crypto || w.blockchain_enabled)
        .map(w => {
          const nets = (w.networks || []).map(n => ({
            network: n.id,                              // id is used in API calls (e.g. "trc20")
            name: n.name,
            deposits_enabled: n.deposits_enabled !== false,
            withdraws_enabled: n.withdraws_enabled !== false,
            withdrawFee: '0',
            withdrawMin: '0',
            withdrawMax: '1000000',
            isDefault: w.default_network === n.id,
          }));
          return {
            coin: w.currency.toUpperCase(),
            name: w.name,
            networks: nets,
            networkList: nets,   // kept for backwards compatibility
          };
        });
    }

    res.status(200).json({
      success: true,
      data: configData
    });
  } catch (err) {
    logger.error(`[CryptoConfig] ${CRYPTO_PROVIDER} Config Failed:`, err.message);

    // Fallback to static config if Quidax is down or credentials are invalid
    const d = (n, name, fee = '0') => ({ network: n, name, withdrawFee: fee, withdrawMax: '1000000', withdrawMin: '0', deposits_enabled: true, withdraws_enabled: true });
    const mockConfig = [
      { coin: 'BTC',  networkList: [d('btc',   'Bitcoin Network',        '0.0005')] },
      { coin: 'ETH',  networkList: [d('erc20', 'Ethereum (ERC20)',        '0.005')] },
      {
        coin: 'USDT', networkList: [
          d('trc20',  'Tron (TRC20)',           '1'),
          d('erc20',  'Ethereum (ERC20)',        '10'),
          d('bep20',  'BNB Smart Chain (BEP20)', '0.5'),
          d('solana', 'Solana',                  '1'),
          d('celo',   'Celo',                    '0.5'),
          d('ton',    'TON (The Open Network)',   '0.5'),
          d('avaxc',  'Avalanche C-Chain',        '1'),
          d('matic',  'Polygon (MATIC)',           '0.5'),
        ]
      },
      {
        coin: 'USDC', networkList: [
          d('erc20',  'Ethereum (ERC20)',        '10'),
          d('trc20',  'Tron (TRC20)',             '1'),
          d('bep20',  'BNB Smart Chain (BEP20)', '0.5'),
          d('solana', 'Solana',                   '1'),
        ]
      },
      { coin: 'SOL',  networkList: [d('solana', 'Solana',                '0.01')] },
      { coin: 'BNB',  networkList: [d('bep20',  'BNB Smart Chain (BEP20)', '0.0003')] },
      { coin: 'TRX',  networkList: [d('trc20',  'Tron (TRC20)',           '1')] },
      { coin: 'XRP',  networkList: [d('xrp',    'XRP Ledger',             '0.25')] },
      { coin: 'ADA',  networkList: [d('ada',    'Cardano',                '0.5')] },
      { coin: 'DOGE', networkList: [d('doge',   'Dogecoin',               '5')] },
      { coin: 'LTC',  networkList: [d('ltc',    'Litecoin',               '0.01')] },
      { coin: 'MATIC',networkList: [d('matic',  'Polygon (MATIC)',        '0.1')] },
      { coin: 'DASH', networkList: [d('dash',   'Dash',                   '0.01')] },
      { coin: 'XLM',  networkList: [d('xlm',    'Stellar',                '0.01')] },
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

// Get swap quote (GET /crypto/swap/quote) — uses real swap_quotation endpoint
export const getSwapQuote = catchAsync(async (req, res) => {
  const { from, to, amount, side } = req.query;
  if (!from || !to || !amount) {
    throw new AppError('from, to, and amount are required', 400);
  }
  try {
    const quidaxUserId = await getQuidaxSubUserIdForRequest(req);
    // Delegate to the real swap_quotation endpoint (temporary_swap_quotation
    // does not exist on openapi.quidax.io)
    const data = await quidax.getSwapQuote({
      from,
      to,
      amount,
      side: side === 'to' ? 'to' : 'from'
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn(`[SwapQuote] Quidax failed for ${from}->${to}:`, err.message);
    // Ticker cache fallback — return indicative rate only (no quotation ID)
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
    // Serve the always-warm in-memory snapshot (non-blocking) rather than a live Quidax fetch, so
    // the dashboard's 15s ticker poll can never hang the page when the exchange is slow.
    const all = await getAllTickers();
    const data = market ? (all?.[String(market).toLowerCase()] || null) : all;
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn('[24hTickers] ticker unavailable:', err.message);
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
  const data = await quidax.getUserOrders(market, status);
  res.status(200).json({ success: true, data });
});

// Cancel order
export const cancelOrder = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = await quidax.cancelOrder(id);
  res.status(200).json({ success: true, data });
});

// Get withdrawal fee estimate
export const getWithdrawFee = catchAsync(async (req, res) => {
  const { coin, network } = req.query;

  if (!coin) {
    throw new AppError('Coin parameter is required', 400);
  }

  const data = await cryptoFx.getWithdrawFee(coin, network);
  res.status(200).json({ success: true, data });
});

// ── Quotation-based Swap Flow ─────────────────────────────────────────────────
// Fiat currencies that use 'fiat' wallet_type in our DB
const FIAT_CURRENCIES = new Set(['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR', 'CAD', 'CNY', 'AUD', 'JPY']);
const getWalletType = (currency) => FIAT_CURRENCIES.has(currency.toUpperCase()) ? 'fiat' : 'crypto';

// Step 2 — Create a real swap quotation (15-second window)
// POST /crypto/swap/quotation
export const createSwapQuotation = catchAsync(async (req, res) => {
  const { from_currency, to_currency, from_amount, to_amount } = req.body;

  if (kycTierLevel(req.user.kyc_tier) < 1) throw new AppError('Please verify your identity (KYC) to use swaps.', 403, 'KYC_TIER_REQUIRED');
  if (!from_currency || !to_currency) throw new AppError('from_currency and to_currency are required', 400);
  if (from_amount != null && to_amount != null) throw new AppError('Provide exactly one of from_amount or to_amount', 400);
  if (from_amount == null && to_amount == null) throw new AppError('Exactly one of from_amount or to_amount is required', 400);

  if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
  const quotation = await cryptoFx.getSwapQuote({
    from: from_currency,
    to: to_currency,
    amount: from_amount != null ? from_amount : to_amount,
    side: from_amount != null ? 'from' : 'to'
  });

  if (!quotation?.id || parseFloat(quotation.to_amount) <= 0) {
    throw new AppError('Could not create a live swap quotation. Please try again.', 503);
  }

  res.status(200).json({ success: true, data: quotation });
});

// Step 3 — Refresh an existing quotation before it expires
// POST /crypto/swap/quotation/:id/refresh
export const refreshSwapQuotation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { from_currency, to_currency, from_amount, to_amount } = req.body;

  if (!id) throw new AppError('Quotation ID is required', 400);

  // Build refresh body — the provider requires the same params as the original quote
  const body = {};
  if (from_currency) body.from_currency = from_currency.toLowerCase();
  if (to_currency)   body.to_currency   = to_currency.toLowerCase();
  if (from_amount != null) body.from_amount = String(from_amount);
  else if (to_amount != null) body.to_amount = String(to_amount);

  if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
  const quotation = await cryptoFx.refreshSwapQuotation(id, body);

  if (!quotation?.id) throw new AppError('Could not refresh swap quotation. Please try again.', 503);

  res.status(200).json({ success: true, data: quotation });
});

// Step 4 — Confirm a quotation, execute the swap, and record in DB
// POST /crypto/swap/quotation/:id/confirm
export const confirmSwapQuotation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { from_currency, from_amount } = req.body || {};

  if (kycTierLevel(req.user.kyc_tier) < 1) throw new AppError('Please verify your identity (KYC) to use swaps.', 403, 'KYC_TIER_REQUIRED');
  if (!id) throw new AppError('Quotation ID is required', 400);

  if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);

  if (from_currency && from_amount != null) {
    const fromCurrency = from_currency.toUpperCase();
    const fromType = getWalletType(fromCurrency);
    const localWallet = await query(
      `SELECT balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND wallet_type = $3 AND is_active = true`,
      [req.user.id, fromCurrency, fromType]
    );

    if (localWallet.rows.length === 0) {
      throw new AppError(`No local wallet found for ${fromCurrency}`, 404);
    } else {
      const localBal = parseFloat(localWallet.rows[0].balance);
      const requestedAmt = parseFloat(from_amount);
      if (localBal < requestedAmt) {
        throw new AppError('Insufficient balance', 400);
      }
    }
  }


  // Execute swap on the provider — this is the authoritative action
  const confirmed = await cryptoFx.executeSwap(id);

  if (!confirmed?.id) throw new AppError('Swap execution failed. Please refresh and try again.', 503);

  // Extract amounts and currencies from the provider's response
  const fromCurrency = (confirmed.from_currency || confirmed.swap_quotation?.from_currency || '').toUpperCase();
  const toCurrency   = (confirmed.to_currency   || confirmed.swap_quotation?.to_currency   || '').toUpperCase();
  const fromAmount   = parseFloat(confirmed.from_amount || confirmed.swap_quotation?.from_amount || 0);
  const toAmount     = parseFloat(confirmed.received_amount || confirmed.swap_quotation?.to_amount || 0);
  const fromType     = getWalletType(fromCurrency);
  const toType       = getWalletType(toCurrency);

  // Update our local wallets — best-effort (swap already executed on Quidax)
  if (fromCurrency && toCurrency && fromAmount > 0 && toAmount > 0) {
    try {
      await transaction(async (client) => {
        const fromWallet = await client.query(
          `SELECT id, balance FROM wallets
           WHERE user_id = $1 AND currency = $2 AND wallet_type = $3 AND is_active = true
           FOR UPDATE`,
          [req.user.id, fromCurrency, fromType]
        );

        if (fromWallet.rows.length === 0 || parseFloat(fromWallet.rows[0].balance) < fromAmount) {
          throw new Error('Insufficient local balance for DB update');
        }

        let toWallet = await client.query(
          `SELECT id FROM wallets
           WHERE user_id = $1 AND currency = $2 AND wallet_type = $3 AND is_active = true`,
          [req.user.id, toCurrency, toType]
        );

        if (toWallet.rows.length === 0) {
          toWallet = await client.query(
            `INSERT INTO wallets (user_id, currency, wallet_type, balance)
             VALUES ($1, $2, $3, 0) RETURNING id`,
            [req.user.id, toCurrency, toType]
          );
        }

        await client.query(
          'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
          [fromAmount, fromWallet.rows[0].id]
        );
        await client.query(
          'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
          [toAmount, toWallet.rows[0].id]
        );

        const meta = JSON.stringify({ provider: CRYPTO_PROVIDER, provider_swap_id: confirmed.id, quotation_id: id });

        await client.query(
          `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
           VALUES ($1, 'exchange_out', $2, $3, 'completed', $4, $5)`,
          [fromWallet.rows[0].id, fromAmount, fromCurrency, `Swapped to ${toCurrency}`, meta]
        );
        await client.query(
          `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
           VALUES ($1, 'exchange_in', $2, $3, 'completed', $4, $5)`,
          [toWallet.rows[0].id, toAmount, toCurrency, `Swapped from ${fromCurrency}`, meta]
        );
      });
    } catch (dbErr) {
      // DB update failed but the swap already succeeded on the provider — log and continue
      logger.error(`[ConfirmSwap] DB update failed (swap executed on ${CRYPTO_PROVIDER}):`, dbErr.message);
    }
  }

  res.status(200).json({ success: true, data: confirmed });
});

// Step 5 — Poll swap transaction status
// GET /crypto/swap/transactions/:id
export const getSwapTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!id) throw new AppError('Transaction ID is required', 400);
  if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
  const data = await cryptoFx.getSwapTransaction(id);
  res.status(200).json({ success: true, data });
});

// GET /crypto/swap/transactions — list all swap transactions
export const getSwapTransactions = catchAsync(async (req, res) => {
  if (CRYPTO_PROVIDER === 'quidax') await getQuidaxSubUserIdForRequest(req);
  const data = await cryptoFx.getSwapTransactions();
  res.status(200).json({ success: true, data });
});

// GET /crypto/market/depth — aggregated depth data for a market pair
export const getMarketDepth = catchAsync(async (req, res) => {
  const { market } = req.query;
  if (!market) throw new AppError('market is required', 400);
  try {
    const data = await quidax.getMarketDepth(market);
    res.status(200).json({ success: true, data });
  } catch (err) {
    logger.warn(`[MarketDepth] Quidax failed for ${market}:`, err.message);
    res.status(200).json({ success: true, data: { asks: [], bids: [] }, message: 'Depth data temporarily unavailable' });
  }
});
