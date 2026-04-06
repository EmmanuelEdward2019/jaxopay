import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Professional Order Book Component - Quidax Pro Style
 * Features:
 * - Depth visualization with color-coded bars
 * - Ask/Sell orders in red, Bid/Buy orders in green
 * - Spread display with mid-price
 * - Real-time updates
 * - Aggregated view for better readability
 */
const OrderBook = ({ asks = [], bids = [], loading, onPriceClick, market = 'USDT_NGN' }) => {
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [viewMode, setViewMode] = useState('both'); // 'both', 'asks', 'bids'

  // Process and format order book data
  const processedAsks = useMemo(() => {
    if (!Array.isArray(asks)) return [];
    // Handle both array formats: [price, amount] or {price, amount}
    const formatted = asks.map(ask => {
      if (Array.isArray(ask)) {
        return { price: parseFloat(ask[0]), amount: parseFloat(ask[1]) };
      }
      return { price: parseFloat(ask.price), amount: parseFloat(ask.amount) };
    });
    // Sort by price ascending (lowest ask first)
    return formatted.sort((a, b) => a.price - b.price);
  }, [asks]);

  const processedBids = useMemo(() => {
    if (!Array.isArray(bids)) return [];
    const formatted = bids.map(bid => {
      if (Array.isArray(bid)) {
        return { price: parseFloat(bid[0]), amount: parseFloat(bid[1]) };
      }
      return { price: parseFloat(bid.price), amount: parseFloat(bid.amount) };
    });
    // Sort by price descending (highest bid first)
    return formatted.sort((a, b) => b.price - a.price);
  }, [bids]);

  // Calculate cumulative totals for depth visualization
  const asksWithDepth = useMemo(() => {
    let cumulative = 0;
    const maxAmount = Math.max(...processedAsks.map(a => a.amount), 0.000001);
    return processedAsks.map(ask => {
      cumulative += ask.amount;
      return {
        ...ask,
        total: ask.price * ask.amount,
        cumulative,
        depth: (ask.amount / maxAmount) * 100
      };
    }).reverse(); // Reverse to show highest asks at top
  }, [processedAsks]);

  const bidsWithDepth = useMemo(() => {
    let cumulative = 0;
    const maxAmount = Math.max(...processedBids.map(b => b.amount), 0.000001);
    return processedBids.map(bid => {
      cumulative += bid.amount;
      return {
        ...bid,
        total: bid.price * bid.amount,
        cumulative,
        depth: (bid.amount / maxAmount) * 100
      };
    });
  }, [processedBids]);

  // Calculate spread
  const spread = useMemo(() => {
    const bestAsk = processedAsks[0]?.price || 0;
    const bestBid = processedBids[0]?.price || 0;
    if (bestAsk && bestBid) {
      return {
        value: bestAsk - bestBid,
        percent: ((bestAsk - bestBid) / bestAsk) * 100,
        mid: (bestAsk + bestBid) / 2
      };
    }
    return null;
  }, [processedAsks, processedBids]);

  const formatNumber = (num, decimals = decimalPlaces) => {
    if (!num || isNaN(num)) return '0.00';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatPrice = (price) => {
    if (!price || isNaN(price)) return '0.00';
    // Show more decimals for lower prices
    const decimals = price < 1 ? 6 : price < 100 ? 4 : 2;
    return price.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const OrderRow = ({ order, type, index, maxDepth }) => {
    const isAsk = type === 'ask';
    const bgColor = isAsk ? 'bg-red-500' : 'bg-green-500';
    const textColor = isAsk ? 'text-red-500' : 'text-green-500';
    const hoverBg = isAsk ? 'hover:bg-red-50 dark:hover:bg-red-900/10' : 'hover:bg-green-50 dark:hover:bg-green-900/10';

    return (
      <div
        className={`relative flex items-center h-6 text-[11px] cursor-pointer ${hoverBg} transition-colors`}
        onClick={() => onPriceClick && onPriceClick(order.price)}
        style={{ animationDelay: `${index * 20}ms` }}
      >
        {/* Depth bar background */}
        <div
          className={`absolute inset-y-0 right-0 ${bgColor} opacity-[0.08]`}
          style={{ width: `${Math.min(order.depth, 100)}%` }}
        />
        {/* Cumulative depth bar */}
        <div
          className={`absolute inset-y-0 right-0 ${bgColor} opacity-[0.04]`}
          style={{ width: `${Math.min((order.cumulative / maxDepth) * 100, 100)}%` }}
        />

        {/* Price */}
        <div className={`flex-1 px-2 ${textColor} font-semibold tabular-nums`}>
          {formatPrice(order.price)}
        </div>
        {/* Amount */}
        <div className="flex-1 px-2 text-right text-gray-600 dark:text-gray-400 font-medium tabular-nums">
          {formatNumber(order.amount, 4)}
        </div>
        {/* Total */}
        <div className="flex-1 px-2 text-right text-gray-400 dark:text-gray-500 tabular-nums">
          {formatNumber(order.total, 0)}
        </div>
      </div>
    );
  };

  const maxCumulative = Math.max(
    asksWithDepth[asksWithDepth.length - 1]?.cumulative || 0,
    bidsWithDepth[bidsWithDepth.length - 1]?.cumulative || 0
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Order Book
          </h3>
          {loading && <RefreshCw className="w-3 h-3 text-accent-600 animate-spin" />}
        </div>
        <div className="flex items-center gap-1">
          <select
            value={decimalPlaces}
            onChange={(e) => setDecimalPlaces(Number(e.target.value))}
            className="text-[10px] bg-gray-100 dark:bg-gray-700 border-none rounded px-1 py-0.5 outline-none cursor-pointer"
          >
            <option value={2}>0.01</option>
            <option value={4}>0.0001</option>
            <option value={6}>0.000001</option>
          </select>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-2 py-1.5 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase px-1">Price</span>
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase px-1 text-right">Amount</span>
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase px-1 text-right">Total</span>
      </div>

      {/* Order Book Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Asks (Sells) - Show only last 8-10 orders */}
        {(viewMode === 'both' || viewMode === 'asks') && (
          <div className="flex flex-col-reverse overflow-hidden">
            {asksWithDepth.slice(0, 10).map((ask, i) => (
              <OrderRow
                key={`ask-${ask.price}-${i}`}
                order={ask}
                type="ask"
                index={i}
                maxDepth={maxCumulative}
              />
            ))}
          </div>
        )}

        {/* Spread / Mid Price */}
        {spread && (
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
                {formatPrice(spread.mid)}
              </span>
              <span className="text-[9px] text-gray-500 dark:text-gray-400">
                Last Price
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400 tabular-nums">
                {formatPrice(spread.value)}
              </span>
              <span className="text-[9px] text-gray-500 dark:text-gray-400">
                Spread ({spread.percent.toFixed(2)}%)
              </span>
            </div>
          </div>
        )}

        {/* Bids (Buys) - Show only first 8-10 orders */}
        {(viewMode === 'both' || viewMode === 'bids') && (
          <div className="flex flex-col overflow-hidden">
            {bidsWithDepth.slice(0, 10).map((bid, i) => (
              <OrderRow
                key={`bid-${bid.price}-${i}`}
                order={bid}
                type="bid"
                index={i}
                maxDepth={maxCumulative}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer - View Mode Toggle */}
      <div className="flex items-center justify-center gap-1 px-2 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <button
          onClick={() => setViewMode('both')}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
            viewMode === 'both'
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setViewMode('asks')}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
            viewMode === 'asks'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Asks
        </button>
        <button
          onClick={() => setViewMode('bids')}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
            viewMode === 'bids'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Bids
        </button>
      </div>
    </div>
  );
};

export default OrderBook;
