import React from 'react';
import { motion } from 'framer-motion';

const OrderBook = ({ asks = [], bids = [], loading }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white">Order Book</h3>
        <div className="flex gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-sm" title="Asks"></div>
          <div className="w-3 h-3 bg-green-500 rounded-sm" title="Bids"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-4 bg-gray-100 dark:bg-gray-700 rounded width-full"></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Asks (Sellers) - Top to Bottom (Desc) */}
            <div className="space-y-0.5">
              <div className="flex justify-between px-2 text-[10px] font-bold text-gray-400 uppercase mb-1">
                <span>Price</span>
                <span>Size</span>
              </div>
              {asks.slice(0, 20).map((order, i) => (
                <div key={i} className="relative flex justify-between px-2 py-0.5 text-[11px] group cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10">
                   <div 
                    className="absolute right-0 top-0 bottom-0 bg-red-500/5 transition-all" 
                    style={{ width: `${Math.min(100, (order.amount / Math.max(...asks.map(a => a.amount))) * 100)}%` }}
                  />
                  <span className="font-bold text-red-500 relative z-10">{parseFloat(order.price).toLocaleString()}</span>
                  <span className="text-gray-600 dark:text-gray-400 relative z-10">{parseFloat(order.amount).toFixed(4)}</span>
                </div>
              ))}
            </div>

            {/* Bids (Buyers) */}
            <div className="space-y-0.5">
              <div className="flex justify-between px-2 text-[10px] font-bold text-gray-400 uppercase mb-1">
                <span>Price</span>
                <span>Size</span>
              </div>
              {bids.slice(0, 20).map((order, i) => (
                <div key={i} className="relative flex justify-between px-2 py-0.5 text-[11px] group cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/10">
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-green-500/5 transition-all" 
                    style={{ width: `${Math.min(100, (order.amount / Math.max(...bids.map(b => b.amount))) * 100)}%` }}
                  />
                  <span className="font-bold text-green-500 relative z-10">{parseFloat(order.price).toLocaleString()}</span>
                  <span className="text-gray-600 dark:text-gray-400 relative z-10">{parseFloat(order.amount).toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderBook;
