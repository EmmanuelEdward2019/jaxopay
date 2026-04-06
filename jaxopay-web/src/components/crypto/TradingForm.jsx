import React, { useState, useEffect } from 'react';
import { RefreshCw, Info } from 'lucide-react';

const TradingForm = ({ market = 'USDTNGN', base = 'USDT', quote = 'NGN', onSubmit, loading, balances = {} }) => {
  const [side, setSide] = useState('buy'); // buy | sell
  const [type, setType] = useState('limit'); // limit | market
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');

  const currentBalance = side === 'buy' ? (balances[quote] || 0) : (balances[base] || 0);

  const handleSideChange = (newSide) => {
    setSide(newSide);
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
    if (price && val && parseFloat(price) > 0) setAmount((parseFloat(val) / parseFloat(price)).toFixed(8));
  };

  const handlePercentageClick = (percent) => {
    if (side === 'buy') {
        const affordableTotal = (currentBalance * percent) / 100;
        setTotal(affordableTotal.toFixed(2));
        if (price && parseFloat(price) > 0) {
            setAmount((affordableTotal / parseFloat(price)).toFixed(8));
        } else if (type === 'market') {
            // Suggest an amount based on percentage of balance
            setTotal(affordableTotal.toFixed(2));
        }
    } else {
        const sellAmount = (currentBalance * percent) / 100;
        setAmount(sellAmount.toFixed(8));
        if (price) setTotal((sellAmount * parseFloat(price)).toFixed(2));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ market, side, type, price, volume: amount, total: type === 'market' ? total : undefined });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Side Selector */}
      <div className="flex border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => handleSideChange('buy')}
          className={`flex-1 py-3 text-[11px] font-black uppercase transition-all border-b-2 ${side === 'buy' ? 'text-green-500 border-green-500 bg-green-50 dark:bg-green-900/10' : 'text-gray-400 border-transparent hover:text-green-500'}`}
        >
          Buy
        </button>
        <button
          onClick={() => handleSideChange('sell')}
          className={`flex-1 py-3 text-[11px] font-black uppercase transition-all border-b-2 ${side === 'sell' ? 'text-red-500 border-red-500 bg-red-50 dark:bg-red-900/10' : 'text-gray-400 border-transparent hover:text-red-500'}`}
        >
          Sell
        </button>
      </div>

      <div className="p-3 flex-1 flex flex-col space-y-4">
        {/* Order Type */}
        <div className="flex bg-gray-50 dark:bg-gray-900/50 p-0.5 rounded-lg border border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setType('limit')}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-md transition-all ${type === 'limit' ? 'bg-white dark:bg-gray-700 text-accent-600 shadow-sm' : 'text-gray-400'}`}
          >
            Limit
          </button>
          <button
            onClick={() => setType('market')}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-md transition-all ${type === 'market' ? 'bg-white dark:bg-gray-700 text-accent-600 shadow-sm' : 'text-gray-400'}`}
          >
            Market
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-3">
          <div className="space-y-3">
            {type === 'limit' ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Price</label>
                    <span className="text-[9px] font-bold text-gray-400 uppercase">{quote}</span>
                </div>
                <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-accent-500 focus:outline-none dark:text-white font-bold transition-all text-xs"
                />
              </div>
            ) : (
                <div className="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700 border-dashed text-center">
                   <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none">Executing at Best Market Price</p>
                </div>
            )}

            <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Amount</label>
                    <span className="text-[9px] font-bold text-gray-400 uppercase">{base}</span>
                </div>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-accent-500 focus:outline-none dark:text-white font-bold transition-all text-xs"
                />
            </div>

            {/* Percentage Slider / Buttons */}
            <div className="flex gap-1">
                {[25, 50, 75, 100].map(p => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => handlePercentageClick(p)}
                        className="flex-1 py-1 text-[8px] font-black text-gray-400 uppercase hover:text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/20 rounded border border-gray-100 dark:border-gray-700 transition-all"
                    >
                        {p}%
                    </button>
                ))}
            </div>

            {type === 'limit' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Total</label>
                    <span className="text-[9px] font-bold text-gray-400 uppercase">{quote}</span>
                </div>
                <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={total}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-accent-500 focus:outline-none dark:text-white font-bold transition-all text-xs"
                />
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 space-y-3">
            <div className="space-y-1 px-1">
                <div className="flex justify-between text-[9px] font-bold">
                    <span className="text-gray-400 uppercase">Available</span>
                    <span className="text-gray-600 dark:text-gray-300">
                        {parseFloat(currentBalance).toFixed(side === 'buy' ? 2 : 8)} {side === 'buy' ? quote : base}
                    </span>
                </div>
            </div>

             <button
              type="submit"
              disabled={loading || (type === 'limit' ? (!amount || !price) : (!amount && !total))}
              className={`w-full py-2.5 rounded-lg font-black text-[11px] uppercase shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                side === 'buy' ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20 text-white' : 'bg-red-500 hover:bg-red-600 shadow-red-500/20 text-white'
              }`}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : `${side} ${base}`}
            </button>
          </div>
        </form>
      </div>
      
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
           <Info className="w-3 h-3 text-gray-400" />
           <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Fee: 0.1% | Instant</span>
      </div>
    </div>
  );
};

export default TradingForm;
