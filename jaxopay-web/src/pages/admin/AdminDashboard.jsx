import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    Users,
    Wallet,
    CreditCard,
    Activity,
    TrendingUp,
    TrendingDown,
    Shield,
    AlertTriangle,
    DollarSign,
    ArrowUpRight,
    ArrowDownRight,
    RefreshCw,
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color, linkTo }) => {
    const Content = (
        <motion.div
            whileHover={{ y: -2 }}
            className={`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 ${linkTo ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
                }`}
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
                    {trend && (
                        <div className={`flex items-center gap-1 mt-2 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'
                            }`}>
                            {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            <span>{trendValue}</span>
                        </div>
                    )}
                </div>
                <div className={`p-3 rounded-xl ${color}`}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
            </div>
        </motion.div>
    );

    return linkTo ? <Link to={linkTo}>{Content}</Link> : Content;
};

const AdminDashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recentActivity, setRecentActivity] = useState([]);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        const result = await adminService.getStats();
        if (result.success) {
            setStats(result.data);
        }
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
            </div>
        );
    }

    // Mock data if API doesn't return stats
    const displayStats = stats || {
        total_users: 1250,
        active_users: 890,
        total_wallets: 3200,
        total_cards: 456,
        pending_kyc: 23,
        total_transactions: 15600,
        total_volume: 2450000,
        suspended_users: 12,
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
                    <p className="text-gray-600 dark:text-gray-400">Monitor your platform's performance</p>
                </div>
                <button
                    onClick={fetchStats}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Users"
                    value={formatNumber(displayStats.total_users)}
                    icon={Users}
                    color="bg-blue-500"
                    trend="up"
                    trendValue="+12% this month"
                    linkTo="/admin/users"
                />
                <StatCard
                    title="Total Wallets"
                    value={formatNumber(displayStats.total_wallets)}
                    icon={Wallet}
                    color="bg-green-500"
                    trend="up"
                    trendValue="+8% this week"
                    linkTo="/admin/wallets"
                />
                <StatCard
                    title="Active Cards"
                    value={formatNumber(displayStats.total_cards)}
                    icon={CreditCard}
                    color="bg-purple-500"
                    trend="up"
                    trendValue="+15 today"
                    linkTo="/admin/cards"
                />
                <StatCard
                    title="Total Volume"
                    value={formatCurrency(displayStats.total_volume, 'USD')}
                    icon={DollarSign}
                    color="bg-orange-500"
                    trend="up"
                    trendValue="+23% this month"
                />
            </div>

            {/* Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard
                    title="Transactions"
                    value={formatNumber(displayStats.total_transactions)}
                    icon={Activity}
                    color="bg-cyan-500"
                    linkTo="/admin/transactions"
                />
                <StatCard
                    title="Pending KYC"
                    value={displayStats.pending_kyc}
                    icon={Shield}
                    color="bg-yellow-500"
                    linkTo="/admin/kyc"
                />
                <StatCard
                    title="Suspended Users"
                    value={displayStats.suspended_users}
                    icon={AlertTriangle}
                    color="bg-red-500"
                    linkTo="/admin/users?status=suspended"
                />
            </div>

            {/* Quick Actions & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Link
                            to="/admin/users"
                            className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                <Users className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">Manage Users</p>
                                <p className="text-xs text-gray-500">View and edit users</p>
                            </div>
                        </Link>
                        <Link
                            to="/admin/kyc"
                            className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                                <Shield className="w-5 h-5 text-yellow-600" />
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">Review KYC</p>
                                <p className="text-xs text-gray-500">{displayStats.pending_kyc} pending</p>
                            </div>
                        </Link>
                        <Link
                            to="/admin/transactions"
                            className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                <Activity className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">Transactions</p>
                                <p className="text-xs text-gray-500">Monitor activity</p>
                            </div>
                        </Link>
                        <Link
                            to="/admin/cards"
                            className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                <CreditCard className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">Card Management</p>
                                <p className="text-xs text-gray-500">View all cards</p>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Alerts */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Alerts</h3>
                    <div className="space-y-3">
                        {displayStats.pending_kyc > 0 && (
                            <div className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <Shield className="w-5 h-5 text-yellow-600" />
                                    <div>
                                        <p className="font-medium text-yellow-800 dark:text-yellow-200">KYC Pending</p>
                                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                                            {displayStats.pending_kyc} documents awaiting review
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to="/admin/kyc"
                                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg"
                                >
                                    Review
                                </Link>
                            </div>
                        )}

                        {displayStats.suspended_users > 0 && (
                            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                    <div>
                                        <p className="font-medium text-red-800 dark:text-red-200">Suspended Accounts</p>
                                        <p className="text-sm text-red-600 dark:text-red-400">
                                            {displayStats.suspended_users} users currently suspended
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to="/admin/users?status=suspended"
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg"
                                >
                                    View
                                </Link>
                            </div>
                        )}

                        {displayStats.pending_kyc === 0 && displayStats.suspended_users === 0 && (
                            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                                    <TrendingUp className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="font-medium text-green-800 dark:text-green-200">All Clear!</p>
                                    <p className="text-sm text-green-600 dark:text-green-400">
                                        No pending actions required
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
