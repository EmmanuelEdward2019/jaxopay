import React from 'react';
import { motion } from 'framer-motion';

const OrderBook = ({ asks = [], bids = [], loading }) => {
  // Calculate max amounts for depth visualization
  const maxAskAmount = asks.length > 0 ? Math.max(...asks.map(a => parseFloat(a.amount))) : 0;
  const maxBidAmount = bids.length > 0 ? Math.max(...bids.map(b => parseFloat(b.amount))) : 0;
  
  // Calculate spread
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;
  const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
  const spread = bestAsk && bestBid ? ((bestAsk - bestBid) / bestAsk * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white">Order Book</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-sm"></div>
            <span className="text-[9px] font-bold text-gray-500 uppercase">Asks</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-sm"></div>
            <span className="text-[9px] font-bold text-gray-500 uppercase">Bids</span>
          </div>
          {spread > 0 && (
            <div className="text-[9px] font-bold text-gray-400">
              Spread: {spread.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-1 animate-pulse p-2">
            {[...Array(15)].map((_, i) => (
              <div key={i} className="h-5 bg-gray-100 dark:bg-gray-700 rounded width-full"></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-gray-700">
            {/* Asks (Sellers) - Ascending order (lowest to highest) */}
            <div className="bg-white dark:bg-gray-800">
              <div className="flex justify-between px-2 py-1.5 text-[9px] font-bold text-gray-400 uppercase border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                <span>Price({asks.length})</span>
                <span>Size</span>
              </div>
              {asks.slice(0, 25).reverse().map((order, i) => (
                <div 
                  key={i} 
                  className="relative flex justify-between px-2 py-0.5 text-[10px] group cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <div 
                    className="absolute right-0 top-0 bottom-0 bg-red-500/10 transition-all" 
                    style={{ width: `${maxAskAmount > 0 ? (parseFloat(order.amount) / maxAskAmount * 100) : 0}%` }}
                  />
                  <span className="font-bold text-red-500 relative z-10">
                    {parseFloat(order.price).toLocaleString()}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 relative z-10 font-mono">
                    {parseFloat(order.amount).toFixed(4)}
                  </span>
                </div>
              ))}
            </div>

            {/* Bids (Buyers) - Descending order (highest to lowest) */}
            <div className="bg-white dark:bg-gray-800">
              <div className="flex justify-between px-2 py-1.5 text-[9px] font-bold text-gray-400 uppercase border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                <span>Price({bids.length})</span>
                <span>Size</span>
              </div>
              {bids.slice(0, 25).map((order, i) => (
                <div 
                  key={i} 
                  className="relative flex justify-between px-2 py-0.5 text-[10px] group cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/10 transition-colors"
                >
                  <div 
                    className="absolute right-0 top-0 bottom-0 bg-green-500/10 transition-all" 
                    style={{ width: `${maxBidAmount > 0 ? (parseFloat(order.amount) / maxBidAmount * 100) : 0}%` }}
                  />
                  <span className="font-bold text-green-500 relative z-10">
                    {parseFloat(order.price).toLocaleString()}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 relative z-10 font-mono">
                    {parseFloat(order.amount).toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Total Volume Summary */}
      {!loading && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900/50">
          <div className="grid grid-cols-2 gap-4 text-[10px]">
            <div>
              <span className="font-bold text-gray-400 uppercase">Total Ask: </span>
              <span className="font-black text-red-500">
                {asks.reduce((sum, a) => sum + parseFloat(a.amount), 0).toFixed(4)}
              </span>
            </div>
            <div className="text-right">
              <span className="font-bold text-gray-400 uppercase">Total Bid: </span>
              <span className="font-black text-green-500">
                {bids.reduce((sum, b) => sum + parseFloat(b.amount), 0).toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderBook;
