import { useState, useEffect, useRef } from 'react';
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
    Copy,
    Check,
    ExternalLink,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import adminService from '../../services/adminService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
// The customer's own receipt, field for field — the admin copy used to be a raw metadata dump
// that silently omitted everything the combined admin query wasn't selecting (session ID, hash,
// bank, account name…). Same builder, same printable component, so the two can never drift.
import { buildReceiptFields, explorerUrlFor } from '../../utils/receiptFields';
import TransactionReceipt from '../../components/common/TransactionReceipt';

const STATUS_COLORS = {
    completed: 'bg-primary-100 text-primary-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    processing: 'bg-blue-100 text-blue-700',
};

const TYPE_ICONS = {
    credit: { icon: ArrowDownRight, color: 'text-primary-600', bg: 'bg-primary-100' },
    debit: { icon: ArrowUpRight, color: 'text-red-600', bg: 'bg-red-100' },
    transfer: { icon: Activity, color: 'text-blue-600', bg: 'bg-blue-100' },
};

// ─── Admin transaction receipt ────────────────────────────────────────────────
// Everything on the customer's own receipt (buildReceiptFields — including the NIBSS Session ID
// and the on-chain Hash), followed by the operational fields only an admin needs. Downloadable as
// the same PNG the customer gets, so a support ticket can carry the exact document being disputed.
const CopyableValue = ({ value, mono = true }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard?.writeText(String(value));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <span className="inline-flex items-start gap-1.5 max-w-full">
            <span className={`${mono ? 'font-mono' : ''} text-gray-900 dark:text-white break-all`}>{value}</span>
            <button
                onClick={copy}
                title="Copy"
                className="shrink-0 p-0.5 text-gray-400 hover:text-primary-600 transition-colors"
            >
                {copied ? <Check className="w-3.5 h-3.5 text-primary-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
        </span>
    );
};

