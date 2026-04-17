import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import {
    ArrowUpRight,
    ArrowDownLeft,
    ArrowLeftRight,
    Search,
    Filter,
    Download,
    RefreshCw,
    CreditCard,
    Wallet,
    Receipt,
    Bitcoin,
    X,
    Copy,
    Check,
    Share2,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    Zap,
    Gift,
    Globe,
    ChevronLeft,
    ChevronRight,
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
    { value: 'gift_card', label: 'Gift Cards' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'deposit', label: 'Deposits' },
    { value: 'swap', label: 'Swaps' },
];

const STATUS_OPTIONS = [
    { value: 'all', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
];

const getTransactionIcon = (type) => {
    const icons = {
        transfer: ArrowLeftRight,
        bank_transfer: ArrowUpRight,
        card_funding: CreditCard,
        card_payment: CreditCard,
        crypto_buy: Bitcoin,
        crypto_sell: Bitcoin,
        deposit: ArrowDownLeft,
        bill_payment: Receipt,
        gift_card: Gift,
        swap: Zap,
        cross_border: Globe,
        wallet: Wallet,
    };
    return icons[type] || ArrowUpRight;
};

const getTransactionColors = (type, direction) => {
    if (direction === 'credit' || ['deposit', 'crypto_sell'].includes(type)) {
        return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', amount: 'text-emerald-500' };
    }
    if (type === 'swap') {
        return { bg: 'bg-violet-500/10', text: 'text-violet-500', amount: 'text-foreground' };
    }
    return { bg: 'bg-rose-500/10', text: 'text-rose-500', amount: 'text-foreground' };
};

const StatusIcon = ({ status, size = 'md' }) => {
    const sz = size === 'lg' ? 'w-14 h-14' : 'w-8 h-8';
    const configs = {
        completed: { icon: CheckCircle2, className: `${sz} text-emerald-500` },
        pending:   { icon: Clock,        className: `${sz} text-amber-500` },
        failed:    { icon: XCircle,      className: `${sz} text-rose-500` },
        cancelled: { icon: XCircle,      className: `${sz} text-rose-500` },
        processing:{ icon: Clock,        className: `${sz} text-amber-500` },
    };
    const cfg = configs[status?.toLowerCase()] || { icon: AlertCircle, className: `${sz} text-muted-foreground` };
    const Icon = cfg.icon;
    return <Icon className={cfg.className} />;
};

// ─── Receipt component (rendered off-screen for PNG export) ──────────────────
const TransactionReceipt = ({ transaction, receiptRef }) => {
    const colors = getTransactionColors(transaction.transaction_type, transaction.direction);
    const isCredit = transaction.direction === 'credit' || transaction.transaction_type === 'deposit';

    const fields = [
        { label: 'Transaction Type', value: formatTransactionType(transaction.transaction_type) },
        { label: 'Status', value: transaction.status?.charAt(0).toUpperCase() + transaction.status?.slice(1) },
        { label: 'Date & Time', value: formatDateTime(transaction.created_at) },
        transaction.reference && { label: 'Reference', value: transaction.reference },
        transaction.description && { label: 'Description', value: transaction.description },
        transaction.fee && parseFloat(transaction.fee) > 0 && {
            label: 'Fee',
            value: formatCurrency(transaction.fee, transaction.currency),
        },
        transaction.exchange_rate && { label: 'Exchange Rate', value: `1 ${transaction.from_currency || ''} = ${transaction.exchange_rate} ${transaction.to_currency || ''}` },
    ].filter(Boolean);

    return (
        <div
            ref={receiptRef}
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#0f1117' }}
            className="w-[420px] rounded-3xl overflow-hidden"
        >
            {/* Header gradient */}
            <div style={{
                background: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 50%, #7c3aed 100%)',
                padding: '32px 32px 40px',
                textAlign: 'center',
            }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
                    <img src="/logo-white.png" alt="Jaxopay" style={{ height: 28, width: 'auto' }} />
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 16, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Proof of Transaction
                </p>
                <p style={{
                    color: isCredit ? '#4ade80' : '#fff',
                    fontSize: 40,
                    fontWeight: 700,
                    marginBottom: 8,
                    letterSpacing: '-0.02em',
                }}>
                    {isCredit ? '+' : '-'}{formatCurrency(transaction.amount, transaction.currency)}
                </p>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 14px', borderRadius: 999,
                    backgroundColor: transaction.status === 'completed' ? 'rgba(74,222,128,0.2)' :
                        transaction.status === 'pending' ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.2)',
                    border: `1px solid ${transaction.status === 'completed' ? 'rgba(74,222,128,0.4)' :
                        transaction.status === 'pending' ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'}`,
                }}>
                    <span style={{
                        color: transaction.status === 'completed' ? '#4ade80' :
                            transaction.status === 'pending' ? '#fbbf24' : '#f87171',
                        fontSize: 13, fontWeight: 600,
                    }}>
                        {transaction.status?.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* Wave divider */}
            <div style={{ height: 20, backgroundColor: '#0f1117', marginTop: -1 }} />

            {/* Details */}
            <div style={{ padding: '0 32px 32px', backgroundColor: '#0f1117' }}>
                <div style={{
                    backgroundColor: '#1a1d27',
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.06)',
                }}>
                    {fields.map((field, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                            padding: '14px 20px',
                            borderBottom: i < fields.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        }}>
                            <span style={{ color: '#6b7280', fontSize: 13 }}>{field.label}</span>
                            <span style={{
                                color: field.label === 'Status'
                                    ? (transaction.status === 'completed' ? '#4ade80' :
                                        transaction.status === 'pending' ? '#fbbf24' : '#f87171')
                                    : '#e5e7eb',
                                fontSize: 13, fontWeight: 500,
                                maxWidth: '55%', textAlign: 'right',
                                wordBreak: 'break-all',
                            }}>
                                {field.value}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{ textAlign: 'center', marginTop: 24 }}>
                    <p style={{ color: '#374151', fontSize: 11, letterSpacing: '0.05em' }}>
                        POWERED BY JAXOPAY · jaxopay.com
                    </p>
                    <p style={{ color: '#374151', fontSize: 10, marginTop: 4 }}>
                        Transaction ID: {transaction.id?.slice(0, 8).toUpperCase()}
                    </p>
                </div>
            </div>
        </div>
    );
};

