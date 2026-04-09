import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  TrendingUp,
  CreditCard,
  Receipt,
  RefreshCw,
  BarChart2,
  Activity,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import dashboardService from '../../services/dashboardService';
import cryptoService from '../../services/cryptoService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

/** Keeps balance text on a single line by shrinking font-size to fit the container */
const BalanceOneLine = ({ children, className = '' }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const MIN_PX = 9;
  const MAX_PX = 26;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      const available = container.clientWidth;
      if (available <= 0) return;
      text.style.whiteSpace = 'nowrap';
      let lo = MIN_PX;
      let hi = MAX_PX;
      let best = MIN_PX;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        text.style.fontSize = `${mid}px`;
        if (text.scrollWidth <= available) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      text.style.fontSize = `${best}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={containerRef} className={`min-w-0 w-full overflow-hidden ${className}`}>
      <h3
        ref={textRef}
        className="font-black text-gray-900 dark:text-white tabular-nums leading-tight"
        style={{ fontSize: `${MAX_PX}px`, whiteSpace: 'nowrap' }}
      >
        {children}
      </h3>
    </div>
  );
};

const FALLBACK_RATES = {
  'USD': 1,
  'NGN': 1650, // 1 USD = 1650 NGN
  'GBP': 0.78,
  'EUR': 0.92,
  'BTC': 0.000015,
  'ETH': 0.00028,
  'USDT': 1,
  'USDC': 1,
  'ZAR': 18.8,
  'CAD': 1.35,
  'GHS': 12.5,
  'KES': 130,
  'CNY': 7.2,
  'AUD': 1.5,
  'JPY': 150
};

const Dashboard = () => {
  const { user } = useAuthStore();
  const { isFeatureEnabled } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({
    total_balance: 0,
    wallet_count: 0,
    transaction_count: 0,
    active_cards: 0,
  });

  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      const result = await dashboardService.getSummary();
      if (result.success) {
        const walletsData = result.data.wallets || [];
        setWallets(walletsData);
        setTransactions(result.data.transactions || []);

        // Calculate Total wealth in USD
        let totalUSD = 0;
        try {
          for (const wallet of walletsData) {
            const bal = parseFloat(wallet.balance) || 0;
            const rate = FALLBACK_RATES[wallet.currency] || 1;
            totalUSD += bal / rate;
          }
        } catch (e) {
          console.error("Error calculating total wealth", e);
        }

        setStats({
          ...(result.data.stats || {}),
          total_balance: totalUSD,
          total_balance_raw: result.data.stats?.total_balance || {}
        });
      } else {
        setError(result.error || 'Failed to load dashboard data');
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const quickActions = [
    { name: 'Send Money', icon: ArrowUpRight, href: '/dashboard/wallets', color: 'bg-accent-600', enabled: true },
    { name: 'Deposit', icon: ArrowDownLeft, href: '/dashboard/wallets', color: 'bg-emerald-600', enabled: true },
    { name: 'Markets', icon: BarChart2, href: '/dashboard/markets', color: 'bg-blue-600', enabled: true },
    { name: 'Spot Trade', icon: Activity, href: '/dashboard/trade', color: 'bg-violet-600', enabled: isFeatureEnabled('crypto') },
    { name: 'Instant Swap', icon: Zap, href: '/dashboard/swap', color: 'bg-orange-500', enabled: isFeatureEnabled('crypto') },
    { name: 'Pay Bills', icon: Receipt, href: '/dashboard/bills', color: 'bg-emerald-800', enabled: isFeatureEnabled('bill_payments') },
  ].filter(action => action.enabled);

  const statsDisplay = [
    {
      name: 'Total Balance',
      value: user?.preferences?.show_balances === false ? '****' :
        formatCurrency(stats.total_balance || 0, 'USD'),
      icon: Wallet,
      change: '+12.5%',
      changeType: 'positive',
      enabled: true,
    },
    {
      name: 'Active Wallets',
      value: stats.wallet_count || wallets.length,
      icon: Wallet,
      change: '+2',
      changeType: 'positive',
      enabled: true,
    },
    {
      name: 'Transactions',
      value: stats.transaction_count || transactions.length,
      icon: TrendingUp,
      change: '+8',
      changeType: 'positive',
      enabled: true,
    },
    {
      name: 'Virtual Cards',
      value: stats.active_cards || 0,
      icon: CreditCard,
      change: 'Active',
      changeType: 'neutral',
      enabled: isFeatureEnabled('virtual_cards'),
    },
  ].filter(stat => stat.enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center justify-between">
          <p className="text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-600 font-medium text-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* Crypto Trading Hero */}
      <div className="rounded-xl overflow-hidden bg-[#0b0e11] border border-[#2b3139] relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-purple-900/20 pointer-events-none" />
        <div className="relative z-10 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div>
            <p className="text-[11px] font-bold text-[#848e9c] uppercase tracking-widest mb-1">Jaxopay Exchange</p>
            <h3 className="text-xl font-black text-white">Trade Crypto. Track Markets. Swap Instantly.</h3>
            <p className="text-sm text-[#848e9c] mt-1">Real-time order book · Spot trading · 50+ trading pairs</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              to="/dashboard/markets"
              className="flex items-center gap-2 px-4 py-2 bg-[#1e2329] border border-[#2b3139] rounded-lg text-sm font-semibold text-white hover:bg-[#2b3139] transition-colors"
            >
              <BarChart2 size={15} />
              Markets
            </Link>
            <Link
              to="/dashboard/trade"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold text-white hover:bg-blue-500 transition-colors"
            >
              <Activity size={15} />
              Spot Trade
            </Link>
            <Link
              to="/dashboard/swap"
              className="flex items-center gap-2 px-4 py-2 bg-[#f0b90b] rounded-lg text-sm font-bold text-[#0b0e11] hover:opacity-90 transition-colors"
            >
              <Zap size={15} />
              Swap
            </Link>
          </div>
        </div>
      </div>

      {/* Welcome Section */}
      <div className="card bg-gradient-to-br from-accent-600 to-accent-800 text-white border-none shadow-xl transform hover:scale-[1.01] transition-all shadow-accent-500/20 overflow-hidden relative group">
        <div className="relative z-10">
          <h2 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">Welcome back, {user?.first_name || user?.username || user?.full_name?.split(' ')[0] || 'User'}!</h2>
          <p className="text-accent-100 text-lg max-w-xl">
            Your financial hub is up and running. You have {wallets.length} active wallets across {new Set(wallets.map(w => w.currency)).size} currencies.
          </p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
          <TrendingUp className="w-32 h-32" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Balance Card with Dropdown */}
        <div className="card lg:col-span-1 border-none bg-white dark:bg-gray-800 shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-accent-50 dark:bg-accent-900/30 rounded-2xl border border-accent-100 dark:border-accent-800">
              <Wallet className="h-6 w-6 text-accent-600" />
            </div>
            <select
              className="appearance-none bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-1.5 rounded-xl text-xs font-black text-gray-700 dark:text-gray-300 focus:outline-none cursor-pointer hover:border-accent-500 transition-colors pr-8 relative z-10"
              onChange={async (e) => {
                const currency = e.target.value;
                if (currency === 'USD') {
                  setStats(prev => ({ ...prev, total_display: null }));
                } else {
                  // Show balance immediately using Fallback rate for better UX
                  const fallbackRate = FALLBACK_RATES[currency] || 1;
                  setStats(prev => ({
                    ...prev,
                    total_display: { currency, value: (prev.total_balance || 0) * fallbackRate },
                    total_display_loading: true
                  }));

                  // Then fetch real rate in background for accuracy
                  try {
                    const rateRes = await cryptoService.getExchangeRates('USD', currency);
                    if (rateRes.success) {
                      const realRate = rateRes.data.rate || rateRes.data.exchange_rate;
                      setStats(prev => ({
                        ...prev,
                        total_display: { currency, value: (prev.total_balance || 0) * realRate },
                        total_display_loading: false
                      }));
                    } else {
                      setStats(prev => ({ ...prev, total_display_loading: false }));
                    }
                  } catch (err) {
                    setStats(prev => ({ ...prev, total_display_loading: false }));
                  }
                }
              }}
            >
              <option value="USD">USD</option>
              <option value="NGN">NGN</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="ZAR">ZAR</option>
              <option value="GHS">GHS</option>
              <option value="KES">KES</option>
              <option value="CNY">CNY</option>
              <option value="AUD">AUD</option>
              <option value="JPY">JPY</option>
            </select>
          </div>

          <div className="min-w-0 w-full">
            <p className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">Total Balance</p>
            <div className="flex items-center gap-2 min-w-0 w-full">
              <BalanceOneLine className="flex-1">
                {user?.preferences?.show_balances === false ? '****' : (
                  stats.total_display
                    ? formatCurrency(stats.total_display.value, stats.total_display.currency)
                    : formatCurrency(stats.total_balance, 'USD')
                )}
              </BalanceOneLine>
              {stats.total_display_loading && (
                <RefreshCw className="w-4 h-4 text-accent-500 animate-spin shrink-0" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 mt-4">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
            </span>
            <p className="text-xs font-bold text-emerald-600">+4.2% Growth</p>
          </div>
        </div>

        {statsDisplay.slice(1).map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="card border-none bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                  <p className={`text-sm mt-1 ${stat.changeType === 'positive' ? 'text-accent-600' : 'text-gray-600'
                    }`}>
                    {stat.change}
                  </p>
                </div>
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                  <Icon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.name}
                to={action.href}
                className="flex flex-col items-center p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-accent-500 dark:hover:border-accent-500 transition-colors"
              >
                <div className={`${action.color} p-3 rounded-full mb-2`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {action.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Transactions
          </h3>
          <Link
            to="/dashboard/transactions"
            className="text-sm text-accent-600 hover:text-accent-500 dark:text-accent-400 font-medium"
          >
            View all
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No transactions yet</p>
            <p className="text-sm mt-1">Start by funding your wallet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 5).map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <ArrowUpRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {transaction.description || transaction.transaction_type}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(transaction.created_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(transaction.from_amount, transaction.from_currency)}
                  </p>
                  <p className={`text-sm ${transaction.status === 'completed' ? 'text-accent-600' : 'text-yellow-600'
                    }`}>
                    {transaction.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

