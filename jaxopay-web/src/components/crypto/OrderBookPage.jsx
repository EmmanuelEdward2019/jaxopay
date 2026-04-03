import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RefreshCw, 
  TrendingUp, 
  ArrowDown, 
  ArrowUp, 
  Zap, 
  Clock, 
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronDown,
  Search
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import TradingViewChart from './TradingViewChart';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import TradingForm from './TradingForm';
import { formatCurrency } from '../../utils/formatters';

const OrderBookPage = ({ wallets = [] }) => {
  const [market, setMarket] = useState('btcngn');
  const [ticker, setTicker] = useState(null);
  const [orderBook, setOrderBook] = useState({ asks: [], bids: [] });
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [availableMarkets, setAvailableMarkets] = useState([]);
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [marketSearch, setMarketSearch] = useState('');

  // Asset mapping for display
  const baseAsset = market.toUpperCase().replace(/NGN|USDT|USD|EUR|GBP/g, '').trim();
  const quoteAsset = market.match(/NGN|USDT|USD|EUR|GBP/i)?.[0]?.toUpperCase() || 'USDT';

  useEffect(() => {
    fetchMarkets();
  }, []);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 3000); // Poll every 3s for real-time feel
    return () => clearInterval(interval);
  }, [market]);

  const fetchMarkets = async () => {
    const result = await cryptoService.getMarkets();
    if (result.success) {
      setAvailableMarkets(result.data || []);
    }
  };

  const fetchMarketData = async () => {
    try {
      const [tickerRes, bookRes, tradeRes] = await Promise.all([
        cryptoService.getMarketTicker(market),
        cryptoService.getOrderBook(market, 50),
        cryptoService.getMarketTrades(market, 50)
      ]);

      if (tickerRes.success) setTicker(tickerRes.data.ticker);
      if (bookRes.success) setOrderBook(bookRes.data);
      if (tradeRes.success) setTrades(tradeRes.data);
      
      setLoading(false);
    } catch (err) {
      console.error('Market data fetch error:', err);
      setError('Failed to fetch market data. Retrying...');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleOrderSubmit = async (orderData) => {
    setTradeLoading(true);
    setError(null);
    setSuccess(null);

    const result = await cryptoService.createOrder(orderData);
    if (result.success) {
      setSuccess(`Order created: ${orderData.type.toUpperCase()} ${orderData.side.toUpperCase()}`);
      setTimeout(() => setSuccess(null), 5000);
      fetchMarketData(); // Refresh order book
    } else {
      setError(result.error);
    }
    setTradeLoading(false);
  };

  const balances = wallets.reduce((acc, w) => {
    acc[w.currency] = parseFloat(w.balance);
    return acc;
  }, {});

  const filteredMarkets = availableMarkets.filter(m => 
    m.name.toLowerCase().includes(marketSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(marketSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Market Header - Quidax Style */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-6">
          {/* Market Selector */}
          <div className="relative">
            <button
              onClick={() => setShowMarketSelector(!showMarketSelector)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-all"
            >
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-accent-600 flex items-center justify-center text-white text-xs font-black">{baseAsset}</div>
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-[10px] font-black">{quoteAsset}</div>
              </div>
              <span className="font-bold text-gray-900 dark:text-white">{baseAsset}/{quoteAsset}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* Market Selector Dropdown */}
            <AnimatePresence>
              {showMarketSelector && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowMarketSelector(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
                  >
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={marketSearch}
                          onChange={(e) => setMarketSearch(e.target.value)}
                          placeholder="Search markets..."
                          className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 dark:text-white"
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    <div className="max-h-96 overflow-y-auto p-2">
                      {filteredMarkets.length > 0 ? (
                        filteredMarkets.map(m => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setMarket(m.id);
                              setShowMarketSelector(false);
                              setMarketSearch('');
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all ${
                              market === m.id ? 'bg-accent-50 dark:bg-accent-900/20' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-gray-900 dark:text-white">{m.name}</span>
                            </div>
                            {m.change_24h && (
                              <span className={`text-xs font-bold ${
                                parseFloat(m.change_24h) >= 0 ? 'text-green-500' : 'text-red-500'
                              }`}>
                                {parseFloat(m.change_24h) >= 0 ? '+' : ''}{parseFloat(m.change_24h).toFixed(2)}%
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="py-8 text-center text-gray-400 text-sm">
                          No markets found
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Price Info */}
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Last Price</p>
              <p className={`text-lg font-black ${
                ticker?.change && parseFloat(ticker.change) >= 0 
                  ? 'text-green-500' 
                  : 'text-red-500'
              }`}>
                {parseFloat(ticker?.last || 0).toLocaleString()}
              </p>
            </div>
            
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">24h Change</p>
              <p className={`text-sm font-bold flex items-center gap-1 ${
                parseFloat(ticker?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {ticker?.change || '0.00'}% 
                {parseFloat(ticker?.change || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              </p>
            </div>

            <div className="hidden md:block">
              <p className="text-[10px] font-bold text-gray-400 uppercase">24h High</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {parseFloat(ticker?.high || 0).toLocaleString()}
              </p>
            </div>

            <div className="hidden md:block">
              <p className="text-[10px] font-bold text-gray-400 uppercase">24h Low</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {parseFloat(ticker?.low || 0).toLocaleString()}
              </p>
            </div>

            <div className="hidden lg:block">
              <p className="text-[10px] font-bold text-gray-400 uppercase">24h Volume</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {parseFloat(ticker?.vol || 0).toFixed(2)} {baseAsset}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
                <Zap className="w-3 h-3" /> Live
              </span>
              <span className="text-[10px] text-gray-400 font-bold">Quidax Market</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-600 shadow-sm"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-bold">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-xs font-black uppercase">Dismiss</button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3 text-green-600 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-bold">{success}</p>
            <button onClick={() => setSuccess(null)} className="ml-auto text-xs font-black uppercase">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Layout - Quidax Style */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Column: Chart & Order Book (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <TradingViewChart symbol={market.toUpperCase()} />
          </div>

          {/* Order Book & Trades */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OrderBook asks={orderBook.asks} bids={orderBook.bids} loading={loading} />
            <TradeHistory trades={trades} loading={loading} />
          </div>
        </div>

        {/* Right Column: Trading Form (1 col) */}
        <div className="lg:col-span-1">
          <TradingForm 
            market={market} 
            base={baseAsset} 
            quote={quoteAsset} 
            balances={balances}
            loading={tradeLoading}
            onSubmit={handleOrderSubmit}
          />

          {/* Active Orders Card */}
          <div className="mt-4 p-4 bg-gradient-to-br from-accent-600 to-indigo-700 rounded-lg text-white shadow-lg relative overflow-hidden">
            <h4 className="text-sm font-black mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Active Orders
            </h4>
            <p className="text-xs text-white/70 mb-3 leading-relaxed">
              View and manage your pending limit orders
            </p>
            <button className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-black transition-all">
              Go to History
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderBookPage;