const TransactionDetailModal = ({ transaction, onClose }) => {
    const receiptRef = useRef(null);
    const [downloading, setDownloading] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    // Identical to the customer's view of the same transaction.
    const fields = buildReceiptFields(transaction, { copyable: true, detailed: true });

    const meta = transaction.metadata || {};
    const txHash = meta.hash;
    const txNetwork = meta.network || meta.cryptoNetwork;
    const blockExplorerUrl = explorerUrlFor(txNetwork, txHash);
    const providerReference = transaction.external_reference || meta.provider_reference || meta.obiex_withdraw_id;

    const downloadReceipt = async () => {
        if (!receiptRef.current) return;
        setDownloading(true);
        try {
            const dataUrl = await toPng(receiptRef.current, { cacheBust: true, quality: 1, pixelRatio: 2 });
            const link = document.createElement('a');
            link.download = `jaxopay-receipt-${transaction.reference || transaction.id?.slice(0, 8)}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Receipt download failed:', err);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            {/* Off-screen printable receipt — the customer's exact document. */}
            <div style={{ position: 'fixed', left: -9999, top: -9999, pointerEvents: 'none', zIndex: -1 }}>
                <TransactionReceipt transaction={transaction} receiptRef={receiptRef} />
            </div>

            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Transaction Receipt</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* Amount headline */}
                    <div className="text-center pb-4 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {formatCurrency(
                                Math.abs(transaction.amount || transaction.from_amount || 0),
                                transaction.currency || transaction.from_currency || 'NGN'
                            )}
                        </p>
                        <span className={`inline-block mt-2 px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[transaction.status] || 'bg-gray-100 text-gray-700'}`}>
                            {transaction.status}
                        </span>
                    </div>

                    {/* The customer's receipt rows, verbatim */}
                    <dl className="divide-y divide-gray-100 dark:divide-gray-700">
                        {fields.map((field, i) => (
                            <div key={i} className="py-2.5 flex items-start justify-between gap-4 text-sm">
                                <dt className="text-gray-500 shrink-0">{field.label}</dt>
                                <dd className="text-right min-w-0">
                                    {field.copyable
                                        ? <CopyableValue value={field.value} />
                                        : <span className="text-gray-900 dark:text-white break-words">{field.value}</span>}
                                </dd>
                            </div>
                        ))}
                    </dl>

                    {blockExplorerUrl && (
                        <a
                            href={blockExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-primary-700 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-300 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Verify on Blockchain
                        </a>
                    )}

                    {/* Admin-only operational fields — deliberately below the receipt so what the
                        admin reads first is exactly what the customer is looking at. */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3 text-sm">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Internal</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <span className="text-gray-500 block text-xs">User</span>
                                <span className="text-gray-900 dark:text-white break-all">{transaction.user_name || transaction.user_email || 'System'}</span>
                                {transaction.user_name && transaction.user_email && (
                                    <span className="block text-xs text-gray-400 break-all">{transaction.user_email}</span>
                                )}
                            </div>
                            <div>
                                <span className="text-gray-500 block text-xs">Record ID</span>
                                <CopyableValue value={transaction.id} />
                            </div>
                            {providerReference && (
                                <div className="sm:col-span-2">
                                    <span className="text-gray-500 block text-xs">Provider Reference</span>
                                    <CopyableValue value={providerReference} />
                                    <span className="block text-[11px] text-gray-400 mt-0.5">
                                        Traces the payout/charge on the provider&apos;s own dashboard. For a NGN bank
                                        payout the customer&apos;s bank wants the Session ID above instead.
                                    </span>
                                </div>
                            )}
                            <div>
                                <span className="text-gray-500 block text-xs">Last Updated</span>
                                <span className="text-gray-900 dark:text-white">{formatDateTime(transaction.updated_at || transaction.created_at)}</span>
                            </div>
                        </div>

                        {meta && Object.keys(meta).length > 0 && (
                            <div>
                                <button
                                    onClick={() => setShowRaw(v => !v)}
                                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                                >
                                    {showRaw ? 'Hide' : 'Show'} raw metadata ({Object.keys(meta).length} keys)
                                </button>
                                {showRaw && (
                                    <div className="mt-2 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg space-y-2 max-h-60 overflow-y-auto">
                                        {Object.entries(meta).map(([key, value]) => (
                                            <div key={key} className="flex flex-col">
                                                <span className="text-xs text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                                                <span className="text-xs text-gray-900 dark:text-white font-mono break-all">
                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={downloadReceipt}
                        disabled={downloading}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        {downloading ? 'Preparing…' : 'Download Receipt'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
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
            setPagination(prev => ({
                ...prev,
                total: result.data.pagination?.total || 0
            }));
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
        const rows = transactions.map(tx => {
            const displayType = tx.transaction_type || tx.type;
            const displayAmount = tx.from_amount || tx.net_amount || tx.amount || 0;
            const displayCurrency = tx.from_currency || tx.currency || 'NGN';
            return [
                tx.id,
                displayType,
                displayAmount,
                displayCurrency,
                tx.status,
                formatDateTime(tx.created_at),
            ];
        });
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
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-gray-900 font-medium rounded-lg"
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
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
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
                                        User
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
                                    const displayType = tx.transaction_type || tx.type || 'transfer';
                                    const typeInfo = TYPE_ICONS[displayType] || TYPE_ICONS.transfer;
                                    const IconComponent = typeInfo.icon;
                                    const displayAmount = tx.from_amount || tx.net_amount || tx.amount || 0;
                                    const displayCurrency = tx.from_currency || tx.currency || 'NGN';
                                    
                                    return (
                                        <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${typeInfo.bg}`}>
                                                        <IconComponent className={`w-4 h-4 ${typeInfo.color}`} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900 dark:text-white capitalize">
                                                            {displayType.replace(/_/g, ' ')}
                                                        </p>
                                                        <p className="text-xs text-gray-500 font-mono">{tx.id?.slice(0, 12)}...</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {tx.user_name || tx.user_email || 'System/Unknown'}
                                                </span>
                                                {tx.user_name && tx.user_email && tx.user_name !== tx.user_email && (
                                                    <span className="block text-xs text-gray-400">{tx.user_email}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`font-semibold ${displayType === 'credit' ? 'text-primary-600' :
                                                    displayType === 'debit' ? 'text-red-600' : 'text-gray-900 dark:text-white'
                                                    }`}>
                                                    {displayType === 'credit' ? '+' : displayType === 'debit' ? '-' : ''}
                                                    {formatCurrency(displayAmount, displayCurrency)}
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
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
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

            {/* Transaction Detail Modal — the customer's receipt, plus the operational extras
                (user, internal id, provider reference, raw metadata) an admin also needs. */}
            <AnimatePresence>
                {showDetailModal && selectedTx && (
                    <TransactionDetailModal
                        transaction={selectedTx}
                        onClose={() => setShowDetailModal(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default TransactionMonitor;
