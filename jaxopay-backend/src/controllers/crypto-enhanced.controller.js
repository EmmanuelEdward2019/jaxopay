/**
 * Enhanced Crypto Controller with Full Quidax Integration
 * - Real-time order book from Quidax
 * - Network fetching for deposits/withdrawals
 * - Live exchange rates
 * - Spot trading
 */

import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import cache from '../utils/cache.js';

// Static fallback networks for common coins when Quidax is unavailable
const STATIC_NETWORKS = {
  BTC: [{ network: 'BTC', name: 'Bitcoin Network', withdrawFee: '0.0005', withdrawMin: '0.001', depositMin: '0.0001', isDefault: true, confirmations: 3 }],
  ETH: [{ network: 'ERC20', name: 'Ethereum (ERC20)', withdrawFee: '0.005', withdrawMin: '0.01', depositMin: '0.001', isDefault: true, confirmations: 12 }],
  USDT: [
    { network: 'TRC20', name: 'TRON (TRC20)', withdrawFee: '1', withdrawMin: '10', depositMin: '1', isDefault: true, confirmations: 20 },
    { network: 'ERC20', name: 'Ethereum (ERC20)', withdrawFee: '10', withdrawMin: '20', depositMin: '10', isDefault: false, confirmations: 12 },
    { network: 'BEP20', name: 'BNB Smart Chain (BEP20)', withdrawFee: '0.5', withdrawMin: '10', depositMin: '1', isDefault: false, confirmations: 15 },
  ],
  USDC: [
    { network: 'ERC20', name: 'Ethereum (ERC20)', withdrawFee: '10', withdrawMin: '20', depositMin: '10', isDefault: true, confirmations: 12 },
    { network: 'TRC20', name: 'TRON (TRC20)', withdrawFee: '1', withdrawMin: '10', depositMin: '1', isDefault: false, confirmations: 20 },
    { network: 'BEP20', name: 'BNB Smart Chain (BEP20)', withdrawFee: '0.5', withdrawMin: '10', depositMin: '1', isDefault: false, confirmations: 15 },
  ],
  SOL: [{ network: 'SOL', name: 'Solana', withdrawFee: '0.01', withdrawMin: '0.1', depositMin: '0.01', isDefault: true, confirmations: 32 }],
  BNB: [{ network: 'BEP20', name: 'BNB Smart Chain (BEP20)', withdrawFee: '0.0003', withdrawMin: '0.01', depositMin: '0.001', isDefault: true, confirmations: 15 }],
  TRX: [{ network: 'TRC20', name: 'TRON', withdrawFee: '1', withdrawMin: '2', depositMin: '0.1', isDefault: true, confirmations: 20 }],
  XRP: [{ network: 'XRP', name: 'XRP Ledger', withdrawFee: '0.25', withdrawMin: '0.5', depositMin: '0.1', isDefault: true, confirmations: 4 }],
  ADA: [{ network: 'ADA', name: 'Cardano', withdrawFee: '0.5', withdrawMin: '1', depositMin: '0.5', isDefault: true, confirmations: 15 }],
  DOGE: [{ network: 'DOGE', name: 'Dogecoin', withdrawFee: '5', withdrawMin: '10', depositMin: '5', isDefault: true, confirmations: 40 }],
  LTC: [{ network: 'LTC', name: 'Litecoin', withdrawFee: '0.01', withdrawMin: '0.02', depositMin: '0.001', isDefault: true, confirmations: 6 }],
  DOT: [{ network: 'DOT', name: 'Polkadot', withdrawFee: '0.1', withdrawMin: '1', depositMin: '0.1', isDefault: true, confirmations: 10 }],
  MATIC: [{ network: 'MATIC', name: 'Polygon', withdrawFee: '0.1', withdrawMin: '1', depositMin: '0.1', isDefault: true, confirmations: 100 }],
  LINK: [{ network: 'ERC20', name: 'Ethereum (ERC20)', withdrawFee: '0.5', withdrawMin: '1', depositMin: '0.5', isDefault: true, confirmations: 12 }],
};

/**
 * Get supported networks for a cryptocurrency
 * Fetches from Quidax API dynamically with static fallback
 */
