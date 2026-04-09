import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, TrendingUp, TrendingDown, Zap, Clock, ShieldCheck,
  AlertCircle, CheckCircle2, X, ChevronDown, Star, Activity,
  BarChart3, Layers, Settings
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import TradingViewChart from './TradingViewChart';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import TradingForm from './TradingForm';
import { formatCurrency } from '../../utils/formatters';

/**
 * Professional Trading Dashboard - Quidax Pro Style
 * Features:
 * - Full-width professional layout
 * - Real-time order book, trades, and chart
 * - Advanced order placement
 * - Market statistics bar
 * - Pair selection with favorites
 */
const TradeDashboard = ({ wallets = [], initialMarket = 'usdtngn' }) => {
  const [market, setMarket] = useState(initialMarket);
  const [ticker, setTicker] = useState(null);
  const [orderBook, setOrderBook] = useState({ asks: [], bids: [] });
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [availableMarkets, setAvailableMarkets] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [lastPriceDirection, setLastPriceDirection] = useState(null);
  const [userOrders, setUserOrders] = useState([]);

  // Asset mapping for display
  const baseAsset = market.toUpperCase().slice(0, market.length - 4) || 'USDT';
  const quoteAsset = market.toUpperCase().slice(-4) || 'NGN';

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('jaxo_favorite_pairs');
    if (saved) {
      setFavorites(JSON.parse(saved));
    }
  }, []);

  const toggleFavorite = (pair) => {
    const newFavorites = favorites.includes(pair)
      ? favorites.filter(p => p !== pair)
      : [...favorites, pair];
    setFavorites(newFavorites);
    localStorage.setItem('jaxo_favorite_pairs', JSON.stringify(newFavorites));
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 3000); // Poll every 3s for more responsiveness
    return () => clearInterval(interval);
  }, [market]);

  const fetchMarkets = async () => {
    const result = await cryptoService.getMarkets();
    if (result.success && result.data) {
      // Handle both array and object response formats
      const markets = Array.isArray(result.data) ? result.data : Object.values(result.data);
      setAvailableMarkets(markets);
    }
  };

  const fetchMarketData = useCallback(async () => {
    try {
      const [tickerRes, bookRes, tradeRes, ordersRes] = await Promise.allSettled([
        cryptoService.getMarketTicker(market),
        cryptoService.getOrderBook(market, 50),
        cryptoService.getMarketTrades(market, 50),
        cryptoService.getUserOrders({ market, status: 'wait' })
      ]);

      // Update ticker with price direction
      const tickerResult = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
      if (tickerResult?.success && tickerResult.data) {
        const newTicker = tickerResult.data.ticker || tickerResult.data;
        if (ticker && newTicker.last !== ticker.last) {
          setLastPriceDirection(parseFloat(newTicker.last) > parseFloat(ticker.last) ? 'up' : 'down');
        }
        setTicker(newTicker);
      }

      // Update order book
      const bookResult = bookRes.status === 'fulfilled' ? bookRes.value : null;
      if (bookResult?.success && bookResult.data) {
        const data = bookResult.data.data || bookResult.data;
        setOrderBook({
          asks: data.asks || [],
          bids: data.bids || []
        });
      }

      // Update trades
      const tradeResult = tradeRes.status === 'fulfilled' ? tradeRes.value : null;
      if (tradeResult?.success && tradeResult.data) {
        const data = Array.isArray(tradeResult.data) ? tradeResult.data : (tradeResult.data.data || tradeResult.data);
        setTrades(Array.isArray(data) ? data.slice(0, 50) : []);
      }

      // Update user orders
      const ordersResult = ordersRes.status === 'fulfilled' ? ordersRes.value : null;
      if (ordersResult?.success && ordersResult.data) {
        const data = ordersResult.data.data || ordersResult.data;
        setUserOrders(Array.isArray(data) ? data : []);
      }

    } catch (err) {
      console.error('Market data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [market, ticker]);

  const handleOrderSubmit = async (orderData) => {
    setTradeLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await cryptoService.createOrder(orderData);
      if (result.success) {
        setSuccess(`${orderData.type.toUpperCase()} ${orderData.side.toUpperCase()} order placed successfully!`);
        fetchMarketData(); // Refresh to show new order
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(result.error || 'Failed to place order');
      }
    } catch (err) {
      setError(err.message || 'Failed to place order');
    } finally {
      setTradeLoading(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      const result = await cryptoService.cancelOrder(orderId);
      if (result.success) {
        setSuccess('Order cancelled successfully');
        fetchMarketData();
      } else {
        setError(result.error || 'Failed to cancel order');
      }
    } catch (err) {
      setError(err.message || 'Failed to cancel order');
    }
  };

  const handlePriceClick = (price) => {
    // This will be passed to TradingForm via props
    // Trading form should listen for this
  };

  const balances = wallets.reduce((acc, w) => {
    acc[w.currency] = parseFloat(w.balance);
    return acc;
  }, {});

  const getChangeColor = (change) => {
    const val = parseFloat(change);
    if (val > 0) return 'text-green-500';
    if (val < 0) return 'text-red-500';
    return 'text-gray-500';
  };

  const getChangeIcon = (change) => {
    const val = parseFloat(change);
    if (val >= 0) return <TrendingUp className="w-3 h-3" />;
    return <TrendingDown className="w-3 h-3" />;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] min-h-[700px] overflow-hidden gap-1 bg-gray-50 dark:bg-gray-900">
      {/* 1. Professional Market Ticker Stats Bar */}
      <div className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        {/* Left: Market Selector */}
        <div className="flex items-center gap-4 border-r border-gray-200 dark:border-gray-700 pr-6">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white dark:ring-gray-800">
                {baseAsset.slice(0, 3)}
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white dark:ring-gray-800">
                {quoteAsset.slice(0, 3)}
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowPairSelector(!showPairSelector)}
                className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded-lg transition-colors"
              >
                <span className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                  {baseAsset}/{quoteAsset}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {/* Pair Selector Dropdown */}
              <AnimatePresence>
                {showPairSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50"
                  >
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Star className="w-3 h-3" />
                        <span>Favorites</span>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {availableMarkets.filter(m => favorites.includes(m.id)).map(m => (
                        <button
                          key={m.id}
                          onClick={() => { setMarket(m.id); setShowPairSelector(false); }}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                        >
                          <span className="text-sm font-medium">{m.name}</span>
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        </button>
                      ))}
                      <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                        <div className="px-3 py-1 text-xs text-gray-500">All Markets</div>
                        {availableMarkets.slice(0, 20).map(m => (
                          <button
                            key={m.id}
                            onClick={() => { setMarket(m.id); setShowPairSelector(false); }}
                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                          >
                            <span className="text-sm">{m.name}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(m.id); }}
                              className="p-1"
                            >
                              <Star className={`w-4 h-4 ${favorites.includes(m.id) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                            </button>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Middle: Market Stats */}
        <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
          {/* Last Price */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">Last Price</p>
            <div className="flex items-baseline gap-2">
              <p className={`text-base font-bold tabular-nums tracking-tight ${
                lastPriceDirection === 'up' ? 'text-green-500' : lastPriceDirection === 'down' ? 'text-red-500' : 'text-gray-900 dark:text-white'
              }`}>
                {parseFloat(ticker?.last || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <span className="text-xs text-gray-500">
                ≈ {formatCurrency(ticker?.last || 0, quoteAsset)}
              </span>
            </div>
          </div>

          {/* 24h Change */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">24h Change</p>
            <p className={`text-sm font-bold flex items-center gap-1 ${getChangeColor(ticker?.change)}`}>
              {getChangeIcon(ticker?.change)}
              {Math.abs(parseFloat(ticker?.change || 0)).toFixed(2)}%
            </p>
          </div>

          {/* 24h High */}
          <div className="hidden lg:block">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">24h High</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              {parseFloat(ticker?.high || ticker?.last || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* 24h Low */}
          <div className="hidden lg:block">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">24h Low</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              {parseFloat(ticker?.low || ticker?.last || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* 24h Volume */}
          <div className="hidden xl:block">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">24h Volume ({baseAsset})</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              {parseFloat(ticker?.vol || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>

          {/* 24h Value */}
          <div className="hidden xl:block">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">24h Value ({quoteAsset})</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              {formatCurrency(parseFloat(ticker?.vol || 0) * parseFloat(ticker?.last || 0), quoteAsset)}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-6">
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Chart Settings">
            <Settings className="w-4 h-4 text-gray-500" />
          </button>
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="View Mode">
            <Layers className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 2. Main Trading Layout */}
      <div className="flex-1 grid grid-cols-12 gap-1 p-1 overflow-hidden">
        {/* Left Column: Order Book (2 cols on large screens) */}
        <div className="col-span-12 lg:col-span-3 bg-white dark:bg-gray-800 flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
          <OrderBook
            asks={orderBook.asks}
            bids={orderBook.bids}
            loading={loading}
            onPriceClick={handlePriceClick}
            market={market}
          />
        </div>

        {/* Middle Column: Chart & Open Orders (7 cols on large screens) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-1 overflow-hidden">
          {/* Chart Area */}
          <div className="flex-[2] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden relative">
            <TradingViewChart symbol={market.toUpperCase()} />
          </div>

          {/* Open Orders / Order History */}
          <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4">
              <button className="text-xs font-bold text-accent-600 border-b-2 border-accent-600 pb-1">
                Open Orders ({userOrders.length})
              </button>
              <button className="text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 pb-1 transition-colors">
                Order History
              </button>
              <button className="text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 pb-1 transition-colors">
                Trade History
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {userOrders.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <tr>
                      <th className="text-left py-2 font-medium">Time</th>
                      <th className="text-left py-2 font-medium">Type</th>
                      <th className="text-right py-2 font-medium">Price</th>
                      <th className="text-right py-2 font-medium">Amount</th>
                      <th className="text-right py-2 font-medium">Filled</th>
                      <th className="text-center py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userOrders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-50 dark:border-gray-800">
                        <td className="py-2 text-gray-600 dark:text-gray-400">
                          {new Date(order.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2">
                          <span className={`font-medium ${order.side === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                            {order.side?.toUpperCase()} {order.ord_type?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{order.price}</td>
                        <td className="py-2 text-right tabular-nums">{order.origin_volume}</td>
                        <td className="py-2 text-right text-gray-500">
                          {((order.executed_volume / order.origin_volume) * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            className="px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Clock className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs font-medium">No active orders</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Trading Form & Market Trades (3 cols on large screens) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-1 overflow-hidden">
          {/* Trading Form */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <TradingForm
              market={market}
              base={baseAsset}
              quote={quoteAsset}
              balances={balances}
              loading={tradeLoading}
              onSubmit={handleOrderSubmit}
              lastPrice={ticker?.last}
            />
          </div>

          {/* Market Trades */}
          <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
            <TradeHistory trades={trades} loading={loading} />
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-white dark:bg-gray-800 px-4 py-1.5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium text-gray-500 dark:text-gray-400">API Connected</span>
          </div>
          <div className="h-3 w-px bg-gray-200 dark:bg-gray-700" />
          <span className="font-medium text-gray-500 dark:text-gray-400">Provider: Quidax Pro</span>
          <div className="h-3 w-px bg-gray-200 dark:border-gray-700" />
          <span className="font-medium text-gray-400">Spot Trading</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400">Latency: ~45ms</span>
          <span className="text-gray-400">v2.1.0</span>
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 100 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 100 }}
            className="fixed bottom-6 right-6 z-[100] max-w-sm p-4 bg-red-600 text-white rounded-xl shadow-2xl flex items-start gap-3"
          >
            <div className="p-2 bg-white/20 rounded-lg">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase mb-1">Execution Failed</p>
              <p className="text-xs opacity-90 leading-relaxed">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded-lg ml-auto">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 100 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 100 }}
            className="fixed bottom-6 right-6 z-[100] max-w-sm p-4 bg-emerald-600 text-white rounded-xl shadow-2xl flex items-start gap-3"
          >
            <div className="p-2 bg-white/20 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase mb-1">Success</p>
              <p className="text-xs opacity-90 leading-relaxed">{success}</p>
            </div>
            <button onClick={() => setSuccess(null)} className="p-1 hover:bg-white/10 rounded-lg ml-auto">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TradeDashboard;
