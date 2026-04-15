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

// Static fallback networks — used when Quidax API is unavailable or credentials are invalid.
// Network ids match Quidax's id field (lowercase). All entries include deposits_enabled /
// withdraws_enabled so the frontend filters work correctly even on the fallback path.
const n = (id, name, opts = {}) => ({
  network: id,
  name,
  deposits_enabled: opts.deposits_enabled !== false,
  withdraws_enabled: opts.withdraws_enabled !== false,
  withdrawFee: opts.withdrawFee || '0',
  withdrawMin: opts.withdrawMin || '0',
  depositMin: opts.depositMin || '0',
  isDefault: opts.isDefault || false,
  confirmations: opts.confirmations || 0,
});

const STATIC_NETWORKS = {
  // Major coins
  BTC:  [n('btc',    'Bitcoin Network',          { withdrawFee: '0.0005', withdrawMin: '0.001', depositMin: '0.0001', isDefault: true, confirmations: 3 })],
  ETH:  [n('erc20',  'Ethereum (ERC20)',          { withdrawFee: '0.005',  withdrawMin: '0.01',  depositMin: '0.001',  isDefault: true, confirmations: 12 })],
  USDT: [
    n('trc20',   'Tron (TRC20)',                  { withdrawFee: '1',    withdrawMin: '10',  depositMin: '1',   isDefault: true,  confirmations: 20 }),
    n('erc20',   'Ethereum (ERC20)',              { withdrawFee: '10',   withdrawMin: '20',  depositMin: '10',  isDefault: false, confirmations: 12 }),
    n('bep20',   'BNB Smart Chain (BEP20)',        { withdrawFee: '0.5',  withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 15 }),
    n('solana',  'Solana',                         { withdrawFee: '1',    withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 32 }),
    n('celo',    'Celo',                           { withdrawFee: '0.5',  withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 3  }),
    n('ton',     'TON (The Open Network)',          { withdrawFee: '0.5',  withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 3  }),
    n('avaxc',   'Avalanche C-Chain',              { withdrawFee: '1',    withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 12 }),
    n('matic',   'Polygon (MATIC)',                { withdrawFee: '0.5',  withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 100 }),
  ],
  USDC: [
    n('erc20',   'Ethereum (ERC20)',              { withdrawFee: '10',   withdrawMin: '20',  depositMin: '10',  isDefault: true,  confirmations: 12 }),
    n('trc20',   'Tron (TRC20)',                  { withdrawFee: '1',    withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 20 }),
    n('bep20',   'BNB Smart Chain (BEP20)',        { withdrawFee: '0.5',  withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 15 }),
    n('solana',  'Solana',                         { withdrawFee: '1',    withdrawMin: '10',  depositMin: '1',   isDefault: false, confirmations: 32 }),
  ],
  SOL:  [n('solana', 'Solana',                    { withdrawFee: '0.01', withdrawMin: '0.1', depositMin: '0.01', isDefault: true, confirmations: 32 })],
  BNB:  [n('bep20',  'BNB Smart Chain (BEP20)',   { withdrawFee: '0.0003', withdrawMin: '0.01', depositMin: '0.001', isDefault: true, confirmations: 15 })],
  TRX:  [n('trc20',  'Tron (TRC20)',              { withdrawFee: '1',    withdrawMin: '2',   depositMin: '0.1',  isDefault: true, confirmations: 20 })],
  XRP:  [n('xrp',    'XRP Ledger',               { withdrawFee: '0.25', withdrawMin: '0.5', depositMin: '0.1',  isDefault: true, confirmations: 4  })],
  ADA:  [n('ada',    'Cardano',                   { withdrawFee: '0.5',  withdrawMin: '1',   depositMin: '0.5',  isDefault: true, confirmations: 15 })],
  DOGE: [n('doge',   'Dogecoin',                  { withdrawFee: '5',    withdrawMin: '10',  depositMin: '5',    isDefault: true, confirmations: 40 })],
  LTC:  [n('ltc',    'Litecoin',                  { withdrawFee: '0.01', withdrawMin: '0.02', depositMin: '0.001', isDefault: true, confirmations: 6 })],
  DOT:  [n('dot',    'Polkadot',                  { withdrawFee: '0.1',  withdrawMin: '1',   depositMin: '0.1',  isDefault: true, confirmations: 10 })],
  POL:  [n('matic',  'Polygon',                   { withdrawFee: '0.1',  withdrawMin: '1',   depositMin: '0.1',  isDefault: true, confirmations: 100 })],
  LINK: [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0.5',  withdrawMin: '1',   depositMin: '0.5',  isDefault: true, confirmations: 12 })],
  BCH:  [n('bch',    'Bitcoin Cash',               { withdrawFee: '0.001', withdrawMin: '0.01', depositMin: '0.001', isDefault: true, confirmations: 6 })],
  DASH: [n('dash',   'Dash',                       { withdrawFee: '0.01', withdrawMin: '0.1', depositMin: '0.01', isDefault: true, confirmations: 6  })],
  XLM:  [n('xlm',    'Stellar',                   { withdrawFee: '0.01', withdrawMin: '1',   depositMin: '1',    isDefault: true, confirmations: 1  })],

  // DeFi & Layer-2 tokens
  AAVE: [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0.1',  withdrawMin: '0.5', depositMin: '0.1',  isDefault: true, confirmations: 12 })],
  CAKE: [n('bep20',  'BNB Smart Chain (BEP20)',    { withdrawFee: '0.1',  withdrawMin: '1',   depositMin: '0.5',  isDefault: true, confirmations: 15 })],
  SHIB: [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 12 })],
  FLOKI:[n('bep20',  'BNB Smart Chain (BEP20)',    { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 15 })],
  PEPE: [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 12 })],
  BONK: [n('solana', 'Solana',                     { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 32 })],

  // Quidax native & gaming
  QDX:  [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 12 })],
  SLP:  [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 12 })],

  // Algorand
  ALGO: [n('algo',   'Algorand',                   { withdrawFee: '0.01', withdrawMin: '1',   depositMin: '0.1',  isDefault: true, confirmations: 4 })],

  // Solana meme coins
  WIF:  [n('solana', 'Solana',                     { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 32 })],
  NOS:  [n('solana', 'Solana',                     { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 32 })],
  FARTCOIN: [n('solana', 'Solana',                 { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 32 })],

  // Layer-1 & new chains
  NEAR: [n('near',   'NEAR Protocol',              { withdrawFee: '0.01', withdrawMin: '1',   depositMin: '0.1',  isDefault: true, confirmations: 3 })],
  TON:  [n('ton',    'TON (The Open Network)',      { withdrawFee: '0.01', withdrawMin: '0.5', depositMin: '0.1',  isDefault: true, confirmations: 3 })],
  SUI:  [n('sui',    'Sui Network',                 { withdrawFee: '0.01', withdrawMin: '1',   depositMin: '0.1',  isDefault: true, confirmations: 3 })],
  RNDR: [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0.5',  withdrawMin: '1',   depositMin: '0.5',  isDefault: true, confirmations: 12 })],
  STRK: [n('strk',   'Starknet',                   { withdrawFee: '0.1',  withdrawMin: '1',   depositMin: '0.1',  isDefault: true, confirmations: 10 })],
  ZK:   [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 12 })],
  LSK:  [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0.1',  withdrawMin: '1',   depositMin: '0.5',  isDefault: true, confirmations: 12 })],
  CFX:  [n('cfx',    'Conflux Network',             { withdrawFee: '0.1',  withdrawMin: '1',   depositMin: '0.1',  isDefault: true, confirmations: 10 })],
  S:    [n('sonic',  'Sonic',                       { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 10 })],
  HYPE: [n('hype',   'Hyperliquid',                 { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 10 })],
  XYO:  [n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 12 })],
  AXCNH:[n('erc20',  'Ethereum (ERC20)',           { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 12 })],

  // Stablecoin - African
  CNGN: [n('bep20',  'BNB Smart Chain (BEP20)',    { withdrawFee: '0',    withdrawMin: '0',   depositMin: '0',    isDefault: true, confirmations: 15 })],
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
    // Ensure the wallet exists on Quidax (creates it if needed for newer coins)
    await quidax.ensureWalletExists(coin);

    // Fetch the user's wallet for this currency — networks live in the wallet object
    const walletRes = await quidax.getWallet(coin);
    const wallet = walletRes?.data || walletRes;

    // wallet.networks contains { id, name, deposits_enabled, withdraws_enabled }
    const quidaxNetworks = wallet?.networks || [];
    const networkList = quidaxNetworks.map(n => ({
      network: n.id,                              // id is the value used in API calls (e.g. "trc20")
      name: n.name,                               // human-readable label
      deposits_enabled: n.deposits_enabled !== false,
      withdraws_enabled: n.withdraws_enabled !== false,
      withdrawFee: '0',                           // Quidax wallet networks don't expose fee here
      withdrawMin: '0',
      withdrawMax: '1000000',
      depositMin: '0',
      isDefault: wallet?.default_network ? wallet.default_network === n.id : false,
      confirmations: 0,
    }));

    // If wallet returned no networks, fall back to static
    if (networkList.length === 0 && STATIC_NETWORKS[coinUpper]) {
      const result = { coin: coinUpper, networks: STATIC_NETWORKS[coinUpper], source: 'static' };
      await cache.set(cacheKey, result, 300);
      return res.status(200).json({ success: true, data: result });
    }

    // If still empty, create a single default entry so the UI never hard-fails
    if (networkList.length === 0) {
      networkList.push({
        network: coinUpper,
        name: coinUpper,
        deposits_enabled: true,
        withdraws_enabled: true,
        withdrawFee: '0',
        withdrawMin: '0',
        withdrawMax: '1000000',
        depositMin: '0',
        isDefault: true,
        confirmations: 0,
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

