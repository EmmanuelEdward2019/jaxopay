import { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';

const OrderBook = ({ asks = [], bids = [], loading, onPriceClick }) => {
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [viewMode, setViewMode] = useState('both');

  const processedAsks = useMemo(() => {
    if (!Array.isArray(asks)) return [];
    const formatted = asks.map(ask => {
      if (Array.isArray(ask)) return { price: parseFloat(ask[0]), amount: parseFloat(ask[1]) };
      return { price: parseFloat(ask.price), amount: parseFloat(ask.amount) };
    });
    return formatted.sort((a, b) => a.price - b.price);
  }, [asks]);

  const processedBids = useMemo(() => {
    if (!Array.isArray(bids)) return [];
    const formatted = bids.map(bid => {
      if (Array.isArray(bid)) return { price: parseFloat(bid[0]), amount: parseFloat(bid[1]) };
      return { price: parseFloat(bid.price), amount: parseFloat(bid.amount) };
    });
    return formatted.sort((a, b) => b.price - a.price);
  }, [bids]);

  const asksWithDepth = useMemo(() => {
    let cumulative = 0;
    const maxAmount = Math.max(...processedAsks.map(a => a.amount), 0.000001);
    return processedAsks.map(ask => {
      cumulative += ask.amount;
      return { ...ask, total: ask.price * ask.amount, cumulative, depth: (ask.amount / maxAmount) * 100 };
    }).reverse();
  }, [processedAsks]);

  const bidsWithDepth = useMemo(() => {
    let cumulative = 0;
    const maxAmount = Math.max(...processedBids.map(b => b.amount), 0.000001);
    return processedBids.map(bid => {
      cumulative += bid.amount;
      return { ...bid, total: bid.price * bid.amount, cumulative, depth: (bid.amount / maxAmount) * 100 };
    });
  }, [processedBids]);

  const spread = useMemo(() => {
    const bestAsk = processedAsks[0]?.price || 0;
    const bestBid = processedBids[0]?.price || 0;
    if (bestAsk && bestBid) {
      return { value: bestAsk - bestBid, percent: ((bestAsk - bestBid) / bestAsk) * 100, mid: (bestAsk + bestBid) / 2 };
    }
    return null;
  }, [processedAsks, processedBids]);

  const formatNumber = (num, decimals = decimalPlaces) => {
    if (!num || isNaN(num)) return '0.00';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatPrice = (price) => {
    if (!price || isNaN(price)) return '0.00';
    const decimals = price < 1 ? 6 : price < 100 ? 4 : 2;
    return price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const OrderRow = ({ order, type, maxDepth }) => {
    const isAsk = type === 'ask';
    const bgColor = isAsk ? 'bg-[#f6465d]' : 'bg-[#0ecb81]';
    const textColor = isAsk ? 'text-[#f6465d]' : 'text-[#0ecb81]';

    return (
      <div
        className="relative flex items-center h-6 text-[11px] cursor-pointer hover:bg-[#1e2329] transition-colors"
        onClick={() => onPriceClick && onPriceClick(order.price)}
      >
        <div className={`absolute inset-y-0 right-0 ${bgColor} opacity-[0.08]`} style={{ width: `${Math.min(order.depth, 100)}%` }} />
        <div className={`absolute inset-y-0 right-0 ${bgColor} opacity-[0.04]`} style={{ width: `${Math.min((order.cumulative / maxDepth) * 100, 100)}%` }} />
        <div className={`flex-1 px-2 ${textColor} font-semibold tabular-nums`}>{formatPrice(order.price)}</div>
        <div className="flex-1 px-2 text-right text-[#848e9c] font-medium tabular-nums">{formatNumber(order.amount, 4)}</div>
        <div className="flex-1 px-2 text-right text-[#5e6673] tabular-nums">{formatNumber(order.total, 0)}</div>
      </div>
    );
  };

  const maxCumulative = Math.max(
    asksWithDepth[asksWithDepth.length - 1]?.cumulative || 0,
    bidsWithDepth[bidsWithDepth.length - 1]?.cumulative || 0
  );

  return (
    <div className="flex flex-col h-full bg-[#161a1f]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2b3139]">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-[#848e9c] uppercase tracking-wider">Order Book</h3>
          {loading && <RefreshCw className="w-3 h-3 text-[#f0b90b] animate-spin" />}
        </div>
        <select
          value={decimalPlaces}
          onChange={(e) => setDecimalPlaces(Number(e.target.value))}
          className="text-[10px] bg-[#1e2329] border border-[#2b3139] text-[#848e9c] rounded px-1 py-0.5 outline-none cursor-pointer"
        >
          <option value={2}>0.01</option>
          <option value={4}>0.0001</option>
          <option value={6}>0.000001</option>
        </select>
      </div>

      <div className="grid grid-cols-3 px-2 py-1.5 bg-[#0b0e11] border-b border-[#2b3139]">
        <span className="text-[10px] font-bold text-[#848e9c] uppercase px-1">Price</span>
        <span className="text-[10px] font-bold text-[#848e9c] uppercase px-1 text-right">Amount</span>
        <span className="text-[10px] font-bold text-[#848e9c] uppercase px-1 text-right">Total</span>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {(viewMode === 'both' || viewMode === 'asks') && (
          <div className="flex flex-col-reverse overflow-hidden">
            {asksWithDepth.slice(0, 10).map((ask, i) => (
              <OrderRow key={`ask-${ask.price}-${i}`} order={ask} type="ask" maxDepth={maxCumulative} />
            ))}
          </div>
        )}

        {spread && (
          <div className="flex items-center justify-between px-3 py-2 bg-[#0b0e11] border-y border-[#2b3139]">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white tabular-nums">{formatPrice(spread.mid)}</span>
              <span className="text-[9px] text-[#848e9c]">Last Price</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-[#848e9c] tabular-nums">{formatPrice(spread.value)}</span>
              <span className="text-[9px] text-[#848e9c]">Spread ({spread.percent.toFixed(2)}%)</span>
            </div>
          </div>
        )}

        {(viewMode === 'both' || viewMode === 'bids') && (
          <div className="flex flex-col overflow-hidden">
            {bidsWithDepth.slice(0, 10).map((bid, i) => (
              <OrderRow key={`bid-${bid.price}-${i}`} order={bid} type="bid" maxDepth={maxCumulative} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 px-2 py-1.5 border-t border-[#2b3139] bg-[#0b0e11]">
        {[
          { id: 'both', label: 'All', active: 'bg-[#2b3139] text-white', inactive: 'text-[#848e9c] hover:text-white' },
          { id: 'asks', label: 'Asks', active: 'bg-[#f6465d]/20 text-[#f6465d]', inactive: 'text-[#848e9c] hover:text-white' },
          { id: 'bids', label: 'Bids', active: 'bg-[#0ecb81]/20 text-[#0ecb81]', inactive: 'text-[#848e9c] hover:text-white' },
        ].map(btn => (
          <button key={btn.id} onClick={() => setViewMode(btn.id)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${viewMode === btn.id ? btn.active : btn.inactive}`}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default OrderBook;
