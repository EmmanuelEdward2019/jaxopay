import { useMemo } from 'react';
import { Clock, Activity, TrendingUp, TrendingDown } from 'lucide-react';

const TradeHistory = ({ trades = [], loading }) => {
  const processedTrades = useMemo(() => {
    if (!Array.isArray(trades)) return [];
    return trades.map(trade => {
      const price = parseFloat(trade.price || trade[0] || 0);
      const amount = parseFloat(trade.amount || trade.volume || trade[1] || 0);
      const time = trade.created_at || trade.time || Date.now();
      const side = trade.side || trade.type || 'buy';
      return {
        price, amount,
        side: side.toString().toLowerCase(),
        time: new Date(time),
        id: trade.id || `${price}-${amount}-${time}`
      };
    }).sort((a, b) => b.time - a.time).slice(0, 50);
  }, [trades]);

  const formatPrice = (price) => {
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  };

  const formatTime = (date) => date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const getTimeAgo = (date) => {
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return formatTime(date);
  };

  return (
    <div className="flex flex-col h-full bg-[#161a1f]">
      <div className="px-3 py-2 border-b border-[#2b3139] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[#848e9c]" />
          <h3 className="text-[11px] font-bold text-[#848e9c] uppercase tracking-wide">Market Trades</h3>
        </div>
        {loading && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#f0b90b] animate-pulse" />
            <span className="text-[9px] text-[#848e9c]">Live</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 px-2 py-1.5 bg-[#0b0e11] border-b border-[#2b3139]">
        <span className="text-[10px] font-bold text-[#848e9c] uppercase px-1">Price</span>
        <span className="text-[10px] font-bold text-[#848e9c] uppercase px-1 text-right">Amount</span>
        <span className="text-[10px] font-bold text-[#848e9c] uppercase px-1 text-right">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading && processedTrades.length === 0 ? (
          <div className="p-4 space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="h-3 bg-[#2b3139] rounded w-16 animate-pulse" />
                <div className="h-3 bg-[#2b3139] rounded w-12 animate-pulse ml-auto" />
                <div className="h-3 bg-[#2b3139] rounded w-10 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {processedTrades.map((trade, index) => (
              <div
                key={trade.id}
                className={`grid grid-cols-3 gap-1 px-2 py-1 hover:bg-[#1e2329] transition-colors cursor-pointer ${
                  index % 2 === 0 ? 'bg-[#161a1f]' : 'bg-[#161a1f]/80'
                }`}
              >
                <div className="flex items-center gap-1 px-1">
                  {trade.side === 'buy' ? (
                    <TrendingUp className="w-3 h-3 text-[#0ecb81] flex-shrink-0" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-[#f6465d] flex-shrink-0" />
                  )}
                  <span className={`text-[11px] font-semibold tabular-nums ${
                    trade.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                  }`}>
                    {formatPrice(trade.price)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-medium text-[#eaecef] tabular-nums">{trade.amount.toFixed(4)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#848e9c] tabular-nums">{formatTime(trade.time)}</span>
                </div>
              </div>
            ))}

            {processedTrades.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-[#848e9c] py-8">
                <Clock className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-[10px] font-medium">No Recent Trades</p>
              </div>
            )}
          </div>
        )}
      </div>

      {processedTrades.length > 0 && (
        <div className="px-3 py-2 border-t border-[#2b3139] bg-[#0b0e11]">
          <div className="flex items-center justify-between text-[9px] text-[#848e9c]">
            <span>{processedTrades.length} recent trades</span>
            <span>Last: {getTimeAgo(processedTrades[0].time)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeHistory;
