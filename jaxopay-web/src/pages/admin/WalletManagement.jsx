import { Fragment, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wallet,
    Search,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    User,
    Shield,
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatCurrency } from '../../utils/formatters';

const WalletManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedUserId, setExpandedUserId] = useState(null);
    const [filters, setFilters] = useState({
        search: '',
        currency: '',
        wallet_type: '',
        status: '',
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

    const fetchWallets = async () => {
        setLoading(true);
        const result = await adminService.getAllWallets({
            page: pagination.page,
            limit: pagination.limit,
            ...filters,
        });
        if (result.success) {
            setUsers(result.data.users);
            setPagination((prev) => ({ ...prev, total: result.data.pagination.total }));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchWallets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagination.page, filters]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const toggleWalletStatus = async (walletId, currentStatus, userId) => {
        const result = await adminService.updateWalletStatus(walletId, !currentStatus);
        if (result.success) {
            // Patch in place so the expanded panel doesn't collapse/refetch everything.
            setUsers((prev) =>
                prev.map((u) =>
                    u.user_id !== userId
                        ? u
                        : { ...u, wallets: u.wallets.map((w) => (w.id === walletId ? { ...w, is_active: !currentStatus } : w)) }
                )
            );
        }
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Wallets</h1>
                    <p className="text-gray-600 dark:text-gray-400">Total balance per user — expand a row to see every currency they hold</p>
                </div>
                <button
                    onClick={fetchWallets}
                    className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        name="search"
                        placeholder="Search by name, email or user ID..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                        value={filters.search}
                        onChange={handleFilterChange}
                    />
                </div>
                <select
                    name="currency"
                    className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-sm"
                    value={filters.currency}
                    onChange={handleFilterChange}
                >
                    <option value="">All Currencies</option>
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="BTC">BTC</option>
                    <option value="ETH">ETH</option>
                </select>
                <select
                    name="wallet_type"
                    className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-sm"
                    value={filters.wallet_type}
                    onChange={handleFilterChange}
                >
                    <option value="">All Types</option>
                    <option value="fiat">Fiat</option>
                    <option value="crypto">Crypto</option>
                </select>
                <select
                    name="status"
                    className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-sm"
                    value={filters.status}
                    onChange={handleFilterChange}
                >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Wallets Held</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Total Balance (USD)</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading && users.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">Loading wallets...</td>
                                </tr>
                            )}
                            {!loading && users.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">No users match these filters.</td>
                                </tr>
                            )}
                            {users.map((u) => {
                                const isExpanded = expandedUserId === u.user_id;
                                return (
                                    <Fragment key={u.user_id}>
                                        <tr
                                            key={u.user_id}
                                            onClick={() => setExpandedUserId(isExpanded ? null : u.user_id)}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600">
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                    <div className="text-sm">
                                                        <p className="font-medium text-gray-900 dark:text-white">{u.user_name}</p>
                                                        <p className="text-gray-500 text-xs">{u.user_email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                                {u.wallet_count} {u.wallet_count === 1 ? 'currency' : 'currencies'}
                                            </td>
                                            <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                                                {formatCurrency(u.total_usd_value, 'USD')}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                    {isExpanded ? 'Hide' : 'View'}
                                                </button>
                                            </td>
                                        </tr>
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <tr key={`${u.user_id}-detail`}>
                                                    <td colSpan={4} className="px-0 py-0 bg-gray-50 dark:bg-gray-900/40">
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <table className="w-full">
                                                                <thead>
                                                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                                                        <th className="px-6 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Currency</th>
                                                                        <th className="px-6 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Type</th>
                                                                        <th className="px-6 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Balance</th>
                                                                        <th className="px-6 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Available</th>
                                                                        <th className="px-6 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">≈ USD</th>
                                                                        <th className="px-6 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase">Status</th>
                                                                        <th className="px-6 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase">Actions</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                                    {u.wallets.map((w) => (
                                                                        <tr key={w.id}>
                                                                            <td className="px-6 py-3">
                                                                                <span className="inline-flex items-center px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold">
                                                                                    {w.currency}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300 capitalize">{w.wallet_type}</td>
                                                                            <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                                                                {formatCurrency(w.balance, w.currency)}
                                                                            </td>
                                                                            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">
                                                                                {formatCurrency(w.available_balance, w.currency)}
                                                                            </td>
                                                                            <td className="px-6 py-3 text-sm text-gray-500">
                                                                                {formatCurrency(w.usd_value, 'USD')}
                                                                            </td>
                                                                            <td className="px-6 py-3">
                                                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${w.is_active
                                                                                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                                                                                    : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                                                                    }`}>
                                                                                    <Shield className="w-3 h-3" />
                                                                                    {w.is_active ? 'Active' : 'Locked'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-6 py-3 text-right">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        toggleWalletStatus(w.id, w.is_active, u.user_id);
                                                                                    }}
                                                                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${w.is_active
                                                                                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                                                                                        : 'border-primary-200 text-primary-600 hover:bg-primary-50'
                                                                                        }`}
                                                                                >
                                                                                    {w.is_active ? 'Freeze' : 'Unfreeze'}
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </motion.div>
                                                    </td>
                                                </tr>
                                            )}
                                        </AnimatePresence>
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page === 1}
                            className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page >= totalPages}
                            className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WalletManagement;
