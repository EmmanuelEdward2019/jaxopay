import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Info, AlertCircle, Wallet } from 'lucide-react';

const TradingForm = ({ market = 'USDTNGN', base = 'USDT', quote = 'NGN', onSubmit, loading, balances = {} }) => {
  const navigate = useNavigate();
  const [side, setSide] = useState('buy');
  const [type, setType] = useState('limit');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');
  const [insufficientBalance, setInsufficientBalance] = useState(false);

  const currentBalance = side === 'buy' ? (balances[quote] || 0) : (balances[base] || 0);

  const handleSideChange = (newSide) => { setSide(newSide); setAmount(''); setTotal(''); };

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
      if (price && parseFloat(price) > 0) setAmount((affordableTotal / parseFloat(price)).toFixed(8));
    } else {
      const sellAmount = (currentBalance * percent) / 100;
      setAmount(sellAmount.toFixed(8));
      if (price) setTotal((sellAmount * parseFloat(price)).toFixed(2));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const needed = side === 'buy' ? parseFloat(total || 0) : parseFloat(amount || 0);
    if (needed > currentBalance) {
      setInsufficientBalance(true);
      return;
    }
    setInsufficientBalance(false);
    onSubmit({ market, side, type, price, volume: amount, total: type === 'market' ? total : undefined });
  };

  return (
    <div className="flex flex-col h-full bg-[#161a1f]">
      {/* Side Selector */}
      <div className="flex border-b border-[#2b3139]">
        <button onClick={() => handleSideChange('buy')}
          className={`flex-1 py-3 text-[11px] font-black uppercase transition-all border-b-2 ${
            side === 'buy' ? 'text-[#0ecb81] border-[#0ecb81] bg-[#0ecb81]/5' : 'text-[#848e9c] border-transparent hover:text-[#0ecb81]'
          }`}>Buy</button>
        <button onClick={() => handleSideChange('sell')}
          className={`flex-1 py-3 text-[11px] font-black uppercase transition-all border-b-2 ${
            side === 'sell' ? 'text-[#f6465d] border-[#f6465d] bg-[#f6465d]/5' : 'text-[#848e9c] border-transparent hover:text-[#f6465d]'
          }`}>Sell</button>
      </div>

      <div className="p-3 flex-1 flex flex-col space-y-4">
        {/* Order Type */}
        <div className="flex bg-[#0b0e11] p-0.5 rounded-lg border border-[#2b3139]">
          <button onClick={() => setType('limit')}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-md transition-all ${
              type === 'limit' ? 'bg-[#2b3139] text-[#f0b90b] shadow-sm' : 'text-[#848e9c]'
            }`}>Limit</button>
          <button onClick={() => setType('market')}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-md transition-all ${
              type === 'market' ? 'bg-[#2b3139] text-[#f0b90b] shadow-sm' : 'text-[#848e9c]'
            }`}>Market</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-3">
          <div className="space-y-3">
            {type === 'limit' ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[9px] font-black text-[#848e9c] uppercase tracking-tighter">Price</label>
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase">{quote}</span>
                </div>
                <input type="number" step="0.01" placeholder="0.00" value={price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg focus:ring-1 focus:ring-[#f0b90b] focus:border-[#f0b90b] focus:outline-none text-white font-bold transition-all text-xs" />
              </div>
            ) : (
              <div className="p-2.5 bg-[#0b0e11] rounded-lg border border-[#2b3139] border-dashed text-center">
                <p className="text-[9px] text-[#848e9c] font-bold uppercase tracking-widest leading-none">Executing at Best Market Price</p>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between items-center px-1">
                <label className="text-[9px] font-black text-[#848e9c] uppercase tracking-tighter">Amount</label>
                <span className="text-[9px] font-bold text-[#848e9c] uppercase">{base}</span>
              </div>
              <input type="number" step="0.0001" placeholder="0.00" value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg focus:ring-1 focus:ring-[#f0b90b] focus:border-[#f0b90b] focus:outline-none text-white font-bold transition-all text-xs" />
            </div>

            {/* Percentage Buttons */}
            <div className="flex gap-1">
              {[25, 50, 75, 100].map(p => (
                <button key={p} type="button" onClick={() => handlePercentageClick(p)}
                  className="flex-1 py-1 text-[8px] font-black text-[#848e9c] uppercase hover:text-[#f0b90b] hover:bg-[#f0b90b]/10 rounded border border-[#2b3139] transition-all">
                  {p}%
                </button>
              ))}
            </div>

            {type === 'limit' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[9px] font-black text-[#848e9c] uppercase tracking-tighter">Total</label>
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase">{quote}</span>
                </div>
                <input type="number" step="0.01" placeholder="0.00" value={total}
                  onChange={(e) => handleTotalChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg focus:ring-1 focus:ring-[#f0b90b] focus:border-[#f0b90b] focus:outline-none text-white font-bold transition-all text-xs" />
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 space-y-3">
            <div className="space-y-1 px-1">
              <div className="flex justify-between text-[9px] font-bold">
                <span className="text-[#848e9c] uppercase">Available</span>
                <span className="text-[#eaecef]">
                  {parseFloat(currentBalance).toFixed(side === 'buy' ? 2 : 8)} {side === 'buy' ? quote : base}
                </span>
              </div>
            </div>

            {insufficientBalance && (
              <div className="p-2.5 bg-[#f6465d]/10 border border-[#f6465d]/30 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-[#f6465d]" />
                  <span className="text-[9px] font-bold text-[#f6465d] uppercase">Insufficient {side === 'buy' ? quote : base} balance</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/wallets')}
                  className="w-full py-1.5 bg-[#f0b90b] hover:bg-[#f0b90b]/90 text-[#0b0e11] rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Wallet className="w-3 h-3" />
                  Fund Wallet
                </button>
              </div>
            )}

            <button type="submit"
              disabled={loading || (type === 'limit' ? (!amount || !price) : (!amount && !total))}
              className={`w-full py-2.5 rounded-lg font-black text-[11px] uppercase shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                side === 'buy'
                  ? 'bg-[#0ecb81] hover:bg-[#0ecb81]/90 shadow-[#0ecb81]/20 text-white'
                  : 'bg-[#f6465d] hover:bg-[#f6465d]/90 shadow-[#f6465d]/20 text-white'
              }`}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : `${side} ${base}`}
            </button>
          </div>
        </form>
      </div>

      <div className="px-4 py-2 bg-[#0b0e11] border-t border-[#2b3139] flex items-center gap-2">
        <Info className="w-3 h-3 text-[#848e9c]" />
        <span className="text-[8px] text-[#848e9c] font-bold uppercase tracking-wider">Fee: 0.1% | Instant</span>
      </div>
    </div>
  );
};

export default TradingForm;
