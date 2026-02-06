import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Search,
    Filter,
    ArrowUpRight,
    ArrowDownRight,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Eye,
    X,
    Download,
    Calendar,
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const STATUS_COLORS = {
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    processing: 'bg-blue-100 text-blue-700',
};

const TYPE_ICONS = {
    credit: { icon: ArrowDownRight, color: 'text-green-600', bg: 'bg-green-100' },
    debit: { icon: ArrowUpRight, color: 'text-red-600', bg: 'bg-red-100' },
    transfer: { icon: Activity, color: 'text-blue-600', bg: 'bg-blue-100' },
};

const TransactionMonitor = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ type: '', status: '', currency: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [selectedTx, setSelectedTx] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    useEffect(() => {
        fetchTransactions();
    }, [pagination.page, filters]);

    const fetchTransactions = async () => {
        setLoading(true);
        const result = await adminService.getTransactions({
            page: pagination.page,
            limit: pagination.limit,
            type: filters.type || undefined,
            status: filters.status || undefined,
            currency: filters.currency || undefined,
        });
        if (result.success) {
            setTransactions(result.data.transactions || []);
            setPagination(prev => ({ ...prev, total: result.data.total || 0 }));
        }
        setLoading(false);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination(prev => ({ ...prev, page: 1 }));
        fetchTransactions();
    };

    const handleViewTx = (tx) => {
        setSelectedTx(tx);
        setShowDetailModal(true);
    };

    const handleExport = () => {
        // Generate CSV from transactions
        const headers = ['ID', 'Type', 'Amount', 'Currency', 'Status', 'Date'];
        const rows = transactions.map(tx => [
            tx.id,
            tx.type,
            tx.amount,
            tx.currency,
            tx.status,
            formatDateTime(tx.created_at),
        ]);
        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transaction Monitor</h1>
                    <p className="text-gray-600 dark:text-gray-400">{pagination.total} total transactions</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 text-white font-medium rounded-lg"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button
                        onClick={fetchTransactions}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by transaction ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>
                    <select
                        value={filters.type}
                        onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                        className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                        <option value="">All Types</option>
                        <option value="credit">Credit</option>
                        <option value="debit">Debit</option>
                        <option value="transfer">Transfer</option>
                    </select>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                        <option value="">All Status</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                    </select>
                    <select
                        value={filters.currency}
                        onChange={(e) => setFilters({ ...filters, currency: e.target.value })}
                        className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                        <option value="">All Currencies</option>
                        <option value="USD">USD</option>
                        <option value="NGN">NGN</option>
                        <option value="GBP">GBP</option>
                        <option value="EUR">EUR</option>
                    </select>
                    <button
                        type="submit"
                        className="px-4 py-2.5 bg-gray-900 dark:bg-gray-600 text-white font-medium rounded-lg"
                    >
                        Filter
                    </button>
                </form>
            </div>

            {/* Transactions Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-12">
                        <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No transactions found</h3>
                        <p className="text-gray-500">Try adjusting your filters</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Transaction
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Amount
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="text-right px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {transactions.map((tx) => {
                                    const typeInfo = TYPE_ICONS[tx.type] || TYPE_ICONS.transfer;
                                    const IconComponent = typeInfo.icon;
                                    return (
                                        <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${typeInfo.bg}`}>
                                                        <IconComponent className={`w-4 h-4 ${typeInfo.color}`} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900 dark:text-white capitalize">
                                                            {tx.type}
                                                        </p>
                                                        <p className="text-xs text-gray-500 font-mono">{tx.id?.slice(0, 12)}...</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`font-semibold ${tx.type === 'credit' ? 'text-green-600' :
                                                        tx.type === 'debit' ? 'text-red-600' : 'text-gray-900 dark:text-white'
                                                    }`}>
                                                    {tx.type === 'credit' ? '+' : tx.type === 'debit' ? '-' : ''}
                                                    {formatCurrency(tx.amount, tx.currency)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[tx.status] || STATUS_COLORS.pending
                                                    }`}>
                                                    {tx.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-500">
                                                    {formatDateTime(tx.created_at)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleViewTx(tx)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500">
                            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                disabled={pagination.page === 1}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="px-4 py-2 text-sm">
                                Page {pagination.page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                disabled={pagination.page >= totalPages}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Transaction Detail Modal */}
            <AnimatePresence>
                {showDetailModal && selectedTx && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                        onClick={() => setShowDetailModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Transaction Details</h2>
                                <button
                                    onClick={() => setShowDetailModal(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Transaction ID</span>
                                        <p className="font-mono text-gray-900 dark:text-white">{selectedTx.id}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Type</span>
                                        <p className="text-gray-900 dark:text-white capitalize">{selectedTx.type}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Amount</span>
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            {formatCurrency(selectedTx.amount, selectedTx.currency)}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Status</span>
                                        <p>
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[selectedTx.status]
                                                }`}>
                                                {selectedTx.status}
                                            </span>
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Created</span>
                                        <p className="text-gray-900 dark:text-white">{formatDateTime(selectedTx.created_at)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Updated</span>
                                        <p className="text-gray-900 dark:text-white">{formatDateTime(selectedTx.updated_at)}</p>
                                    </div>
                                    {selectedTx.description && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">Description</span>
                                            <p className="text-gray-900 dark:text-white">{selectedTx.description}</p>
                                        </div>
                                    )}
                                    {selectedTx.reference && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">Reference</span>
                                            <p className="font-mono text-gray-900 dark:text-white">{selectedTx.reference}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TransactionMonitor;
