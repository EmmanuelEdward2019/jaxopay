import React from 'react';

const TradeHistory = ({ trades = [], loading }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white">Recent Activity</h3>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-[11px] text-left border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="px-4 py-2 font-bold text-gray-400 uppercase tracking-wider">Price</th>
              <th className="px-4 py-2 font-bold text-gray-400 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-2 font-bold text-gray-400 uppercase tracking-wider text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {loading ? (
               [...Array(10)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3 h-4 bg-gray-100 dark:bg-gray-700 rounded-md"></td>
                  <td className="px-4 py-3 h-4 bg-gray-100 dark:bg-gray-700 rounded-md mx-2"></td>
                  <td className="px-4 py-3 h-4 bg-gray-100 dark:bg-gray-700 rounded-md"></td>
                </tr>
              ))
            ) : trades.map((trade, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className={`px-4 py-2 font-bold ${trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                  {parseFloat(trade.price).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                  {parseFloat(trade.amount).toFixed(4)}
                </td>
                <td className="px-4 py-2 text-gray-500 text-right">
                  {new Date(trade.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && trades.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-xs italic">
            No trades recorded yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeHistory;