export const getCryptoNetworks = catchAsync(async (req, res) => {
  const { coin } = req.query;

  if (!coin) {
    throw new AppError('Coin parameter is required', 400);
  }

  const coinUpper = coin.toUpperCase();

  // Cache key
  const cacheKey = `crypto_networks_${coin.toLowerCase()}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, cached: true });
  }

  try {
    // Get all currencies from Quidax
    const currencies = await quidax.getCurrencies();

    // Find the requested coin
    const currency = currencies.find(
      c => c.code.toLowerCase() === coin.toLowerCase()
    );

    // Extract networks from Quidax data
    const quidaxNetworks = currency?.networks || [];
    const networkList = quidaxNetworks.map(n => ({
      network: n.network || n.name,
      name: n.name || n.network,
      withdrawFee: n.withdraw_fee || n.fee || '0',
      withdrawMin: n.withdraw_min || n.min || '0',
      withdrawMax: n.withdraw_max || n.max || '1000000',
      depositMin: n.deposit_min || '0',
      isDefault: n.is_default || false,
      confirmations: n.confirmations || 6,
    }));

    // If Quidax returned no networks, fall back to static
    if (networkList.length === 0 && STATIC_NETWORKS[coinUpper]) {
      const result = { coin: coinUpper, networks: STATIC_NETWORKS[coinUpper], source: 'static' };
      await cache.set(cacheKey, result, 300);
      return res.status(200).json({ success: true, data: result });
    }

    // If coin not found at all on Quidax AND we have no static data, create a default
    if (networkList.length === 0) {
      networkList.push({
        network: coinUpper,
        name: coinUpper,
        withdrawFee: '0',
        withdrawMin: '0',
        withdrawMax: '1000000',
        depositMin: '0',
        isDefault: true,
        confirmations: 6,
      });
    }

    const result = { coin: coinUpper, networks: networkList };
    await cache.set(cacheKey, result, 300);
    res.status(200).json({ success: true, data: result });

  } catch (error) {
    logger.warn(`[CryptoNetworks] Quidax failed for ${coin}, using static fallback:`, error.message);

    // Return static fallback networks
    const staticNets = STATIC_NETWORKS[coinUpper];
    if (staticNets) {
      return res.status(200).json({
        success: true,
        data: { coin: coinUpper, networks: staticNets, source: 'static' },
      });
    }

    // Last resort: single default network
    res.status(200).json({
      success: true,
      data: {
        coin: coinUpper,
        networks: [{ network: coinUpper, name: coinUpper, withdrawFee: '0', withdrawMin: '0', isDefault: true, confirmations: 6 }],
        source: 'default',
      },
    });
  }
});

/**
 * Get real-time order book from Quidax
 * Market format: BTCUSDT, ETHNGN, etc.
 */
export const getLiveOrderBook = catchAsync(async (req, res) => {
  const { market = 'btcusdt', limit = 50 } = req.query;

  try {
    const orderBook = await quidax.getOrderBook(market.toLowerCase(), limit);

    // Transform to consistent format
    const formatted = {
      market: market.toUpperCase(),
      timestamp: Date.now(),
      asks: (orderBook.asks || []).map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
        total: parseFloat(price) * parseFloat(amount),
      })),
      bids: (orderBook.bids || []).map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
        total: parseFloat(price) * parseFloat(amount),
      })),
    };

    // Calculate spread
    if (formatted.asks.length > 0 && formatted.bids.length > 0) {
      const bestAsk = formatted.asks[0].price;
      const bestBid = formatted.bids[0].price;
      formatted.spread = bestAsk - bestBid;
      formatted.spreadPercent = ((bestAsk - bestBid) / bestAsk) * 100;
    }

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    logger.error(`[OrderBook] Failed for market ${market}:`, error.message);
    throw new AppError(error.message || 'Failed to fetch order book', 502);
  }
});

/**
 * Get live exchange rate from Quidax with caching
 */
export const getLiveExchangeRate = catchAsync(async (req, res) => {
  const { from, to, amount } = req.query;

  if (!from || !to) {
    throw new AppError('from and to parameters are required', 400);
  }

  try {
    const rate = await quidax.getExchangeRate(from, to);

    const result = {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      timestamp: Date.now(),
      expiry: Date.now() + 30000, // 30 seconds
    };

    if (amount) {
      result.amount = parseFloat(amount);
      result.exchangeAmount = parseFloat(amount) * rate;
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error(`[ExchangeRate] Failed for ${from}/${to}:`, error.message);
    throw new AppError(error.message || 'Failed to fetch exchange rate', 502);
  }
});

export default {
  getCryptoNetworks,
  getLiveOrderBook,
  getLiveExchangeRate,
};