// ─── Full-screen modal ────────────────────────────────────────────────────────
const TransactionDetailModal = ({ transaction, onClose }) => {
    const receiptRef = useRef(null);
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [sharing, setSharing] = useState(false);

    const isCredit = transaction.direction === 'credit' || transaction.transaction_type === 'deposit';
    const colors = getTransactionColors(transaction.transaction_type, transaction.direction);

    const copyReference = async () => {
        try {
            await navigator.clipboard.writeText(transaction.reference || transaction.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard not available */ }
    };

    const downloadReceipt = async () => {
        if (!receiptRef.current) return;
        setDownloading(true);
        try {
            const dataUrl = await toPng(receiptRef.current, {
                cacheBust: true,
                quality: 1,
                pixelRatio: 2,
            });
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

    const shareReceipt = async () => {
        if (!receiptRef.current) return;
        setSharing(true);
        try {
            // Generate image blob for sharing
            const dataUrl = await toPng(receiptRef.current, { cacheBust: true, quality: 1, pixelRatio: 2 });
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `jaxopay-receipt-${transaction.reference || transaction.id?.slice(0, 8)}.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Jaxopay Transaction Receipt',
                    text: `${isCredit ? '+' : '-'}${formatCurrency(transaction.amount, transaction.currency)} · ${transaction.status}`,
                    files: [file],
                });
            } else if (navigator.share) {
                await navigator.share({
                    title: 'Jaxopay Transaction Receipt',
                    text: `${isCredit ? '+' : '-'}${formatCurrency(transaction.amount, transaction.currency)} · Ref: ${transaction.reference || transaction.id?.slice(0, 8)} · ${transaction.status}`,
                });
            } else {
                // Fallback: copy reference
                await copyReference();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                await copyReference(); // Fallback
            }
        } finally {
            setSharing(false);
        }
    };

    const fields = [
        { label: 'Transaction Type', value: formatTransactionType(transaction.transaction_type) },
        { label: 'Date & Time', value: formatDateTime(transaction.created_at) },
        transaction.reference && { label: 'Reference', value: transaction.reference },
        transaction.description && { label: 'Description', value: transaction.description },
        transaction.fee && parseFloat(transaction.fee) > 0 && {
            label: 'Fee',
            value: formatCurrency(transaction.fee, transaction.currency),
        },
        transaction.exchange_rate && {
            label: 'Exchange Rate',
            value: `1 ${transaction.from_currency || ''} = ${transaction.exchange_rate} ${transaction.to_currency || ''}`,
        },
        transaction.from_amount && transaction.to_amount && {
            label: 'Converted',
            value: `${formatCurrency(transaction.from_amount, transaction.from_currency)} → ${formatCurrency(transaction.to_amount, transaction.to_currency)}`,
        },
    ].filter(Boolean);

    return (
        <>
            {/* Hidden receipt for PNG export */}
            <div style={{ position: 'fixed', left: -9999, top: -9999, pointerEvents: 'none', zIndex: -1 }}>
                <TransactionReceipt transaction={transaction} receiptRef={receiptRef} />
            </div>

            {/* Modal overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: 60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 60, opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    className="w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Drag handle (mobile) */}
                    <div className="flex justify-center pt-3 pb-1 sm:hidden">
                        <div className="w-10 h-1 rounded-full bg-border" />
                    </div>

                    {/* Status header */}
                    <div className="relative px-6 pt-4 pb-6 text-center">
                        <button
                            onClick={onClose}
                            className="absolute right-4 top-4 p-2 rounded-full hover:bg-muted transition-colors"
                        >
                            <X className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <div className="flex justify-center mb-3">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                                transaction.status === 'completed' ? 'bg-emerald-500/10' :
                                transaction.status === 'pending' ? 'bg-amber-500/10' : 'bg-rose-500/10'
                            }`}>
                                <StatusIcon status={transaction.status} size="lg" />
                            </div>
                        </div>

                        <p className={`text-3xl font-bold tracking-tight mb-1 ${isCredit ? 'text-emerald-500' : 'text-foreground'}`}>
                            {isCredit ? '+' : '-'}{formatCurrency(transaction.amount, transaction.currency)}
                        </p>

                        <p className="text-muted-foreground text-sm">
                            {transaction.description || formatTransactionType(transaction.transaction_type)}
                        </p>

                        <span className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(transaction.status)}`}>
                            <StatusIcon status={transaction.status} size="sm" />
                            {transaction.status?.charAt(0).toUpperCase() + transaction.status?.slice(1)}
                        </span>
                    </div>

                    {/* Divider with dashed cut-out effect */}
                    <div className="relative flex items-center px-6 -mx-0 my-0">
                        <div className="flex-1 border-t border-dashed border-border" />
                        <div className="absolute -left-3 w-6 h-6 rounded-full bg-background border border-border" />
                        <div className="absolute -right-3 w-6 h-6 rounded-full bg-background border border-border" />
                    </div>

                    {/* Transaction details */}
                    <div className="px-6 py-4 max-h-64 overflow-y-auto">
                        <div className="space-y-3">
                            {fields.map((field, i) => (
                                <div key={i} className="flex items-start justify-between gap-4">
                                    <span className="text-sm text-muted-foreground shrink-0">{field.label}</span>
                                    <span className="text-sm font-medium text-foreground text-right break-all">
                                        {field.value}
                                    </span>
                                </div>
                            ))}

                            {/* Reference with copy */}
                            {transaction.reference && (
                                <div className="mt-3 p-3 bg-muted/50 rounded-xl">
                                    <p className="text-xs text-muted-foreground mb-1">Transaction ID</p>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-xs text-foreground break-all">{transaction.id}</span>
                                        <button
                                            onClick={copyReference}
                                            className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors"
                                        >
                                            {copied
                                                ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                            }
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="px-6 pb-6 pt-2 grid grid-cols-2 gap-3">
                        <button
                            onClick={downloadReceipt}
                            disabled={downloading}
                            className="flex items-center justify-center gap-2 py-3 px-4 bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm rounded-xl transition-colors disabled:opacity-60"
                        >
                            {downloading
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <Download className="w-4 h-4" />
                            }
                            {downloading ? 'Saving…' : 'Save Receipt'}
                        </button>

                        <button
                            onClick={shareReceipt}
                            disabled={sharing}
                            className="flex items-center justify-center gap-2 py-3 px-4 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-60"
                        >
                            {sharing
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <Share2 className="w-4 h-4" />
                            }
                            {sharing ? 'Sharing…' : 'Share'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </>
    );
};

// ─── Main page ────────────────────────────────────────────────────────────────
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

    useEffect(() => { fetchTransactions(); }, [typeFilter, statusFilter, dateRange, pagination.page]);
    useEffect(() => { fetchStats(); }, []);

    const fetchTransactions = async () => {
        setLoading(true);
        const params = { page: pagination.page, limit: pagination.limit };
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
        if (result.success) setStats(result.data);
    };

    const filteredTransactions = transactions.filter(tx => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            tx.description?.toLowerCase().includes(q) ||
            tx.reference?.toLowerCase().includes(q) ||
            tx.transaction_type?.toLowerCase().includes(q)
        );
    });

    const clearFilters = () => {
        setTypeFilter('all'); setStatusFilter('all');
        setDateRange({ start: '', end: '' }); setSearchQuery('');
    };

    const exportCSV = () => {
        const headers = ['Date', 'Type', 'Description', 'Amount', 'Currency', 'Status', 'Reference'];
        const rows = filteredTransactions.map(tx => [
            formatDateTime(tx.created_at), formatTransactionType(tx.transaction_type),
            `"${tx.description || ''}"`, tx.amount, tx.currency, tx.status, tx.reference || '',
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        Object.assign(document.createElement('a'), { href: url, download: `jaxopay-transactions-${new Date().toISOString().split('T')[0]}.csv` }).click();
        URL.revokeObjectURL(url);
    };

    const activeFilterCount = [typeFilter !== 'all', statusFilter !== 'all', !!dateRange.start].filter(Boolean).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
                    <p className="text-sm text-muted-foreground">Tap any transaction to view and share proof</p>
                </div>
                <button
                    onClick={exportCSV}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-xl transition-colors"
                >
                    <Download className="w-4 h-4" />
                    Export CSV
                </button>
            </div>

            {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center justify-between">
                    <p className="text-rose-500 text-sm">{error}</p>
                    <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: 'Total Volume', value: formatCurrency(stats.total_volume || 0, 'USD'), color: 'text-foreground' },
                        { label: 'Total Count', value: stats.total_count || 0, color: 'text-foreground' },
                        { label: 'Completed', value: stats.completed_count || 0, color: 'text-emerald-500' },
                        { label: 'Pending', value: stats.pending_count || 0, color: 'text-amber-500' },
                    ].map((s, i) => (
                        <div key={i} className="bg-card border border-border rounded-xl p-4">
                            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Search + Filters */}
            <div className="flex gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by description, reference…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        showFilters || activeFilterCount > 0
                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                            : 'bg-card border border-border text-foreground hover:bg-muted'
                    }`}
                >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>
                    )}
                </button>
                <button
                    onClick={fetchTransactions}
                    className="p-2.5 bg-card border border-border rounded-xl hover:bg-muted transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filter panel */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-card border border-border rounded-xl p-4 overflow-hidden"
                    >
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label>
                                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                                    {TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">From</label>
                                <input type="date" value={dateRange.start}
                                    onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">To</label>
                                <input type="date" value={dateRange.end}
                                    onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
                            </div>
                        </div>
                        {activeFilterCount > 0 && (
                            <button onClick={clearFilters} className="mt-3 text-xs text-primary hover:underline">
                                Clear all filters
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Transaction list */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                ) : filteredTransactions.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                            <ArrowLeftRight className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-foreground mb-1">No transactions found</h3>
                        <p className="text-sm text-muted-foreground">
                            {transactions.length === 0 ? "You haven't made any transactions yet." : 'No results match your filters.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filteredTransactions.map((tx, idx) => {
                            const Icon = getTransactionIcon(tx.transaction_type);
                            const colors = getTransactionColors(tx.transaction_type, tx.direction);
                            const isCredit = tx.direction === 'credit' || tx.transaction_type === 'deposit';
                            return (
                                <motion.button
                                    key={tx.id}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.02 }}
                                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                                    onClick={() => setSelectedTransaction(tx)}
                                >
                                    {/* Icon */}
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors.bg}`}>
                                        <Icon className={`w-5 h-5 ${colors.text}`} />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-foreground text-sm truncate">
                                            {tx.description || formatTransactionType(tx.transaction_type)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(tx.created_at)}</p>
                                    </div>

                                    {/* Amount + status */}
                                    <div className="text-right shrink-0">
                                        <p className={`font-semibold text-sm ${isCredit ? 'text-emerald-500' : 'text-foreground'}`}>
                                            {isCredit ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                                        </p>
                                        <span className={`inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(tx.status)}`}>
                                            {tx.status}
                                        </span>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {pagination.total > pagination.limit && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
                        <p className="text-xs text-muted-foreground">
                            {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                disabled={pagination.page === 1}
                                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                {pagination.page}
                            </span>
                            <button
                                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                disabled={pagination.page * pagination.limit >= pagination.total}
                                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-muted transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Receipt modal */}
            <AnimatePresence>
                {selectedTransaction && (
                    <TransactionDetailModal
                        transaction={selectedTransaction}
                        onClose={() => setSelectedTransaction(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Transactions;
