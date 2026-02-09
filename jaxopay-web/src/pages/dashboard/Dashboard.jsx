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
        setWallets(result.data.wallets || []);
        setTransactions(result.data.transactions || []);
        setStats(result.data.stats || {});
      } else {
        setError(result.error || 'Failed to load dashboard data');
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const quickActions = [
    { name: 'Send Money', icon: ArrowUpRight, href: '/dashboard/wallets', color: 'bg-blue-500', enabled: true },
    { name: 'Receive', icon: ArrowDownLeft, href: '/dashboard/wallets', color: 'bg-primary-500', enabled: true },
    { name: 'Exchange', icon: ArrowLeftRight, href: '/dashboard/exchange', color: 'bg-purple-500', enabled: isFeatureEnabled('crypto') },
    { name: 'Pay Bills', icon: Receipt, href: '/dashboard/bills', color: 'bg-orange-500', enabled: isFeatureEnabled('bill_payments') },
  ].filter(action => action.enabled);

  const statsDisplay = [
    {
      name: 'Total Balance',
      value: user?.preferences?.show_balances === false ? '****' : formatCurrency(stats.total_balance || 0, 'USD'),
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
      <div className="card bg-gradient-to-r from-primary-600 to-indigo-700 text-white border-none shadow-lg transform hover:scale-[1.01] transition-transform">
        <h2 className="text-3xl font-bold mb-2">Welcome back, {user?.first_name || 'Champion'}!</h2>
        <p className="text-primary-100/90 text-lg">
          Your financial hub is up and running. Ready for some global transactions?
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsDisplay.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                  <p className={`text-sm mt-1 ${stat.changeType === 'positive' ? 'text-primary-600' : 'text-gray-600'
                    }`}>
                    {stat.change}
                  </p>
                </div>
                <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg">
                  <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
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
                className="flex flex-col items-center p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
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
            className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 font-medium"
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
                  <p className={`text-sm ${transaction.status === 'completed' ? 'text-primary-600' : 'text-yellow-600'
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

