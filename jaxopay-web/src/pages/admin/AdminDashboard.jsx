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
    Megaphone,
    Archive,
    UserPlus,
    LineChart as LineChartIcon,
    Landmark,
    Coins,
    Percent,
    LifeBuoy,
    Mail,
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend,
} from 'recharts';
import adminService from '../../services/adminService';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatNumber } from '../../utils/formatters';

// Compact stat used inside the Growth Analytics card — smaller/denser than the top-level
// StatCard since three of these sit side by side per metric (24h / 7d / 30d).
const GrowthStat = ({ label, value, sub }) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
);

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
                        <div className={`flex items-center gap-1 mt-2 text-sm ${trend === 'up' ? 'text-accent-600' : 'text-red-600'
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

// Role-based access mirrors the backend restrictTo lists (see admin.routes.js) so
// Quick Actions / stat-card links never point a role at a page it will get bounced from.
const canAccessKyc = (role) => ['admin', 'super_admin', 'compliance_officer'].includes(role);
const canAccessTransactions = (role) => ['admin', 'super_admin', 'compliance_officer', 'finance'].includes(role);
const canAccessWallets = (role) => ['admin', 'super_admin', 'finance'].includes(role);
const canAccessCards = (role) => ['admin', 'super_admin'].includes(role);
const canAccessAml = (role) => ['admin', 'super_admin', 'compliance_officer'].includes(role);

const AdminDashboard = () => {
    const { user } = useAuthStore();
    const role = user?.role;
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

    const [growth, setGrowth] = useState(null);
    const [growthLoading, setGrowthLoading] = useState(true);

    useEffect(() => {
        fetchStats();
        fetchGrowth();
    }, []);

    const fetchGrowth = async () => {
        setGrowthLoading(true);
        try {
            const result = await adminService.getGrowthAnalytics();
            if (result.success) setGrowth(result.data);
        } finally {
            setGrowthLoading(false);
        }
    };

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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {role === 'super_admin' ? 'Super Admin Dashboard Overview'
                            : role === 'compliance_officer' ? 'Compliance Dashboard Overview'
                                : role === 'finance' ? 'Finance Dashboard Overview'
                                    : role === 'support' ? 'Support Dashboard Overview'
                                        : 'Dashboard Overview'}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        {role === 'super_admin' ? 'Monitor and manage the entire platform'
                            : role === 'compliance_officer' ? 'Monitor compliance, KYC, and risk activity across the platform'
                                : role === 'finance' ? 'Monitor treasury, wallets, rates, fees and transaction volume'
                                    : role === 'support' ? 'Manage support tickets, contact messages and announcements'
                                        : 'Monitor platform performance'}
                    </p>
                </div>
                <button
                    onClick={() => { fetchStats(); fetchGrowth(); }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-gray-900 font-medium rounded-lg"
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
                    color="bg-accent-500 transition-all duration-300"
                    linkTo={canAccessWallets(role) ? '/admin/wallets' : undefined}
                />
                <StatCard
                    title="Active Cards"
                    value={formatNumber(stats.total_cards)}
                    icon={CreditCard}
                    color="bg-purple-500"
                    linkTo={canAccessCards(role) ? '/admin/cards' : undefined}
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
                    linkTo={canAccessTransactions(role) ? '/admin/transactions' : undefined}
                />
                <StatCard
                    title="Pending KYC"
                    value={stats.pending_kyc}
                    icon={Shield}
                    color="bg-yellow-500"
                    linkTo={canAccessKyc(role) ? '/admin/kyc' : undefined}
                />
                <StatCard
                    title="Suspended Users"
                    value={stats.suspended_users}
                    icon={AlertTriangle}
                    color="bg-red-500"
                    linkTo="/admin/users?status=suspended"
                />
            </div>

            {/* Growth Analytics — new signups & transaction activity over rolling windows,
                distinct from the all-time totals above, for tracking platform growth. */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <LineChartIcon className="w-5 h-5 text-accent-600" />
                        Growth Analytics
                    </h3>
                </div>

                {growthLoading && !growth ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
                    </div>
                ) : growth ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            {/* New Users */}
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                                    <UserPlus className="w-4 h-4 text-blue-500" /> New Users
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                    <GrowthStat label="24h" value={formatNumber(growth.new_users.last_24h)} />
                                    <GrowthStat label="7d" value={formatNumber(growth.new_users.last_7d)} />
                                    <GrowthStat label="30d" value={formatNumber(growth.new_users.last_30d)} />
                                </div>
                            </div>
                            {/* Transactions */}
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                                    <Activity className="w-4 h-4 text-cyan-500" /> Transactions
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                    <GrowthStat
                                        label="24h"
                                        value={formatNumber(growth.transactions.last_24h.count)}
                                        sub={formatCurrency(growth.transactions.last_24h.volume_usd, 'USD')}
                                    />
                                    <GrowthStat
                                        label="7d"
                                        value={formatNumber(growth.transactions.last_7d.count)}
                                        sub={formatCurrency(growth.transactions.last_7d.volume_usd, 'USD')}
                                    />
                                    <GrowthStat
                                        label="30d"
                                        value={formatNumber(growth.transactions.last_30d.count)}
                                        sub={formatCurrency(growth.transactions.last_30d.volume_usd, 'USD')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 30-day daily trend */}
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={growth.daily_trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        tick={{ fontSize: 11 }}
                                        interval={Math.max(0, Math.floor(growth.daily_trend.length / 8) - 1)}
                                    />
                                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip
                                        labelFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar yAxisId="right" dataKey="transactions" name="Transactions" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={10} />
                                    <Line yAxisId="left" type="monotone" dataKey="new_users" name="New Users" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Unable to load growth analytics.</p>
                )}
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
                        {canAccessKyc(role) && (
                            <>
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
                                    to="/admin/kyc?tab=approved"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-accent-100 dark:bg-accent-900/30 rounded-lg">
                                        <Archive className="w-5 h-5 text-accent-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Approved KYC archive</p>
                                        <p className="text-xs text-gray-500">Past submissions and documents</p>
                                    </div>
                                </Link>
                            </>
                        )}
                        {canAccessTransactions(role) && (
                            <Link
                                to="/admin/transactions"
                                className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="p-2 bg-accent-100 dark:bg-accent-900/30 rounded-lg">
                                    <Activity className="w-5 h-5 text-accent-600" />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Transactions</p>
                                    <p className="text-xs text-gray-500">Monitor activity</p>
                                </div>
                            </Link>
                        )}

                        {/* Restricted Actions - Admin & Super Admin only */}
                        {(role === 'admin' || role === 'super_admin') && (
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

                        {/* Finance specific actions */}
                        {role === 'finance' && (
                            <>
                                <Link
                                    to="/admin/treasury"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                                        <Landmark className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Treasury</p>
                                        <p className="text-xs text-gray-500">Financial products & reconciliation</p>
                                    </div>
                                </Link>
                                <Link
                                    to="/admin/ramps"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                                        <Coins className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Crypto Ramps</p>
                                        <p className="text-xs text-gray-500">Settlement queue</p>
                                    </div>
                                </Link>
                                <Link
                                    to="/admin/system?tab=rates_fees"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                        <Percent className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Rates & Fees</p>
                                        <p className="text-xs text-gray-500">FX rates & fee configs</p>
                                    </div>
                                </Link>
                            </>
                        )}

                        {/* Support specific actions */}
                        {role === 'support' && (
                            <>
                                <Link
                                    to="/admin/support"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                                        <LifeBuoy className="w-5 h-5 text-sky-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Support Tickets</p>
                                        <p className="text-xs text-gray-500">Respond to users</p>
                                    </div>
                                </Link>
                                <Link
                                    to="/admin/public-forms"
                                    className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                                        <Mail className="w-5 h-5 text-sky-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Contact Messages</p>
                                        <p className="text-xs text-gray-500">Public form submissions</p>
                                    </div>
                                </Link>
                            </>
                        )}

                        {/* Compliance specific actions */}
                        {role === 'compliance_officer' && (
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

                        {/* Announcements for Admin/Superadmin/Support */}
                        {(role === 'admin' || role === 'super_admin' || role === 'support') && (
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
                {canAccessAml(role) && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AML High Risk Alerts</h3>
                            <Link to="/admin/aml" className="text-sm text-accent-600 hover:text-accent-700 font-medium">View All</Link>
                        </div>
                        <div className="space-y-3">
                            <HighRiskWidget />
                        </div>
                    </div>
                )}

                {/* System Alerts */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Alerts</h3>
                    <div className="space-y-3">
                        {stats.pending_kyc > 0 && canAccessKyc(role) && (
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
                            <div className="flex items-center gap-3 p-4 bg-accent-50 dark:bg-accent-900/20 rounded-xl">
                                <div className="p-2 bg-accent-100 dark:bg-accent-900/30 rounded-full">
                                    <TrendingUp className="w-5 h-5 text-accent-600" />
                                </div>
                                <div>
                                    <p className="font-medium text-accent-800 dark:text-accent-200">All Clear!</p>
                                    <p className="text-sm text-accent-600 dark:text-accent-400">
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
            <div className="flex items-center gap-3 p-4 bg-accent-50 dark:bg-accent-900/20 rounded-xl">
                <Shield className="w-5 h-5 text-accent-600" />
                <p className="text-sm text-accent-700 dark:text-accent-300 font-medium">No high risk users detected</p>
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
