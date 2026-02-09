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
    ShieldAlert,
    Megaphone
} from 'lucide-react';
import adminService from '../../services/adminService';
import { useAuthStore } from '../../store/authStore';
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
                        <div className={`flex items-center gap-1 mt-2 text-sm ${trend === 'up' ? 'text-primary-600' : 'text-red-600'
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
    const { user } = useAuthStore();
    const [stats, setStats] = useState({
        total_users: 0,
        total_wallets: 0,
        total_cards: 0,
        total_volume: 0,
        total_transactions: 0,
        pending_kyc: 0,
        suspended_users: 0
    });
    const [loading, setLoading] = useState(true);
    const [recentActivity, setRecentActivity] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log('Fetching admin stats...');
            const result = await adminService.getStats();
            console.log('Admin stats result:', result);
            if (result.success) {
                setStats(result.data);
            } else {
                setError(result.error || 'Failed to fetch dashboard statistics');
            }
        } catch (err) {
            setError('An unexpected error occurred while fetching statistics');
            console.error('Fetch Stats Error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !stats) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {user?.role === 'super_admin' ? 'Super Admin Dashboard Overview' : 'Dashboard Overview'}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        {user?.role === 'super_admin' ? 'Monitor and manage the entire platform' : 'Monitor platform performance'}
                    </p>
                </div>
                <button
                    onClick={fetchStats}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Users"
                    value={formatNumber(stats.total_users)}
                    icon={Users}
                    color="bg-blue-500"
                    linkTo="/admin/users"
                />
                <StatCard
                    title="Total Wallets"
                    value={formatNumber(stats.total_wallets)}
                    icon={Wallet}
                    color="bg-primary-500 transition-all duration-300"
                    linkTo="/admin/wallets"
                />
                <StatCard
                    title="Active Cards"
                    value={formatNumber(stats.total_cards)}
                    icon={CreditCard}
                    color="bg-purple-500"
                    linkTo="/admin/cards"
                />
                <StatCard
                    title="Total Volume"
                    value={formatCurrency(stats.total_volume, 'USD')}
                    icon={DollarSign}
                    color="bg-orange-500"
                />
            </div>

            {/* Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard
                    title="Transactions"
                    value={formatNumber(stats.total_transactions)}
                    icon={Activity}
                    color="bg-cyan-500"
                    linkTo="/admin/transactions"
                />
                <StatCard
                    title="Pending KYC"
                    value={stats.pending_kyc}
                    icon={Shield}
                    color="bg-yellow-500"
                    linkTo="/admin/kyc"
                />
                <StatCard
                    title="Suspended Users"
                    value={stats.suspended_users}
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
                                <p className="text-xs text-gray-500">{stats.pending_kyc} pending</p>
                            </div>
                        </Link>
                        <Link
                            to="/admin/transactions"
                            className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                                <Activity className="w-5 h-5 text-primary-600" />
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">Transactions</p>
                                <p className="text-xs text-gray-500">Monitor activity</p>
                            </div>
                        </Link>

                        {/* Restricted Actions */}
                        {user?.role !== 'compliance_officer' && (
                            <>
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
                                <Link
                                    to="/admin/system"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                        <ShieldAlert className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">System Control</p>
                                        <p className="text-xs text-gray-500">FX, Fees & Emergency</p>
                                    </div>
                                </Link>
                            </>
                        )}

                        {/* Compliance specific actions */}
                        {user?.role === 'compliance_officer' && (
                            <>
                                <Link
                                    to="/admin/aml"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                                        <ShieldAlert className="w-5 h-5 text-orange-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">AML Dashboard</p>
                                        <p className="text-xs text-gray-500">Risk & Compliance</p>
                                    </div>
                                </Link>
                                <Link
                                    to="/admin/announcements"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                        <Megaphone className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Announcements</p>
                                        <p className="text-xs text-gray-500">Platform updates</p>
                                    </div>
                                </Link>
                            </>
                        )}

                        {/* Announcements for Admin/Superadmin */}
                        {(user?.role === 'admin' || user?.role === 'super_admin') && (
                            <Link
                                to="/admin/announcements"
                                className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                    <Megaphone className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Announcements</p>
                                    <p className="text-xs text-gray-500">Post system updates</p>
                                </div>
                            </Link>
                        )}
                    </div>
                </div>

                {/* High Risk Users Alerts */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AML High Risk Alerts</h3>
                        <Link to="/admin/aml" className="text-sm text-primary-600 hover:text-primary-700 font-medium">View All</Link>
                    </div>
                    <div className="space-y-3">
                        <HighRiskWidget />
                    </div>
                </div>

                {/* System Alerts */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Alerts</h3>
                    <div className="space-y-3">
                        {stats.pending_kyc > 0 && (
                            <div className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <Shield className="w-5 h-5 text-yellow-600" />
                                    <div>
                                        <p className="font-medium text-yellow-800 dark:text-yellow-200">KYC Pending</p>
                                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                                            {stats.pending_kyc} documents awaiting review
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

                        {stats.suspended_users > 0 && (
                            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                    <div>
                                        <p className="font-medium text-red-800 dark:text-red-200">Suspended Accounts</p>
                                        <p className="text-sm text-red-600 dark:text-red-400">
                                            {stats.suspended_users} users currently suspended
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

                        {stats.pending_kyc === 0 && stats.suspended_users === 0 && (
                            <div className="flex items-center gap-3 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                                <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-full">
                                    <TrendingUp className="w-5 h-5 text-primary-600" />
                                </div>
                                <div>
                                    <p className="font-medium text-primary-800 dark:text-primary-200">All Clear!</p>
                                    <p className="text-sm text-primary-600 dark:text-primary-400">
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

// High Risk Users Widget
const HighRiskWidget = () => {
    const [highRiskUsers, setHighRiskUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHighRisk = async () => {
            const result = await adminService.getHighRiskUsers();
            if (result.success) {
                setHighRiskUsers(result.data.slice(0, 3)); // Show top 3
            }
            setLoading(false);
        };
        fetchHighRisk();
    }, []);

    if (loading) return <div className="h-20 animate-pulse bg-gray-50 dark:bg-gray-700/50 rounded-xl"></div>;

    if (highRiskUsers.length === 0) {
        return (
            <div className="flex items-center gap-3 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                <Shield className="w-5 h-5 text-primary-600" />
                <p className="text-sm text-primary-700 dark:text-primary-300 font-medium">No high risk users detected</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {highRiskUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 font-bold text-xs">
                            {user.email[0].toUpperCase()}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[120px]">
                                {user.email.split('@')[0]}
                            </p>
                            <p className="text-[10px] text-red-600 font-bold uppercase">Score: {user.risk_score}</p>
                        </div>
                    </div>
                    <Link
                        to={`/admin/users/${user.user_id}`}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600 transition-colors"
                    >
                        <ArrowUpRight className="w-4 h-4" />
                    </Link>
                </div>
            ))}
        </div>
    );
};

export default AdminDashboard;
