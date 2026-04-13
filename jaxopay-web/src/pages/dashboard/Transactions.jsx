import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowUpRight,
    ArrowDownLeft,
    ArrowLeftRight,
    Search,
    Filter,
    Calendar,
    Download,
    ChevronDown,
    X,
    RefreshCw,
    CreditCard,
    Wallet,
    Receipt,
    Bitcoin,
} from 'lucide-react';
import transactionService from '../../services/transactionService';
import { formatCurrency, formatDateTime, formatTransactionType, getStatusColor } from '../../utils/formatters';

const TRANSACTION_TYPES = [
    { value: 'all', label: 'All Types' },
    { value: 'transfer', label: 'Transfers' },
    { value: 'card_funding', label: 'Card Funding' },
    { value: 'card_payment', label: 'Card Payments' },
    { value: 'crypto_buy', label: 'Crypto Buy' },
    { value: 'crypto_sell', label: 'Crypto Sell' },
    { value: 'bill_payment', label: 'Bill Payments' },
    { value: 'flight_booking', label: 'Flight Bookings' },
    { value: 'gift_card', label: 'Gift Cards' },
];

const STATUS_OPTIONS = [
    { value: 'all', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
];

const Transactions = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [showFilters, setShowFilters] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

    // Fetch transactions on mount and filter changes
    useEffect(() => {
        fetchTransactions();
    }, [typeFilter, statusFilter, dateRange, pagination.page]);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchTransactions = async () => {
        setLoading(true);
        const params = {
            page: pagination.page,
            limit: pagination.limit,
        };
        if (typeFilter !== 'all') params.type = typeFilter;
        if (statusFilter !== 'all') params.status = statusFilter;
        if (dateRange.start) params.start_date = dateRange.start;
        if (dateRange.end) params.end_date = dateRange.end;

        const result = await transactionService.getTransactions(params);
        if (result.success) {
            setTransactions(result.data.transactions || []);
            setPagination(prev => ({ ...prev, total: result.data.total || 0 }));
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        const result = await transactionService.getStatistics();
        if (result.success) {
            setStats(result.data);
        }
    };

    const getTransactionIcon = (type) => {
        const icons = {
            transfer: ArrowLeftRight,
            card_funding: CreditCard,
            card_payment: CreditCard,
            crypto_buy: Bitcoin,
            crypto_sell: Bitcoin,
            bill_payment: Receipt,
            wallet: Wallet,
        };
        return icons[type] || ArrowUpRight;
    };

    const getTransactionColor = (type, direction) => {
        if (direction === 'credit' || type === 'crypto_sell') {
            return 'bg-primary/10 text-primary';
        }
        return 'bg-danger/10 text-danger';
    };

    const filteredTransactions = transactions.filter(tx => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            tx.description?.toLowerCase().includes(query) ||
            tx.reference?.toLowerCase().includes(query) ||
            tx.transaction_type?.toLowerCase().includes(query)
        );
    });

    const clearFilters = () => {
        setTypeFilter('all');
        setStatusFilter('all');
        setDateRange({ start: '', end: '' });
        setSearchQuery('');
    };

    const exportTransactions = () => {
        // Convert to CSV
        const headers = ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Status', 'Reference'];
        const rows = filteredTransactions.map(tx => [
            formatDateTime(tx.created_at),
            formatTransactionType(tx.transaction_type),
            tx.description || '',
            tx.amount,
            tx.currency,
            tx.status,
            tx.reference || '',
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
                    <p className="text-muted-foreground">View and manage all your transactions</p>
                </div>
                <button
                    onClick={exportTransactions}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted text-foreground font-medium rounded-lg transition-colors"
                >
                    <Download className="w-5 h-5" />
                    Export CSV
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-danger/10 border border-danger/20 rounded-lg p-4">
                    <p className="text-danger">{error}</p>
                    <button onClick={() => setError(null)} className="text-danger underline text-sm mt-1">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Stats Summary */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="card">
                        <p className="text-sm text-muted-foreground mb-1">Total Volume</p>
                        <p className="text-2xl font-bold text-foreground">
                            {formatCurrency(stats.total_volume || 0, 'USD')}
                        </p>
                    </div>
                    <div className="card">
                        <p className="text-sm text-muted-foreground mb-1">Transactions</p>
                        <p className="text-2xl font-bold text-foreground">{stats.total_count || 0}</p>
                    </div>
                    <div className="card">
                        <p className="text-sm text-muted-foreground mb-1">Completed</p>
                        <p className="text-2xl font-bold text-primary">{stats.completed_count || 0}</p>
                    </div>
                    <div className="card">
                        <p className="text-sm text-muted-foreground mb-1">Pending</p>
                        <p className="text-2xl font-bold text-warning">{stats.pending_count || 0}</p>
                    </div>
                </div>
            )}

            {/* Search and Quick Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${showFilters || typeFilter !== 'all' || statusFilter !== 'all'
                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                            : 'bg-muted text-foreground'
                            }`}
                    >
                        <Filter className="w-5 h-5" />
                        Filters
                        {(typeFilter !== 'all' || statusFilter !== 'all') && (
                            <span className="bg-card/20 text-xs px-1.5 py-0.5 rounded-full">
                                {[typeFilter !== 'all', statusFilter !== 'all'].filter(Boolean).length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={fetchTransactions}
                        className="p-2.5 bg-muted rounded-lg hover:bg-muted transition-colors"
                    >
                        <RefreshCw className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>
            </div>

            {/* Extended Filters */}
            {showFilters && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="card"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Type Filter */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Transaction Type
                            </label>
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg"
                            >
                                {TRANSACTION_TYPES.map(type => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Status
                            </label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg"
                            >
                                {STATUS_OPTIONS.map(status => (
                                    <option key={status.value} value={status.value}>{status.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date Range */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                From Date
                            </label>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                To Date
                            </label>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end mt-4">
                        <button
                            onClick={clearFilters}
                            className="text-sm text-primary hover:text-primary font-medium"
                        >
                            Clear all filters
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Transactions List */}
            <div className="card">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : filteredTransactions.length === 0 ? (
                    <div className="text-center py-12">
                        <ArrowLeftRight className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">No transactions found</h3>
                        <p className="text-muted-foreground">
                            {transactions.length === 0
                                ? "You haven't made any transactions yet."
                                : 'No transactions match your filters.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredTransactions.map((tx) => {
                            const Icon = getTransactionIcon(tx.transaction_type);
                            return (
                                <motion.div
                                    key={tx.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => setSelectedTransaction(tx)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${getTransactionColor(tx.transaction_type, tx.direction)}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground">
                                                {tx.description || formatTransactionType(tx.transaction_type)}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {formatDateTime(tx.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-semibold ${tx.direction === 'credit' ? 'text-primary' : 'text-foreground'
                                            }`}>
                                            {tx.direction === 'credit' ? '+' : '-'}
                                            {formatCurrency(tx.amount, tx.currency)}
                                        </p>
                                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(tx.status)}`}>
                                            {tx.status}
                                        </span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {pagination.total > pagination.limit && (
                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                disabled={pagination.page === 1}
                                className="px-3 py-1.5 bg-muted rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                disabled={pagination.page * pagination.limit >= pagination.total}
                                className="px-3 py-1.5 bg-muted rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Transaction Detail Modal */}
            {selectedTransaction && (
                <TransactionDetailModal
                    transaction={selectedTransaction}
                    onClose={() => setSelectedTransaction(null)}
                />
            )}
        </div>
    );
};

// Transaction Detail Modal
const TransactionDetailModal = ({ transaction, onClose }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">Transaction Details</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="text-center pb-4 border-b border-border">
                        <p className={`text-3xl font-bold ${transaction.direction === 'credit' ? 'text-primary' : 'text-foreground'
                            }`}>
                            {transaction.direction === 'credit' ? '+' : '-'}
                            {formatCurrency(transaction.amount, transaction.currency)}
                        </p>
                        <span className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(transaction.status)}`}>
                            {transaction.status}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Type</p>
                            <p className="font-medium text-foreground">
                                {formatTransactionType(transaction.transaction_type)}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Date</p>
                            <p className="font-medium text-foreground">
                                {formatDateTime(transaction.created_at)}
                            </p>
                        </div>
                        {transaction.reference && (
                            <div className="col-span-2">
                                <p className="text-sm text-muted-foreground">Reference</p>
                                <p className="font-mono text-sm text-foreground break-all">
                                    {transaction.reference}
                                </p>
                            </div>
                        )}
                        {transaction.description && (
                            <div className="col-span-2">
                                <p className="text-sm text-muted-foreground">Description</p>
                                <p className="text-foreground">{transaction.description}</p>
                            </div>
                        )}
                        {transaction.fee && (
                            <div>
                                <p className="text-sm text-muted-foreground">Fee</p>
                                <p className="font-medium text-foreground">
                                    {formatCurrency(transaction.fee, transaction.currency)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-6 py-3 px-4 bg-muted text-foreground font-semibold rounded-lg hover:bg-muted transition-colors"
                >
                    Close
                </button>
            </motion.div>
        </motion.div>
    );
};

export default Transactions;
