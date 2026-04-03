import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, TrendingUp, ArrowDown, ArrowUp, Zap, Clock, ShieldCheck } from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import TradingViewChart from './TradingViewChart';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import TradingForm from './TradingForm';
import { formatCurrency } from '../../utils/formatters';

const TradeDashboard = ({ wallets = [] }) => {
  const [market, setMarket] = useState('btcusdt');
  const [ticker, setTicker] = useState(null);
  const [orderBook, setOrderBook] = useState({ asks: [], bids: [] });
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Asset mapping for display
  const baseAsset = market.toUpperCase().slice(0, market.length - 4);
  const quoteAsset = market.toUpperCase().slice(-4);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [market]);

  const fetchMarketData = async () => {
    try {
      const [tickerRes, bookRes, tradeRes] = await Promise.all([
        cryptoService.getMarketTicker(market),
        cryptoService.getOrderBook(market, 20),
        cryptoService.getMarketTrades(market, 20)
      ]);

      if (tickerRes.success) setTicker(tickerRes.data.ticker);
      if (bookRes.success) setOrderBook(bookRes.data);
      if (tradeRes.success) setTrades(tradeRes.data);
      
      setLoading(false);
    } catch (err) {
      console.error('Market data fetch error:', err);
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
    } else {
      setError(result.error);
    }
    setTradeLoading(false);
  };

  const balances = wallets.reduce((acc, w) => {
    acc[w.currency] = parseFloat(w.balance);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Market Header */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-xl flex flex-wrap items-center gap-8">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            <div className="w-10 h-10 rounded-full bg-accent-600 flex items-center justify-center text-white ring-4 ring-white dark:ring-gray-800 text-xs font-black">{baseAsset}</div>
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 ring-4 ring-white dark:ring-gray-800 text-[10px] font-black">{quoteAsset}</div>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{baseAsset}/{quoteAsset}</h2>
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-accent-600 px-2 py-0.5 bg-accent-50 dark:bg-accent-900/20 rounded-full">Quidax Market</span>
                <span className="flex items-center gap-1 text-[10px] text-green-500 font-bold"><Zap className="w-3 h-3" /> Live</span>
            </div>
          </div>
        </div>

        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700 hidden md:block" />

        <div className="flex-1 flex flex-wrap gap-10">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Last Price</p>
            <p className="text-2xl font-black text-gray-900 dark:text-white">{parseFloat(ticker?.last || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">24h Change</p>
            <p className={`text-sm font-bold flex items-center gap-1 ${parseFloat(ticker?.change || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {ticker?.change || '0.00' }% {parseFloat(ticker?.change || 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </p>
          </div>
          <div className="hidden lg:block">
            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">24h High</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{parseFloat(ticker?.high || ticker?.last || 0).toLocaleString()}</p>
          </div>
          <div className="hidden lg:block">
            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">24h Low</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{parseFloat(ticker?.low || ticker?.last || 0).toLocaleString()}</p>
          </div>
           <div className="hidden xl:block">
            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">24h Volume</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{parseFloat(ticker?.vol || 0).toFixed(2)} {baseAsset}</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl flex items-center gap-3 text-red-600 shadow-sm"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-bold">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-xs font-black uppercase">Dismiss</button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl flex items-center gap-3 text-green-600 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-bold">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column: Chart - 3 cols span on lg */}
        <div className="lg:col-span-3 space-y-6">
           <TradingViewChart symbol={market.toUpperCase()} />
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <OrderBook asks={orderBook.asks} bids={orderBook.bids} loading={loading} />
              <TradeHistory trades={trades} loading={loading} />
           </div>
        </div>

        {/* Right column: Form */}
        <div className="lg:col-span-1">
          <TradingForm 
             market={market} 
             base={baseAsset} 
             quote={quoteAsset} 
             balances={balances}
             loading={tradeLoading}
             onSubmit={handleOrderSubmit}
          />

          <div className="mt-6 p-6 bg-gradient-to-br from-accent-600 to-indigo-700 rounded-[2rem] text-white shadow-xl shadow-accent-500/20 relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform">
                   <ShieldCheck className="w-24 h-24" />
               </div>
               <h4 className="text-lg font-black mb-2 flex items-center gap-2">
                   <Clock className="w-5 h-5" /> Active Orders
               </h4>
               <p className="text-xs text-white/70 mb-4 leading-relaxed">View and manage your pending limit orders from here.</p>
               <button className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-black transition-all">Go to History</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeDashboard;
