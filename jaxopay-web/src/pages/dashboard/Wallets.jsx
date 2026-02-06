import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wallet,
    Plus,
    ArrowUpRight,
    ArrowDownLeft,
    ArrowLeftRight,
    Lock,
    Unlock,
    Eye,
    EyeOff,
    Search,
    Filter,
    X,
    ChevronDown,
    RefreshCw,
} from 'lucide-react';
import walletService from '../../services/walletService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

// Currency options for wallet creation
const CURRENCY_OPTIONS = {
    fiat: [
        { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
        { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
        { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
        { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
        { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭' },
        { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
    ],
    crypto: [
        { code: 'BTC', name: 'Bitcoin', symbol: '₿', flag: '🪙' },
        { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', flag: '🪙' },
        { code: 'USDT', name: 'Tether', symbol: '₮', flag: '🪙' },
        { code: 'USDC', name: 'USD Coin', symbol: '$', flag: '🪙' },
    ],
};

const Wallets = () => {
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedWallet, setSelectedWallet] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showBalances, setShowBalances] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch wallets on mount
    useEffect(() => {
        fetchWallets();
    }, []);

    const fetchWallets = async () => {
        setLoading(true);
        const result = await walletService.getWallets();
        if (result.success) {
            // Backend returns data as array directly or as data.wallets
            const walletsData = Array.isArray(result.data) ? result.data : (result.data?.wallets || []);
            setWallets(walletsData);
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const fetchWalletTransactions = async (walletId) => {
        const result = await walletService.getTransactions(walletId);
        if (result.success) {
            const txData = result.data?.transactions || (Array.isArray(result.data) ? result.data : []);
            setTransactions(txData);
        }
    };

    const handleSelectWallet = async (wallet) => {
        setSelectedWallet(wallet);
        await fetchWalletTransactions(wallet.id);
    };

    const handleCreateWallet = async (currency, type) => {
        setActionLoading(true);
        const result = await walletService.createWallet(currency, type);
        if (result.success) {
            await fetchWallets();
            setShowCreateModal(false);
        } else {
            setError(result.error);
        }
        setActionLoading(false);
    };

    const handleFreezeWallet = async (walletId) => {
        setActionLoading(true);
        const result = await walletService.freezeWallet(walletId);
        if (result.success) {
            await fetchWallets();
        } else {
            setError(result.error);
        }
        setActionLoading(false);
    };

    const handleUnfreezeWallet = async (walletId) => {
        setActionLoading(true);
        const result = await walletService.unfreezeWallet(walletId);
        if (result.success) {
            await fetchWallets();
        } else {
            setError(result.error);
        }
        setActionLoading(false);
    };

    const handleTransfer = async (fromWalletId, toWalletId, amount, description) => {
        setActionLoading(true);
        const result = await walletService.transfer(fromWalletId, toWalletId, amount, description);
        if (result.success) {
            await fetchWallets();
            if (selectedWallet) {
                await fetchWalletTransactions(selectedWallet.id);
            }
            setShowTransferModal(false);
        } else {
            setError(result.error);
        }
        setActionLoading(false);
    };

    // Filter wallets based on search and type
    const filteredWallets = wallets.filter((wallet) => {
        const matchesSearch =
            wallet.currency.toLowerCase().includes(searchQuery.toLowerCase()) ||
            wallet.wallet_type?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || wallet.wallet_type === filterType;
        return matchesSearch && matchesType;
    });

    // Calculate total balance in USD (simplified)
    const totalBalance = wallets.reduce((sum, wallet) => {
        // This is a simplified conversion - in production, use real exchange rates
        return sum + (wallet.balance || 0);
    }, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wallets</h1>
                    <p className="text-gray-600 dark:text-gray-400">Manage your multi-currency wallets</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Create Wallet
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Total Balance Card */}
            <div className="card bg-gradient-to-br from-primary-500 to-primary-700 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-primary-100 text-sm mb-1">Total Balance</p>
                        <div className="flex items-center gap-3">
                            <h2 className="text-3xl font-bold">
                                {showBalances ? formatCurrency(totalBalance, 'USD') : '••••••'}
                            </h2>
                            <button
                                onClick={() => setShowBalances(!showBalances)}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                {showBalances ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                        <p className="text-primary-100 text-sm mt-2">{wallets.length} active wallet(s)</p>
                    </div>
                    <div className="p-4 bg-white/10 rounded-2xl">
                        <Wallet className="w-12 h-12" />
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-4">
                <button
                    onClick={() => setShowTransferModal(true)}
                    className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors"
                >
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                        <ArrowUpRight className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Send</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                        <ArrowDownLeft className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Receive</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                        <ArrowLeftRight className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Exchange</span>
                </button>
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search wallets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterType === 'all'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterType('fiat')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterType === 'fiat'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                    >
                        Fiat
                    </button>
                    <button
                        onClick={() => setFilterType('crypto')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterType === 'crypto'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                    >
                        Crypto
                    </button>
                    <button
                        onClick={fetchWallets}
                        className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Wallets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWallets.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No wallets found</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            {wallets.length === 0
                                ? "You haven't created any wallets yet."
                                : 'No wallets match your search criteria.'}
                        </p>
                        {wallets.length === 0 && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                                Create Your First Wallet
                            </button>
                        )}
                    </div>
                ) : (
                    filteredWallets.map((wallet) => (
                        <motion.div
                            key={wallet.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`card cursor-pointer hover:shadow-lg transition-all ${selectedWallet?.id === wallet.id ? 'ring-2 ring-primary-500' : ''
                                } ${!wallet.is_active ? 'opacity-75' : ''}`}
                            onClick={() => handleSelectWallet(wallet)}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${wallet.wallet_type === 'crypto'
                                            ? 'bg-orange-100 dark:bg-orange-900/30'
                                            : 'bg-primary-100 dark:bg-primary-900/30'
                                            }`}
                                    >
                                        {CURRENCY_OPTIONS[wallet.wallet_type || 'fiat']?.find(
                                            (c) => c.code === wallet.currency
                                        )?.flag || '💰'}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-white">{wallet.currency}</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                                            {wallet.wallet_type || 'Fiat'} Wallet
                                        </p>
                                    </div>
                                </div>
                                {!wallet.is_active && (
                                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full flex items-center gap-1">
                                        <Lock className="w-3 h-3" />
                                        Frozen
                                    </span>
                                )}
                            </div>

                            <div className="mb-4">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {showBalances ? formatCurrency(wallet.balance || 0, wallet.currency) : '••••••'}
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowTransferModal(true);
                                    }}
                                    disabled={!wallet.is_active}
                                    className="flex-1 py-2 px-3 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Transfer
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        !wallet.is_active
                                            ? handleUnfreezeWallet(wallet.id)
                                            : handleFreezeWallet(wallet.id);
                                    }}
                                    className={`p-2 rounded-lg transition-colors ${!wallet.is_active
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    {!wallet.is_active ? (
                                        <Unlock className="w-5 h-5" />
                                    ) : (
                                        <Lock className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Selected Wallet Transactions */}
            {selectedWallet && (
                <div className="card">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {selectedWallet.currency} Wallet Transactions
                        </h3>
                        <button
                            onClick={() => setSelectedWallet(null)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <p>No transactions yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`p-2 rounded-lg ${tx.transaction_type === 'credit'
                                                ? 'bg-green-100 dark:bg-green-900/30'
                                                : 'bg-red-100 dark:bg-red-900/30'
                                                }`}
                                        >
                                            {tx.transaction_type === 'credit' ? (
                                                <ArrowDownLeft
                                                    className={`w-5 h-5 ${tx.transaction_type === 'credit'
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : 'text-red-600 dark:text-red-400'
                                                        }`}
                                                />
                                            ) : (
                                                <ArrowUpRight className="w-5 h-5 text-red-600 dark:text-red-400" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {tx.description || tx.transaction_type}
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {formatDateTime(tx.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p
                                            className={`font-semibold ${tx.transaction_type === 'credit'
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-600 dark:text-red-400'
                                                }`}
                                        >
                                            {tx.transaction_type === 'credit' ? '+' : '-'}
                                            {formatCurrency(tx.amount, selectedWallet.currency)}
                                        </p>
                                        <p
                                            className={`text-sm ${tx.status === 'completed'
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-yellow-600 dark:text-yellow-400'
                                                }`}
                                        >
                                            {tx.status}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create Wallet Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <CreateWalletModal
                        onClose={() => setShowCreateModal(false)}
                        onCreate={handleCreateWallet}
                        loading={actionLoading}
                        existingCurrencies={wallets.map((w) => w.currency)}
                    />
                )}
            </AnimatePresence>

            {/* Transfer Modal */}
            <AnimatePresence>
                {showTransferModal && (
                    <TransferModal
                        onClose={() => setShowTransferModal(false)}
                        onTransfer={handleTransfer}
                        wallets={wallets.filter((w) => w.is_active !== false)}
                        loading={actionLoading}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// Create Wallet Modal Component
const CreateWalletModal = ({ onClose, onCreate, loading, existingCurrencies }) => {
    const [walletType, setWalletType] = useState('fiat');
    const [selectedCurrency, setSelectedCurrency] = useState('');

    const availableCurrencies = CURRENCY_OPTIONS[walletType].filter(
        (c) => !existingCurrencies.includes(c.code)
    );

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Wallet</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Wallet Type Toggle */}
                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg mb-6">
                    <button
                        onClick={() => {
                            setWalletType('fiat');
                            setSelectedCurrency('');
                        }}
                        className={`flex-1 py-2 font-medium rounded-md transition-colors ${walletType === 'fiat'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                            : 'text-gray-600 dark:text-gray-400'
                            }`}
                    >
                        Fiat Currency
                    </button>
                    <button
                        onClick={() => {
                            setWalletType('crypto');
                            setSelectedCurrency('');
                        }}
                        className={`flex-1 py-2 font-medium rounded-md transition-colors ${walletType === 'crypto'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                            : 'text-gray-600 dark:text-gray-400'
                            }`}
                    >
                        Cryptocurrency
                    </button>
                </div>

                {/* Currency Selection */}
                <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                    {availableCurrencies.length === 0 ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                            You already have wallets for all available {walletType} currencies.
                        </p>
                    ) : (
                        availableCurrencies.map((currency) => (
                            <button
                                key={currency.code}
                                onClick={() => setSelectedCurrency(currency.code)}
                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${selectedCurrency === currency.code
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                    }`}
                            >
                                <span className="text-2xl">{currency.flag}</span>
                                <div className="text-left">
                                    <p className="font-semibold text-gray-900 dark:text-white">{currency.code}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{currency.name}</p>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onCreate(selectedCurrency, walletType)}
                        disabled={!selectedCurrency || loading}
                        className="flex-1 py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating...' : 'Create Wallet'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Transfer Modal Component
const TransferModal = ({ onClose, onTransfer, wallets, loading }) => {
    const [fromWallet, setFromWallet] = useState('');
    const [toWallet, setToWallet] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

    const fromWalletData = wallets.find((w) => w.id === fromWallet);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Transfer Funds</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* From Wallet */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            From Wallet
                        </label>
                        <select
                            value={fromWallet}
                            onChange={(e) => setFromWallet(e.target.value)}
                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Select wallet...</option>
                            {wallets.map((w) => (
                                <option key={w.id} value={w.id}>
                                    {w.currency} - {formatCurrency(w.balance || 0, w.currency)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* To Wallet */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            To Wallet
                        </label>
                        <select
                            value={toWallet}
                            onChange={(e) => setToWallet(e.target.value)}
                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Select wallet...</option>
                            {wallets
                                .filter((w) => w.id !== fromWallet)
                                .map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.currency} - {formatCurrency(w.balance || 0, w.currency)}
                                    </option>
                                ))}
                        </select>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Amount
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500"
                            />
                            {fromWalletData && (
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    {fromWalletData.currency}
                                </span>
                            )}
                        </div>
                        {fromWalletData && (
                            <p className="text-sm text-gray-500 mt-1">
                                Available: {formatCurrency(fromWalletData.balance || 0, fromWalletData.currency)}
                            </p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Description (optional)
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What's this transfer for?"
                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onTransfer(fromWallet, toWallet, parseFloat(amount), description)}
                        disabled={!fromWallet || !toWallet || !amount || parseFloat(amount) <= 0 || loading}
                        className="flex-1 py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Transferring...' : 'Transfer'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default Wallets;
