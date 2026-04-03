import React, { useState } from 'react';
import { RefreshCw, Wallet, ArrowRight, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TradingForm = ({ market = 'USDTNGN', base = 'USDT', quote = 'NGN', onSubmit, loading, balances = {} }) => {
  const [side, setSide] = useState('buy'); // buy | sell
  const [type, setType] = useState('limit'); // limit | market
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');

  const handleSideChange = (newSide) => {
    setSide(newSide);
    setPrice('');
    setAmount('');
    setTotal('');
  };

  const handlePriceChange = (val) => {
    setPrice(val);
    if (amount && val) setTotal((parseFloat(val) * parseFloat(amount)).toFixed(2));
  };

  const handleAmountChange = (val) => {
    setAmount(val);
    if (price && val) setTotal((parseFloat(price) * parseFloat(val)).toFixed(2));
  };

  const handleTotalChange = (val) => {
    setTotal(val);
    if (price && val) setAmount((parseFloat(val) / parseFloat(price)).toFixed(8));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ market, side, type, price, volume: amount, total: type === 'market' ? total : undefined });
  };

  const currentBalance = side === 'buy' ? balances[quote] : balances[base];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-gray-700 shadow-xl overflow-hidden flex flex-col h-full">
      {/* Side Selector */}
      <div className="flex p-2 bg-gray-50/50 dark:bg-gray-900/50">
        <button
          onClick={() => handleSideChange('buy')}
          className={`flex-1 py-3 font-black text-sm rounded-xl transition-all ${side === 'buy' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-400 hover:text-green-500'}`}
        >
          BUY {base}
        </button>
        <button
          onClick={() => handleSideChange('sell')}
          className={`flex-1 py-3 font-black text-sm rounded-xl transition-all ${side === 'sell' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-gray-400 hover:text-red-500'}`}
        >
          SELL {base}
        </button>
      </div>

      <div className="p-6 flex-1 space-y-6">
        {/* Order Type */}
        <div className="flex bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl">
          <button
            onClick={() => setType('limit')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'limit' ? 'bg-white dark:bg-gray-700 text-accent-600 shadow-sm' : 'text-gray-500'}`}
          >
            Limit
          </button>
          <button
            onClick={() => setType('market')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${type === 'market' ? 'bg-white dark:bg-gray-700 text-accent-600 shadow-sm' : 'text-gray-500'}`}
          >
            Market
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            {type === 'limit' ? (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Price ({quote})</label>
                <div className="relative group">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold transition-all text-lg"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 font-bold text-xs">{quote}</div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-accent-50 dark:bg-accent-900/10 rounded-2xl border border-accent-100 dark:border-accent-800/20 text-center">
                   <p className="text-xs text-accent-600 font-bold">Executing at Best Market Price</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Amount ({base})</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold transition-all text-lg"
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 font-bold text-xs">{base}</div>
              </div>
            </div>

            {type === 'limit' && (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Total ({quote})</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={total}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold transition-all text-lg"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 font-bold text-xs">{quote}</div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Available Balance</span>
                <span className="text-[11px] font-black text-accent-600 px-2 py-1 bg-accent-50 dark:bg-accent-900/20 rounded-lg">
                    {currentBalance?.toLocaleString() || '0.00'} {side === 'buy' ? quote : base}
                </span>
            </div>

             <button
              type="submit"
              disabled={loading || !amount}
              className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${
                side === 'buy' ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20 text-white' : 'bg-red-500 hover:bg-red-600 shadow-red-500/20 text-white'
              }`}
            >
              {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : `${side.toUpperCase()} ${base}`}
            </button>
          </div>
        </form>
      </div>
      
      <div className="px-8 py-4 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
           <Info className="w-4 h-4 text-gray-400" />
           <span className="text-[10px] text-gray-400 font-medium">Fee: 0.1% | Instant Execution</span>
      </div>
    </div>
  );
};

export default TradingForm;
