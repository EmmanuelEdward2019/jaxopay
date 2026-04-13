import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
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
    Copy,
    QrCode,
    Building2,
    Check,
    Info,
    AlertCircle,
    ShieldCheck
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import QRCodeSVG from 'react-qr-code';
import walletService from '../../services/walletService';
import cryptoService from '../../services/cryptoService';
import transferService from '../../services/transferService';
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
        { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
        { code: 'CAD', name: 'Canadian Dollar', symbol: '$', flag: '🇨🇦' },
        { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
        { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
        { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
    ],
    crypto: [
        { code: 'BTC', name: 'Bitcoin', symbol: '₿', flag: '🪙' },
        { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', flag: '🪙' },
        { code: 'USDT', name: 'Tether', symbol: '₮', flag: '🪙' },
        { code: 'USDC', name: 'USD Coin', symbol: '$', flag: '🪙' },
        { code: 'SOL', name: 'Solana', symbol: 'S', flag: '🪙' },
        { code: 'BNB', name: 'BNB', symbol: 'B', flag: '🪙' },
    ],
};

const FALLBACK_RATES = {
    'USD': 1,
    'NGN': 1650, // 1 USD = 1650 NGN
    'GBP': 0.78,
    'EUR': 0.92,
    'BTC': 0.000015,
    'ETH': 0.00028,
    'USDT': 1,
    'USDC': 1,
    'ZAR': 18.8,
    'CAD': 1.35,
    'GHS': 12.5,
    'KES': 130,
    'CNY': 7.2,
    'AUD': 1.5,
    'JPY': 150
};

const Wallets = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedWallet, setSelectedWallet] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showFundModal, setShowFundModal] = useState(false);
    const [showBalances, setShowBalances] = useState(user?.preferences?.show_balances ?? true);
    const [displayCurrency, setDisplayCurrency] = useState('USD');
    const [totalUSDBalance, setTotalUSDBalance] = useState(0);
    const [isConverting, setIsConverting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    const [depositVerifying, setDepositVerifying] = useState(false);
    const [depositMessage, setDepositMessage] = useState(null);

    // Handle Korapay redirect return — verify payment and credit wallet
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const depositStatus = params.get('deposit');
        const ref = params.get('ref');

        if (depositStatus === 'pending' && ref) {
            // Clean the URL
            window.history.replaceState({}, '', '/dashboard/wallets');
            setDepositVerifying(true);
            setDepositMessage('Verifying your payment...');

            walletService.verifyDeposit(ref).then(result => {
                setDepositVerifying(false);
                if (result.success && result.data?.status === 'completed') {
                    setDepositMessage('✅ Payment confirmed! Your wallet has been credited.');
                    fetchWallets();
                } else if (result.data?.status === 'pending' || result.data?.status === 'processing') {
                    setDepositMessage('⏳ Payment is still processing. Your wallet will be credited shortly.');
                } else {
                    setDepositMessage('❌ ' + (result.error || result.data?.message || 'Payment could not be confirmed. Please contact support.'));
                }
                setTimeout(() => setDepositMessage(null), 8000);
            });
        }
    }, []);

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

    useEffect(() => {
        const calculateTotalBalance = async () => {
            if (wallets.length === 0) {
                setTotalUSDBalance(0);
                return;
            }

            setIsConverting(true);
            try {
                let total = 0;
                for (const wallet of wallets) {
                    const balance = parseFloat(wallet.balance) || 0;
                    // Rate is 1 USD = X Currency
                    const rate = FALLBACK_RATES[wallet.currency] || 1;
                    total += balance / rate;
                }
                setTotalUSDBalance(total);
            } catch (err) {
                console.error('Balance calculation error:', err);
            } finally {
                setIsConverting(false);
            }
        };

        calculateTotalBalance();
    }, [wallets]);

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

    const handleTransfer = async (recipientEmail, amount, currency, description) => {
        setActionLoading(true);
        const res = await walletService.transfer(recipientEmail, amount, currency, description);
        if (res.success) {
            setShowTransferModal(false);
            fetchWallets();
            fetchWalletTransactions(selectedWallet.id); // Assuming selectedWallet is still relevant for transactions
        } else {
            alert(res.error || 'Transfer failed');
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

    // Calculate total balance grouped by currency
    const totalBalances = wallets.reduce((acc, wallet) => {
        const bal = parseFloat(wallet.balance) || 0;
        acc[wallet.currency] = (acc[wallet.currency] || 0) + bal;
        return acc;
    }, {});

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Wallets</h1>
                    <p className="text-muted-foreground">Manage your multi-currency wallets</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Create Wallet
                </button>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-700">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Deposit Verification Banner */}
            {depositMessage && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-lg p-4 flex items-center gap-3 ${depositMessage.startsWith('✅')
                        ? 'bg-green-50 border border-green-200'
                        : depositMessage.startsWith('⏳')
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-red-50 border border-red-200'
                        }`}
                >
                    {depositVerifying && <RefreshCw className="w-5 h-5 animate-spin text-blue-600 shrink-0" />}
                    <p className={`font-medium ${depositMessage.startsWith('✅') ? 'text-green-700' : depositMessage.startsWith('⏳') ? 'text-blue-700' : 'text-red-700'}`}>
                        {depositMessage}
                    </p>
                    <button onClick={() => setDepositMessage(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </motion.div>
            )}


            {/* Total Balance Card */}
            <div className="card bg-gradient-to-br from-primary to-accent text-white shadow-xl shadow-primary/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                    <Wallet className="w-32 h-32 rotate-12" />
                </div>

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <p className="text-white/80 text-sm font-medium">Total Portfolio Value</p>
                            <button
                                onClick={() => setShowBalances(!showBalances)}
                                className="p-1 hover:bg-white/10 rounded-md transition-colors"
                            >
                                {showBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        <div className="flex flex-col gap-1">
                            {isConverting ? (
                                <div className="h-12 w-48 bg-white/10 animate-pulse rounded-lg" />
                            ) : (
                                <div className="flex items-baseline gap-2">
                                    <h2 className="text-4xl md:text-5xl font-black tracking-tight">
                                        {showBalances
                                            ? formatCurrency(
                                                totalUSDBalance * (FALLBACK_RATES[displayCurrency] || 1),
                                                displayCurrency
                                            )
                                            : '••••••••'
                                        }
                                    </h2>
                                    {showBalances && <span className="text-white/60 font-bold uppercase tracking-widest text-xs">{displayCurrency}</span>}
                                </div>
                            )}
                        </div>
                        <p className="text-white/80 text-sm mt-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            {wallets.length} active multi-currency wallets
                        </p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Select Display Currency</p>
                        <div className="relative">
                            <select
                                value={displayCurrency}
                                onChange={(e) => setDisplayCurrency(e.target.value)}
                                className="appearance-none bg-card text-foreground border-none rounded-2xl px-8 py-4 pr-14 font-black text-base shadow-2xl transition-all focus:outline-none focus:ring-4 focus:ring-white/20 cursor-pointer w-full md:w-auto min-w-[180px]"
                            >
                                <option value="USD">USD (US Dollar)</option>
                                <option value="NGN">NGN (Naira)</option>
                                <option value="BTC">BTC (Bitcoin)</option>
                                <option value="ETH">ETH (Ethereum)</option>
                                <option value="USDT">USDT (Tether)</option>
                                <option value="USDC">USDC (USD Coin)</option>
                                <option value="EUR">EUR (Euro)</option>
                                <option value="GBP">GBP (Pounds)</option>
                                <option value="CAD">CAD (CAD Dollar)</option>
                                <option value="ZAR">ZAR (Rand)</option>
                                <option value="GHS">GHS (Cedi)</option>
                                <option value="KES">KES (Shilling)</option>
                                <option value="CNY">CNY (Yuan)</option>
                                <option value="AUD">AUD (Australian $)</option>
                                <option value="JPY">JPY (Yen)</option>
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none text-foreground" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <button
                    onClick={() => setShowFundModal(true)}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm"
                >
                    <div className="p-3 bg-success/10 rounded-full">
                        <Plus className="w-6 h-6 text-success" />
                    </div>
                    <span className="text-sm font-medium text-foreground">Deposit</span>
                </button>
                <button
                    onClick={() => setShowTransferModal(true)}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm"
                >
                    <div className="p-3 bg-primary/10 rounded-full">
                        <ArrowUpRight className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">Send</span>
                </button>
                <button
                    onClick={() => setShowTransferModal(true)}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm"
                >
                    <div className="p-3 bg-danger/10 rounded-full">
                        <ArrowUpRight className="w-6 h-6 text-danger" />
                    </div>
                    <span className="text-sm font-medium text-foreground">Withdraw</span>
                </button>
                <button
                    onClick={() => navigate('/dashboard/cross-border')}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm"
                >
                    <div className="p-3 bg-primary/10 rounded-full">
                        <ArrowLeftRight className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">Global Pay</span>
                </button>
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search wallets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterType === 'all'
                            ? 'bg-primary text-white'
                            : 'bg-muted text-foreground'
                            }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterType('fiat')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterType === 'fiat'
                            ? 'bg-primary text-white'
                            : 'bg-muted text-foreground'
                            }`}
                    >
                        Fiat
                    </button>
                    <button
                        onClick={() => setFilterType('crypto')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${filterType === 'crypto'
                            ? 'bg-primary text-white'
                            : 'bg-muted text-foreground'
                            }`}
                    >
                        Crypto
                    </button>
                    <button
                        onClick={fetchWallets}
                        className="p-2.5 bg-muted rounded-lg hover:bg-muted hover:bg-muted transition-colors"
                    >
                        <RefreshCw className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>
            </div>

            {/* Wallets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWallets.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">No wallets found</h3>
                        <p className="text-muted-foreground mb-4">
                            {wallets.length === 0
                                ? "You haven't created any wallets yet."
                                : 'No wallets match your search criteria.'}
                        </p>
                        {wallets.length === 0 && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors"
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
                            className={`card cursor-pointer hover:shadow-lg transition-all ${selectedWallet?.id === wallet.id ? 'ring-2 ring-primary' : ''
                                } ${!wallet.is_active ? 'opacity-75' : ''}`}
                            onClick={() => handleSelectWallet(wallet)}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${wallet.wallet_type === 'crypto'
                                            ? 'bg-success/10'
                                            : 'bg-primary/10'
                                            }`}
                                    >
                                        {CURRENCY_OPTIONS[wallet.wallet_type || 'fiat']?.find(
                                            (c) => c.code === wallet.currency
                                        )?.flag || '💰'}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground">{wallet.currency}</h3>
                                        <p className="text-sm text-muted-foreground capitalize">
                                            {wallet.wallet_type || 'Fiat'} Wallet
                                        </p>
                                    </div>
                                </div>
                                {!wallet.is_active && (
                                    <span className="px-2 py-1 bg-muted text-muted-foreground text-xs font-medium rounded-full flex items-center gap-1 border border-border">
                                        <Lock className="w-3 h-3" />
                                        Frozen
                                    </span>
                                )}
                            </div>

                            <div className="mb-4">
                                <p className="text-sm text-muted-foreground">Balance</p>
                                <p className="text-2xl font-bold text-foreground">
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
                                    className="flex-1 py-2 px-3 bg-primary/10 text-primary font-medium rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                        : 'bg-muted text-muted-foreground hover:bg-muted hover:bg-muted'
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
                        <h3 className="text-lg font-semibold text-foreground">
                            {selectedWallet.currency} Wallet Transactions
                        </h3>
                        <button
                            onClick={() => setSelectedWallet(null)}
                            className="p-2 hover:bg-muted hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>No transactions yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map((tx) => (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`p-2 rounded-lg ${tx.transaction_type === 'credit'
                                                ? 'bg-primary/10'
                                                : 'bg-red-100'
                                                }`}
                                        >
                                            {tx.transaction_type === 'credit' ? (
                                                <ArrowDownLeft
                                                    className={`w-5 h-5 text-primary`}
                                                />
                                            ) : (
                                                <ArrowUpRight className="w-5 h-5 text-red-600" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground">
                                                {tx.description || tx.transaction_type}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {formatDateTime(tx.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p
                                            className={`font-semibold ${tx.transaction_type === 'credit'
                                                ? 'text-primary'
                                                : 'text-red-600'
                                                }`}
                                        >
                                            {tx.transaction_type === 'credit' ? '+' : '-'}
                                            {formatCurrency(tx.amount, selectedWallet.currency)}
                                        </p>
                                        <p
                                            className={`text-sm ${tx.status === 'completed'
                                                ? 'text-primary'
                                                : 'text-yellow-600'
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

            {/* Deposit Modal */}
            <AnimatePresence>
                {showDepositModal && <DepositModal wallets={wallets.filter((w) => w.is_active !== false)} onClose={() => setShowDepositModal(false)} />}
                {showFundModal && <FundModal wallets={wallets.filter((w) => w.is_active !== false)} onClose={() => setShowFundModal(false)} onRefresh={fetchWallets} />}
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
                    <h2 className="text-xl font-bold text-foreground">Create New Wallet</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted hover:bg-muted rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Wallet Type Toggle */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg mb-6">
                    <button
                        onClick={() => {
                            setWalletType('fiat');
                            setSelectedCurrency('');
                        }}
                        className={`flex-1 py-2 font-medium rounded-md transition-colors ${walletType === 'fiat'
                            ? 'bg-card text-foreground shadow'
                            : 'text-muted-foreground'
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
                            ? 'bg-card text-foreground shadow'
                            : 'text-muted-foreground'
                            }`}
                    >
                        Cryptocurrency
                    </button>
                </div>

                {/* Currency Selection */}
                <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                    {availableCurrencies.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">
                            You already have wallets for all available {walletType} currencies.
                        </p>
                    ) : (
                        availableCurrencies.map((currency) => (
                            <button
                                key={currency.code}
                                onClick={() => setSelectedCurrency(currency.code)}
                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${selectedCurrency === currency.code
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-border'
                                    }`}
                            >
                                <span className="text-2xl">{currency.flag}</span>
                                <div className="text-left">
                                    <p className="font-semibold text-foreground">{currency.code}</p>
                                    <p className="text-sm text-muted-foreground">{currency.name}</p>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-muted text-foreground font-semibold rounded-lg transition-colors hover:bg-muted hover:bg-muted"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onCreate(selectedCurrency, walletType)}
                        disabled={!selectedCurrency || loading}
                        className="flex-1 py-3 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating...' : 'Create Wallet'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Transfer Modal Component
const TransferModal = ({ onClose, onTransfer, wallets, loading: actionLoading }) => {
    const [fromWallet, setFromWallet] = useState('');
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [network, setNetwork] = useState('');
    const [withdrawNetworks, setWithdrawNetworks] = useState([]);

    // Bank Transfer States
    const [transferType, setTransferType] = useState('external'); // 'internal' | 'external'
    const [banks, setBanks] = useState([]);
    const [selectedBank, setSelectedBank] = useState('');
    const [accountName, setAccountName] = useState('');
    const [resolvingAccount, setResolvingAccount] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fromWalletData = wallets.find((w) => w.id === fromWallet);
    const isCrypto = fromWalletData?.wallet_type === 'crypto';

    // Fetch networks for the selected crypto wallet, filtered to withdraws_enabled only
    useEffect(() => {
        if (!isCrypto || !fromWalletData?.currency) {
            setWithdrawNetworks([]);
            setNetwork('');
            return;
        }
        let cancelled = false;
        setLoading(true);
        cryptoService.getNetworks(fromWalletData.currency).then(res => {
            if (cancelled) return;
            const all = (res.success && res.data?.networks?.length > 0) ? res.data.networks : [];
            setWithdrawNetworks(all.filter(n => n.withdraws_enabled !== false));
        }).catch(() => {
            if (!cancelled) setWithdrawNetworks([]);
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [isCrypto, fromWallet]);

    useEffect(() => {
        if (fromWalletData?.wallet_type === 'fiat' && transferType === 'external') {
            transferService.getBanks(fromWalletData.currency).then(res => {
                if (res.success) setBanks(res.data);
            });
        }
    }, [fromWalletData, transferType]);

    // Auto-resolve account name for NGN
    useEffect(() => {
        if (transferType === 'external' && selectedBank && recipient.length >= 10 && fromWalletData?.currency === 'NGN') {
            const resolve = async () => {
                setResolvingAccount(true);
                setAccountName('');
                const res = await transferService.resolveAccount(selectedBank, recipient, 'NGN');
                if (res.success) {
                    setAccountName(res.data.account_name);
                }
                setResolvingAccount(false);
            };
            resolve();
        }
    }, [recipient, selectedBank, transferType, fromWalletData]);

    const handleTransferClick = async () => {
        setLoading(true);
        setError(null);

        const payload = {
            amount: parseFloat(amount),
            currency: fromWalletData?.currency,
            description,
        };

        if (isCrypto) {
            const res = await cryptoService.withdraw({
                coin: fromWalletData.currency,
                address: recipient,
                amount: parseFloat(amount),
                network,
                memo: description
            });
            if (res.success) {
                onClose();
                alert('Withdrawal request submitted successfully!');
            } else {
                setError(res.error || 'Withdrawal failed');
            }
        } else if (transferType === 'external') {
            const res = await transferService.sendTransfer({
                wallet_id: fromWallet,
                bank_code: selectedBank,
                account_number: recipient,
                account_name: accountName,
                amount: parseFloat(amount),
                narration: description,
                currency: fromWalletData.currency
            });
            if (res.success) {
                onClose();
                alert('Bank transfer initiated successfully!');
            } else {
                setError(res.error || 'Transfer failed');
            }
        } else {
            // Internal P2P
            onTransfer(recipient, parseFloat(amount), fromWalletData?.currency, description);
        }
        setLoading(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-[2rem] shadow-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto relative"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-black text-foreground">
                            {isCrypto ? 'Withdraw Crypto' : 'Send Funds'}
                        </h2>
                        <p className="text-muted-foreground text-sm">Transfer assets safely and instantly.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted hover:bg-muted rounded-xl transition-all">
                        <X className="w-6 h-6 text-muted-foreground" />
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                <div className="space-y-6">
                    {/* From Wallet */}
                    <div>
                        <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Source Wallet</label>
                        <select
                            value={fromWallet}
                            onChange={(e) => {
                                setFromWallet(e.target.value);
                                setRecipient('');
                                setAccountName('');
                                setSelectedBank('');
                            }}
                            className="w-full px-5 py-4 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none font-bold text-foreground"
                        >
                            <option value="" className="bg-card text-foreground">Select source wallet...</option>
                            {wallets.map((w) => (
                                <option key={w.id} value={w.id}>
                                    {w.currency} - Available: {formatCurrency(w.balance || 0, w.currency)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!isCrypto && fromWalletData && (
                        <div className="flex gap-2 p-1 bg-muted rounded-xl">
                            <button
                                onClick={() => setTransferType('external')}
                                className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${transferType === 'external' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                            >
                                External Bank
                            </button>
                            <button
                                onClick={() => setTransferType('internal')}
                                className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${transferType === 'internal' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                            >
                                Internal P2P
                            </button>
                        </div>
                    )}

                    {/* Dynamic Fields based on type */}
                    {fromWalletData && (
                        <div className="space-y-4">
                            {!isCrypto && transferType === 'external' && (
                                <div>
                                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Select Bank</label>
                                    <select
                                        value={selectedBank}
                                        onChange={(e) => setSelectedBank(e.target.value)}
                                        className="w-full px-5 py-4 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none font-bold text-foreground"
                                    >
                                        <option value="" className="bg-card text-foreground">Choose beneficiary bank...</option>
                                        {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">
                                    {isCrypto ? 'Wallet Address' : transferType === 'external' ? 'Account Number' : 'Recipient Email'}
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={recipient}
                                        onChange={(e) => setRecipient(e.target.value)}
                                        placeholder={isCrypto ? 'Paste address here' : transferType === 'external' ? '0123456789' : 'user@example.com'}
                                        className="w-full px-5 py-4 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none font-bold text-foreground placeholder:text-muted-foreground"
                                    />
                                    {resolvingAccount && (
                                        <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                                    )}
                                </div>
                                {accountName && (
                                    <div className="mt-2 px-4 py-2 bg-primary/10 rounded-xl flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-primary" />
                                        <span className="text-xs font-bold text-primary">{accountName}</span>
                                    </div>
                                )}
                            </div>

                            {isCrypto && (
                                <div>
                                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Network</label>
                                    <select
                                        value={network}
                                        onChange={(e) => setNetwork(e.target.value)}
                                        className="w-full px-5 py-4 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none font-bold text-foreground"
                                    >
                                        <option value="" className="bg-card text-foreground">Select network...</option>
                                        {withdrawNetworks.map(n => (
                                            <option key={n.network} value={n.network}>
                                                {n.name || n.network}
                                            </option>
                                        ))}
                                        {loading && <option disabled>Loading networks...</option>}
                                        {!loading && withdrawNetworks.length === 0 && (
                                            <option disabled>No withdrawal networks available</option>
                                        )}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Amount to Send</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-5 py-4 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none text-xl font-black"
                                    />
                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-muted-foreground">{fromWalletData.currency}</div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Reference/Narration</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Optional note for this transaction..."
                                    className="w-full px-5 py-4 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none text-sm"
                                    rows="2"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-4 mt-8">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 px-6 bg-muted text-muted-foreground font-bold rounded-2xl transition-all hover:bg-muted hover:bg-muted"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleTransferClick}
                        disabled={
                            !fromWallet || !recipient || !amount || parseFloat(amount) <= 0 || loading ||
                            parseFloat(amount) > parseFloat(fromWalletData?.balance || 0) ||
                            (isCrypto && !network) ||
                            (!isCrypto && transferType === 'external' && (!selectedBank || (fromWalletData.currency === 'NGN' && !accountName)))
                        }
                        className="flex-3 py-4 px-8 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl shadow-xl shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : null}
                        {loading ? 'Processing...' : (isCrypto ? 'Withdraw Assets' : 'Confirm Transfer')}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

const DepositModal = ({ onClose, wallets }) => {
    const [selectedWalletId, setSelectedWalletId] = useState('');
    const [copied, setCopied] = useState(false);
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [network, setNetwork] = useState('');
    const [cryptoConfigs, setCryptoConfigs] = useState(null);
    const [addressPending, setAddressPending] = useState(false);
    const depositRetryRef = useRef(0);
    const depositRetryTimer = useRef(null);

    const selectedWallet = wallets.find(w => w.id === selectedWalletId);

    const handleCopy = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Fetch fiat VBA or crypto networks when wallet changes
    useEffect(() => {
        if (!selectedWalletId || !selectedWallet) {
            setDetails(null);
            setError(null);
            setCryptoConfigs(null);
            return;
        }

        if (selectedWallet.wallet_type === 'fiat') {
            let cancelled = false;
            setLoading(true);
            setError(null);
            setDetails(null);
            walletService.getVBA(selectedWalletId).then(res => {
                if (cancelled) return;
                if (res.success) setDetails(res.data);
                else setError(res.message || 'Could not get account details');
            }).catch(e => {
                if (!cancelled) setError(e?.message || 'Something went wrong');
            }).finally(() => {
                if (!cancelled) setLoading(false);
            });
            return () => { cancelled = true; };
        } else {
            // Crypto: fetch networks for the selected coin
            let cancelled = false;
            setLoading(true);
            setError(null);
            setDetails(null);
            const coinUp = selectedWallet.currency?.toUpperCase();
            cryptoService.getNetworks(selectedWallet.currency).then(res => {
                if (cancelled) return;
                const raw = res.success && res.data?.networks?.length > 0
                    ? res.data.networks
                    : (STATIC_CRYPTO_NETWORKS[coinUp] || [{ network: coinUp, name: coinUp }]);
                // Only show networks where deposits are enabled
                const nets = raw.filter(n => n.deposits_enabled !== false);
                setCryptoConfigs([{ coin: coinUp, networkList: nets.length > 0 ? nets : raw }]);
            }).catch(() => {
                if (!cancelled) {
                    const fallback = STATIC_CRYPTO_NETWORKS[coinUp] || [{ network: coinUp, name: coinUp }];
                    setCryptoConfigs([{ coin: coinUp, networkList: fallback }]);
                }
            }).finally(() => {
                if (!cancelled) setLoading(false);
            });
            return () => { cancelled = true; };
        }
    }, [selectedWalletId]);

    // Fetch crypto deposit address when network is selected
    useEffect(() => {
        if (!selectedWallet || selectedWallet.wallet_type !== 'crypto' || !network) {
            setDetails(null);
            setAddressPending(false);
            if (depositRetryTimer.current) clearTimeout(depositRetryTimer.current);
            return;
        }

        depositRetryRef.current = 0;
        if (depositRetryTimer.current) clearTimeout(depositRetryTimer.current);

        let cancelled = false;

        const fetchAddr = async () => {
            if (cancelled) return;
            setLoading(true);
            setError(null);
            try {
                const res = await cryptoService.getDepositAddress(selectedWallet.currency, network);
                if (cancelled) return;
                if (res.success && res.data?.address) {
                    setDetails(res.data);
                    setAddressPending(false);
                } else if (res.pending) {
                    setAddressPending(true);
                    setDetails(null);
                    if (depositRetryRef.current < 12) {
                        depositRetryRef.current += 1;
                        depositRetryTimer.current = setTimeout(fetchAddr, 5000);
                    } else {
                        setAddressPending(false);
                        setError('Address generation is taking longer than usual. Please try again in a minute.');
                    }
                } else {
                    setAddressPending(false);
                    setError(res.error || 'Could not get deposit address');
                }
            } catch (e) {
                if (!cancelled) { setAddressPending(false); setError(e?.message || 'Failed to fetch deposit address'); }
            }
            if (!cancelled) setLoading(false);
        };

        fetchAddr();

        return () => {
            cancelled = true;
            if (depositRetryTimer.current) clearTimeout(depositRetryTimer.current);
        };
    }, [network, selectedWalletId]);

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
                    <h2 className="text-xl font-bold text-foreground">Deposit Funds</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted hover:bg-muted rounded-lg transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Select Wallet</label>
                        <select
                            value={selectedWalletId}
                            onChange={(e) => {
                                setSelectedWalletId(e.target.value);
                                setNetwork('');
                                setDetails(null);
                            }}
                            className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring"
                        >
                            <option value="" className="bg-card text-foreground">Select wallet...</option>
                            {wallets.map(w => (
                                <option key={w.id} value={w.id} className="bg-card text-foreground">{w.currency} - {w.wallet_type?.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>

                    {selectedWallet?.wallet_type === 'crypto' && (
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Network</label>
                            <select
                                value={network}
                                onChange={(e) => setNetwork(e.target.value)}
                                className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring"
                            >
                                <option value="" className="bg-card text-foreground">Select network...</option>
                                {(cryptoConfigs?.find(c => c.coin?.toUpperCase() === selectedWallet.currency?.toUpperCase())?.networkList ||
                                    cryptoConfigs?.find(c => c.coin?.toUpperCase() === selectedWallet.currency?.toUpperCase())?.networks || [])
                                    .map(n => (
                                        <option key={n.network} value={n.network}>{n.name || n.network}</option>
                                    ))}
                            </select>
                        </div>
                    )}

                    {loading && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <RefreshCw className="w-8 h-8 text-primary animate-spin mb-3" />
                            <p className="text-sm text-muted-foreground">Fetching details...</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Fiat VBA Details */}
                    {selectedWallet && details && !loading && selectedWallet.wallet_type === 'fiat' && (
                        <div className="bg-muted/50 rounded-xl p-4 border border-border">
                            <div className="space-y-4 text-sm">
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Bank Name</span>
                                    <span className="font-medium text-foreground">{details.bank_name}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Account Name</span>
                                    <span className="font-medium text-foreground">{details.account_name}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block mb-1">Account Number</span>
                                    <div className="flex items-center gap-2">
                                        <code className="bg-card px-3 py-2 rounded border border-border text-lg font-mono flex-1 tracking-wider text-foreground">
                                            {details.account_number}
                                        </code>
                                        <button onClick={() => handleCopy(details.account_number)} className="p-2 hover:bg-muted hover:bg-muted rounded-lg">
                                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-blue-600 mt-2">
                                    <Info className="w-3 h-3 inline mr-1" />
                                    Fund your wallet by making a bank transfer to these details.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Address pending generation */}
                    {selectedWallet && addressPending && selectedWallet.wallet_type === 'crypto' && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-sm font-bold text-foreground">Generating your {selectedWallet.currency} address…</p>
                            <p className="text-xs text-muted-foreground">This takes 10–30 seconds. Refreshing automatically every 5 seconds.</p>
                        </div>
                    )}

                    {/* Crypto Details */}
                    {selectedWallet && details && !loading && !addressPending && selectedWallet.wallet_type === 'crypto' && (
                        <div className="text-center space-y-4">
                            <div className="bg-white p-4 rounded-xl inline-block shadow-sm">
                                <QRCodeSVG value={details.address || ''} size={128} />
                                <p className="text-[8px] mt-1 text-muted-foreground">Scan to copy address</p>
                            </div>
                            <div className="bg-muted/50 rounded-xl p-4 border border-border">
                                <p className="text-xs text-muted-foreground mb-1">Your {selectedWallet.currency} Address ({network})</p>
                                <div className="flex items-center gap-2">
                                    <code className="bg-card px-3 py-2 rounded border border-border text-xs font-mono flex-1 break-all text-foreground">
                                        {details.address}
                                    </code>
                                    <button onClick={() => handleCopy(details.address)} className="p-2 hover:bg-muted hover:bg-muted rounded-lg shrink-0">
                                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                                    </button>
                                </div>
                                {details.memo && (
                                    <div className="mt-4">
                                        <p className="text-xs text-red-500 font-bold mb-1">MEMO REQUIRED:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="bg-card px-3 py-2 rounded border border-border text-sm font-mono flex-1 text-foreground">{details.memo}</code>
                                            <button onClick={() => handleCopy(details.memo)} className="p-2 hover:bg-muted hover:bg-muted rounded-lg shrink-0">
                                                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <p className="text-[10px] text-red-500 mt-4 leading-tight">
                                    ⚠️ Only send {selectedWallet.currency} to this address via the {network} network.
                                    Sending any other coin or using the wrong network may result in permanent loss.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// Static fallback networks — used when the API is unavailable.
// Network ids are lowercase to match what the exchange API returns.
// deposits_enabled / withdraws_enabled are included so frontend filters work on the fallback path.
const _net = (id, name, extra = {}) => ({
    network: id, name,
    deposits_enabled: true, withdraws_enabled: true,
    ...extra,
});
const STATIC_CRYPTO_NETWORKS = {
    BTC:  [_net('btc',    'Bitcoin Network')],
    ETH:  [_net('erc20',  'Ethereum (ERC20)')],
    USDT: [
        _net('trc20',  'Tron (TRC20)'),
        _net('erc20',  'Ethereum (ERC20)'),
        _net('bep20',  'BNB Smart Chain (BEP20)'),
        _net('solana', 'Solana'),
        _net('celo',   'Celo'),
        _net('ton',    'TON (The Open Network)'),
        _net('avaxc',  'Avalanche C-Chain'),
        _net('matic',  'Polygon (MATIC)'),
    ],
    USDC: [
        _net('erc20',  'Ethereum (ERC20)'),
        _net('trc20',  'Tron (TRC20)'),
        _net('bep20',  'BNB Smart Chain (BEP20)'),
        _net('solana', 'Solana'),
    ],
    SOL:  [_net('solana', 'Solana')],
    BNB:  [_net('bep20',  'BNB Smart Chain (BEP20)')],
    TRX:  [_net('trc20',  'Tron (TRC20)')],
    XRP:  [_net('xrp',    'XRP Ledger')],
    ADA:  [_net('ada',    'Cardano')],
    DOGE: [_net('doge',   'Dogecoin')],
    LTC:  [_net('ltc',    'Litecoin')],
    MATIC:[_net('matic',  'Polygon (MATIC)')],
    DASH: [_net('dash',   'Dash')],
    XLM:  [_net('xlm',    'Stellar')],
    SHIB: [_net('erc20',  'Ethereum (ERC20)')],
};

const FundModal = ({ onClose, wallets, onRefresh }) => {
    const [fundType, setFundType] = useState('fiat'); // 'fiat' | 'crypto'
    const [selectedWalletId, setSelectedWalletId] = useState('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [stage, setStage] = useState('form'); // 'form' | 'processing' | 'awaiting' | 'success'
    const [checkoutRef, setCheckoutRef] = useState(null);
    
    // Crypto states
    const [cryptoDetails, setCryptoDetails] = useState(null);
    const [cryptoNetwork, setCryptoNetwork] = useState('');
    const [cryptoConfigs, setCryptoConfigs] = useState(null);
    const [copied, setCopied] = useState(false);
    const [addressPending, setAddressPending] = useState(false);
    const addressRetryRef = useRef(0);
    const addressRetryTimer = useRef(null);

    const fiatWallets = wallets.filter(w => w.wallet_type === 'fiat');
    const cryptoWallets = wallets.filter(w => w.wallet_type === 'crypto');
    const selectedWallet = wallets.find(w => w.id === selectedWalletId);

    const handleCopy = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFund = async () => {
        if (!selectedWalletId || !amount || parseFloat(amount) <= 0) return;
        setLoading(true);
        setError(null);
        setStage('processing');

        try {
            const result = await walletService.initializeDeposit(
                selectedWalletId,
                parseFloat(amount),
                selectedWallet?.currency || 'NGN'
            );

            if (result.success) {
                const { checkout_url, reference, mode } = result.data;
                setCheckoutRef(reference);

                if (mode === 'simulation') {
                    const addResult = await walletService.addFunds(selectedWalletId, parseFloat(amount), 'Manual deposit');
                    if (addResult.success) {
                        setStage('success');
                        setTimeout(() => { onRefresh(); onClose(); }, 2500);
                    } else {
                        setError(addResult.error || 'Deposit failed');
                        setStage('form');
                    }
                } else if (checkout_url) {
                    window.location.href = checkout_url;
                    return;
                } else {
                    setError('No checkout URL returned. Please try again.');
                    setStage('form');
                }
            } else {
                setError(result.error || 'Failed to initialize deposit');
                setStage('form');
            }
        } catch (err) {
            setError(err.message || 'Something went wrong');
            setStage('form');
        }
        setLoading(false);
    };

    // Fetch networks when a crypto wallet is selected
    useEffect(() => {
        if (fundType !== 'crypto' || !selectedWalletId || !selectedWallet) {
            setCryptoConfigs(null);
            setCryptoDetails(null);
            return;
        }
        const coinUpper = selectedWallet.currency?.toUpperCase();
        const fetchNetworks = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await cryptoService.getNetworks(selectedWallet.currency);
                const raw = result.success && result.data?.networks?.length > 0
                    ? result.data.networks
                    : (STATIC_CRYPTO_NETWORKS[coinUpper] || [{ network: coinUpper, name: coinUpper }]);
                // Only show networks where deposits are enabled
                const nets = raw.filter(n => n.deposits_enabled !== false);
                setCryptoConfigs([{ coin: coinUpper, networkList: nets.length > 0 ? nets : raw }]);
            } catch (e) {
                // Always show at least static networks — never block the user
                const fallback = STATIC_CRYPTO_NETWORKS[coinUpper] || [{ network: coinUpper, name: coinUpper }];
                setCryptoConfigs([{ coin: coinUpper, networkList: fallback }]);
            }
            setLoading(false);
        };
        fetchNetworks();
    }, [fundType, selectedWalletId]);

    // Fetch deposit address when network is selected — with auto-retry for pending generation
    useEffect(() => {
        if (fundType !== 'crypto' || !selectedWalletId || !selectedWallet || !cryptoNetwork) {
            setCryptoDetails(null);
            setAddressPending(false);
            if (addressRetryTimer.current) clearTimeout(addressRetryTimer.current);
            return;
        }

        addressRetryRef.current = 0;
        if (addressRetryTimer.current) clearTimeout(addressRetryTimer.current);

        const fetchAddress = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await cryptoService.getDepositAddress(selectedWallet.currency, cryptoNetwork);
                if (result.success && result.data?.address) {
                    setCryptoDetails(result.data);
                    setAddressPending(false);
                } else if (result.pending) {
                    // Address is being generated in background — auto-retry up to 12 times (~60s)
                    setAddressPending(true);
                    setCryptoDetails(null);
                    if (addressRetryRef.current < 12) {
                        addressRetryRef.current += 1;
                        addressRetryTimer.current = setTimeout(fetchAddress, 5000);
                    } else {
                        setAddressPending(false);
                        setError('Address generation is taking longer than usual. Please close and try again in a minute.');
                    }
                } else {
                    setAddressPending(false);
                    const rawErr = result.error || '';
                    const msg = /timed out|timeout|server error|500/i.test(rawErr)
                        ? 'Service is busy. Please wait a moment and try again.'
                        : rawErr || 'Could not generate deposit address. Please try again.';
                    setError(msg);
                }
            } catch (e) {
                setAddressPending(false);
                setError('Could not generate deposit address. Please try again.');
            }
            setLoading(false);
        };

        fetchAddress();

        return () => {
            if (addressRetryTimer.current) clearTimeout(addressRetryTimer.current);
        };
    }, [cryptoNetwork, selectedWalletId, fundType]);

    if (stage === 'success') {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card border border-border rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl">
                    <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check className="w-10 h-10 text-success" />
                    </div>
                    <h2 className="text-2xl font-black text-foreground mb-2">Success!</h2>
                    <p className="text-muted-foreground font-medium">Your wallet balance will be updated momentarily.</p>
                </motion.div>
            </motion.div>
        );
    }

    if (stage === 'awaiting') {
        // ... (Awaiting status remains similar but with updated styling)
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card border border-border rounded-3xl shadow-2xl max-w-md w-full p-10 text-center max-h-[90vh] overflow-y-auto">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                    </div>
                    <h2 className="text-2xl font-black text-foreground mb-2">Verifying Payment</h2>
                    <p className="text-muted-foreground mb-8 font-medium">Please wait while we confirm your transaction status...</p>
                    <button onClick={onClose} className="w-full py-4 bg-muted text-foreground font-black rounded-2xl">Close Window</button>
                </motion.div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto relative"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-black text-foreground">Fund Wallet</h2>
                        <p className="text-muted-foreground text-sm font-medium">Add money to your Jaxopay account.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted hover:bg-muted rounded-xl transition-all">
                        <X className="w-6 h-6 text-muted-foreground" />
                    </button>
                </div>

                {/* Fund Type Toggle */}
                <div className="flex gap-2 p-1 bg-muted rounded-2xl mb-8 border border-border">
                    <button
                        onClick={() => { setFundType('fiat'); setSelectedWalletId(''); }}
                        className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${fundType === 'fiat' ? 'bg-card text-primary shadow-xl' : 'text-muted-foreground'}`}
                    >
                        BANK / CARD
                    </button>
                    <button
                        onClick={() => { setFundType('crypto'); setSelectedWalletId(''); }}
                        className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${fundType === 'crypto' ? 'bg-card text-primary shadow-xl' : 'text-muted-foreground'}`}
                    >
                        CRYPTO
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-sm font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                <div className="space-y-6">
                    {/* Wallet Selection */}
                    <div>
                        <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-3 px-1">Select {fundType === 'fiat' ? 'Fiat' : 'Crypto'} Wallet</label>
                        <div className="grid grid-cols-2 gap-3">
                            {(fundType === 'fiat' ? fiatWallets : cryptoWallets).map(w => (
                                <button
                                    key={w.id}
                                    onClick={() => { setSelectedWalletId(w.id); setCryptoNetwork(''); setCryptoDetails(null); }}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden group ${selectedWalletId === w.id
                                        ? 'border-primary bg-primary/10 ring-4 ring-primary/10'
                                        : 'border-border hover:border-primary/30'
                                        }`}
                                >
                                    <p className="font-black text-foreground mb-1 uppercase tracking-tight">{w.currency}</p>
                                    <p className="text-[10px] font-bold text-muted-foreground">Bal: {formatCurrency(w.balance, w.currency)}</p>
                                    {selectedWalletId === w.id && <div className="absolute top-2 right-2 w-4 h-4 bg-primary rounded-full flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white stroke-[4px]" /></div>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {fundType === 'fiat' ? (
                        <>
                            <div>
                                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-3 px-1">Amount to Fund</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-14 pr-4 py-5 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none text-2xl font-black text-foreground placeholder:text-muted-foreground"
                                    />
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground font-black">{selectedWallet?.currency || 'NGN'}</div>
                                </div>
                            </div>

                            <button
                                onClick={handleFund}
                                disabled={loading || !selectedWalletId || !amount || parseFloat(amount) <= 0}
                                className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-[1.5rem] shadow-2xl shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg"
                            >
                                {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : 'Confirm & Proceed'}
                            </button>
                        </>
                    ) : (
                        <div className="space-y-6">
                            {selectedWalletId && (
                                <div>
                                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-3 px-1">Choose Network</label>
                                    <select
                                        value={cryptoNetwork}
                                        onChange={(e) => { setCryptoNetwork(e.target.value); setCryptoDetails(null); }}
                                        className="w-full px-5 py-4 bg-muted border border-input rounded-2xl focus:ring-4 focus:ring-ring/10 focus:outline-none font-black text-foreground"
                                    >
                                        <option value="" className="bg-card text-foreground">Select deposit network...</option>
                                        {(cryptoConfigs?.find(c => (c.coin || c.symbol)?.toUpperCase() === selectedWallet.currency?.toUpperCase())?.networkList ||
                                          cryptoConfigs?.find(c => (c.coin || c.symbol)?.toUpperCase() === selectedWallet.currency?.toUpperCase())?.networks)?.map(n => (
                                            <option key={n.network} value={n.network}>{n.name || n.network}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {loading && !addressPending && <div className="flex justify-center p-10"><RefreshCw className="w-10 h-10 animate-spin text-primary" /></div>}

                            {/* Pending address generation */}
                            {addressPending && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col items-center gap-3 py-8 text-center"
                                >
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                                            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-foreground">Generating your wallet address…</p>
                                    <p className="text-xs text-muted-foreground max-w-xs">
                                        Your {selectedWallet?.currency} address is being created on the blockchain. This usually takes 10–30 seconds.
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        Attempt {addressRetryRef.current}/12 — refreshing automatically
                                    </p>
                                </motion.div>
                            )}

                            <AnimatePresence>
                                {cryptoDetails && !addressPending && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                                        <div className="flex justify-center">
                                            <div className="bg-card p-6 rounded-3xl shadow-xl border border-border">
                                                <QRCodeSVG value={cryptoDetails.address || ''} size={128} />
                                            </div>
                                        </div>
                                        <div className="bg-muted p-6 rounded-3xl border border-input">
                                            <label className="text-[10px] font-black text-muted-foreground uppercase mb-2 block tracking-widest">Your {selectedWallet.currency} Address ({cryptoNetwork})</label>
                                            <div className="flex items-center gap-3">
                                                <code className="text-[11px] font-bold text-foreground break-all flex-1 font-mono">{cryptoDetails.address}</code>
                                                <button onClick={() => handleCopy(cryptoDetails.address)} className="p-3 bg-card rounded-xl shadow-sm hover:shadow-md transition-all">
                                                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                                                </button>
                                            </div>
                                            {cryptoDetails.memo && (
                                                <div className="mt-6 pt-6 border-t border-border">
                                                     <label className="text-[10px] font-black text-red-500 uppercase mb-2 block tracking-widest">Memo/Tag Required</label>
                                                     <div className="flex items-center gap-3">
                                                        <code className="text-xl font-black text-foreground flex-1 tracking-widest font-mono">{cryptoDetails.memo}</code>
                                                        <button onClick={() => handleCopy(cryptoDetails.memo)} className="p-3 bg-card rounded-xl shadow-sm hover:shadow-md transition-all">
                                                           <Copy className="w-4 h-4 text-muted-foreground" />
                                                        </button>
                                                     </div>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-bold text-center leading-relaxed">
                                            Only send <span className="text-foreground font-black">{selectedWallet.currency}</span> via the <span className="text-foreground font-black">{cryptoNetwork}</span> network. Funds sent via other networks will be lost.
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default Wallets;

