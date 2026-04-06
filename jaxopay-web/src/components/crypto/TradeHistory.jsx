import React, { useMemo } from 'react';
import { Clock, Activity, TrendingUp, TrendingDown } from 'lucide-react';

/**
 * Professional Market Trade History - Quidax Pro Style
 * Features:
 * - Real-time trade feed
 * - Buy/Sell indicators
 * - Time formatting
 * - Auto-scrolling to latest trades
 */
const TradeHistory = ({ trades = [], loading }) => {
  // Process and sort trades
  const processedTrades = useMemo(() => {
    if (!Array.isArray(trades)) return [];

    return trades
      .map(trade => {
        // Handle different trade formats
        const price = parseFloat(trade.price || trade[0] || 0);
        const amount = parseFloat(trade.amount || trade.volume || trade[1] || 0);
        const time = trade.created_at || trade.time || Date.now();
        const side = trade.side || trade.type || 'buy';

        return {
          price,
          amount,
          side: side.toString().toLowerCase(),
          time: new Date(time),
          id: trade.id || `${price}-${amount}-${time}`
        };
      })
      .sort((a, b) => b.time - a.time)
      .slice(0, 50); // Keep only last 50 trades
  }, [trades]);

  const formatPrice = (price) => {
    if (price >= 1000) {
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (price >= 1) {
      return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    return price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return formatTime(date);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-gray-400" />
          <h3 className="text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Market Trades
          </h3>
        </div>
        {loading && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            <span className="text-[9px] text-gray-400">Live</span>
          </div>
        )}
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase px-1">Price</span>
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase px-1 text-right">Amount</span>
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase px-1 text-right">Time</span>
      </div>

      {/* Trade List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading && processedTrades.length === 0 ? (
          <div className="p-4 space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-16 animate-pulse" />
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-12 animate-pulse ml-auto" />
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-10 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {processedTrades.map((trade, index) => (
              <motion.div
                key={trade.id}
                initial={{ opacity: 0, x: trade.side === 'buy' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: index * 0.01 }}
                className={`grid grid-cols-3 gap-1 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer ${
                  index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/50'
                }`}
              >
                {/* Price */}
                <div className="flex items-center gap-1 px-1">
                  {trade.side === 'buy' ? (
                    <TrendingUp className="w-3 h-3 text-green-500 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500 flex-shrink-0" />
                  )}
                  <span className={`text-[11px] font-semibold tabular-nums ${
                    trade.side === 'buy' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {formatPrice(trade.price)}
                  </span>
                </div>

                {/* Amount */}
                <div className="text-right">
                  <span className="text-[11px] font-medium text-gray-900 dark:text-gray-300 tabular-nums">
                    {trade.amount.toFixed(4)}
                  </span>
                </div>

                {/* Time */}
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {formatTime(trade.time)}
                  </span>
                </div>
              </motion.div>
            ))}

            {processedTrades.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
                <Clock className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-[10px] font-medium">No Recent Trades</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with stats */}
      {processedTrades.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between text-[9px] text-gray-500">
            <span>
              {processedTrades.length} recent trades
            </span>
            <span>
              Last: {getTimeAgo(processedTrades[0].time)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// Need to import motion
import { motion } from 'framer-motion';

export default TradeHistory;
