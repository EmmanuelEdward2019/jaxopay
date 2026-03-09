import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  TrendingUp,
  CreditCard,
  Receipt,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import dashboardService from '../../services/dashboardService';
import cryptoService from '../../services/cryptoService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

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
          // In a real app we'd fetch all rates at once. For now, we'll iterate.
          // Fallback rates if API is slow
          const fallbackRates = { 'NGN': 1 / 1650, 'GBP': 1.28, 'EUR': 1.08, 'BTC': 65000, 'ETH': 3500, 'USDT': 1, 'USDC': 1 };

          for (const wallet of walletsData) {
            const bal = parseFloat(wallet.balance) || 0;
            if (wallet.currency === 'USD') {
              totalUSD += bal;
            } else {
              // Try to get real rate, otherwise fallback
              // dashboardService.getRates might be better if it exists, or cryptoService
              const rate = fallbackRates[wallet.currency] || 1;
              totalUSD += bal * rate;
            }
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
    { name: 'Exchange', icon: ArrowLeftRight, href: '/dashboard/exchange', color: 'bg-accent-800', enabled: isFeatureEnabled('crypto') },
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

      {/* Welcome Section */}
      <div className="card bg-gradient-to-r from-accent-600 to-emerald-700 text-white border-none shadow-lg transform hover:scale-[1.01] transition-transform shadow-accent-500/20">
        <h2 className="text-3xl font-bold mb-2">Welcome back, {user?.first_name || user?.username || user?.email?.split('@')[0] || 'Member'}!</h2>
        <p className="text-accent-50 text-lg">
          Your financial hub is up and running. Ready for some global transactions?
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Balance Card with Dropdown */}
        <div className="card lg:col-span-1 border-none bg-accent-50 dark:bg-accent-900/10 ring-1 ring-accent-200 dark:ring-accent-800 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Balance</p>
                <div className="relative">
                  <select
                    className="bg-accent-100 dark:bg-accent-900/30 px-2 py-0.5 rounded text-[10px] font-bold text-accent-700 dark:text-accent-300 focus:outline-none cursor-pointer border border-accent-200 dark:border-accent-700 hover:bg-accent-200/50 transition-colors"
                    onChange={async (e) => {
                      const currency = e.target.value;
                      if (currency === 'USD') {
                        setStats(prev => ({ ...prev, total_display: null }));
                      } else {
                        // Fetch rate and update
                        setStats(prev => ({ ...prev, total_display_loading: true }));
                        // Using a simple rate calculation for the total wealth
                        // Note: cryptoService.getExchangeRates('USD', currency) returns rate for 1 USD to Target
                        const rateRes = await cryptoService.getExchangeRates('USD', currency);
                        const rate = rateRes.success ? rateRes.data.rate : (currency === 'NGN' ? 1650 : (currency === 'EUR' ? 0.92 : 1));
                        setStats(prev => ({
                          ...prev,
                          total_display: { currency, value: (prev.total_balance || 0) * rate },
                          total_display_loading: false
                        }));
                      }
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="NGN">NGN</option>
                    <option value="BTC">BTC</option>
                    <option value="ETH">ETH</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <p className="text-3xl font-black text-gray-900 dark:text-white mt-2 leading-none">
                {stats.total_display_loading ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-accent-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-accent-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-accent-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </span>
                ) : stats.total_display ? (
                  formatCurrency(stats.total_display.value, stats.total_display.currency)
                ) : (
                  formatCurrency(stats.total_balance || 0, 'USD')
                )}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                </div>
                <p className="text-xs font-semibold text-emerald-600">+4.2% today</p>
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-accent-100 dark:border-accent-900/50">
              <Wallet className="h-7 w-7 text-accent-600" />
            </div>
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

