import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Wallet, ArrowUpRight, ArrowDownLeft, ArrowLeftRight,
    Eye, EyeOff, Search, X, ChevronDown, RefreshCw,
    Copy, Check, Info, AlertCircle, ShieldCheck,
    Star, TrendingUp, Plus, Building2
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import QRCodeSVG from 'react-qr-code';
import walletService from '../../services/walletService';
import cryptoService from '../../services/cryptoService';
import transferService from '../../services/transferService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

// ── Fiat currencies ──────────────────────────────────────────────────────
const FIAT_CURRENCIES = [
    { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
    { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
    { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
    { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
    { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭' },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: '$', flag: '🇨🇦' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
];

const FALLBACK_RATES = {
    'USD': 1, 'NGN': 1650, 'GBP': 0.78, 'EUR': 0.92,
    'BTC': 0.000015, 'ETH': 0.00028, 'USDT': 1, 'USDC': 1,
    'ZAR': 18.8, 'CAD': 1.35, 'GHS': 12.5, 'KES': 130,
    'CNY': 7.2, 'AUD': 1.5, 'JPY': 150, 'SOL': 0.006,
    'BNB': 0.0015, 'XRP': 0.45, 'TRX': 4.5, 'DOGE': 6,
    'LTC': 0.011, 'ADA': 1.1, 'MATIC': 1.8, 'DOT': 0.12,
};

// Popular crypto shown at top of lists
const POPULAR_CRYPTO = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP'];

// Coin icon colors
const COIN_COLORS = {
    BTC: '#f7931a', ETH: '#627eea', USDT: '#26a17b', USDC: '#2775ca',
    BNB: '#f3ba2f', SOL: '#9945ff', XRP: '#00aae4', NGN: '#008751',
    GHS: '#ce1126', TRX: '#ff0013', DOGE: '#c2a633', LTC: '#bfbbbb',
    ADA: '#0033ad', MATIC: '#8247e5', DOT: '#e6007a', CNGN: '#008751',
};

const CoinIcon = ({ code, size = 36, isFiat = false }) => {
    if (isFiat) {
        const fiat = FIAT_CURRENCIES.find(f => f.code === code);
        return <span className="text-2xl leading-none">{fiat?.flag || '💰'}</span>;
    }
    const color = COIN_COLORS[code?.toUpperCase()] || '#848e9c';
    return (
        <div className="rounded-full flex items-center justify-center text-white font-black text-[10px] shrink-0"
            style={{ width: size, height: size, backgroundColor: color }}>
            {(code || '??').slice(0, 4).toUpperCase()}
        </div>
    );
};

// Static fallback networks
const _net = (id, name, extra = {}) => ({
    network: id, name, deposits_enabled: true, withdraws_enabled: true, ...extra,
});
const STATIC_CRYPTO_NETWORKS = {
    BTC: [_net('btc', 'Bitcoin Network')],
    ETH: [_net('erc20', 'Ethereum (ERC20)')],
    USDT: [
        _net('trc20', 'Tron (TRC20)'), _net('erc20', 'Ethereum (ERC20)'),
        _net('bep20', 'BNB Smart Chain (BEP20)'), _net('solana', 'Solana'),
    ],
    USDC: [_net('erc20', 'Ethereum (ERC20)'), _net('trc20', 'Tron (TRC20)'), _net('solana', 'Solana')],
    SOL: [_net('solana', 'Solana')],
    BNB: [_net('bep20', 'BNB Smart Chain (BEP20)')],
    TRX: [_net('trc20', 'Tron (TRC20)')],
    XRP: [_net('xrp', 'XRP Ledger')],
    ADA: [_net('ada', 'Cardano')],
    DOGE: [_net('doge', 'Dogecoin')],
    LTC: [_net('ltc', 'Litecoin')],
    MATIC: [_net('matic', 'Polygon (MATIC)')],
};

// ── Main Component ───────────────────────────────────────────────────────
const Wallets = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [wallets, setWallets] = useState([]);
    const [allCryptos, setAllCryptos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showBalances, setShowBalances] = useState(user?.preferences?.show_balances ?? true);
    const [hideZero, setHideZero] = useState(false);
    const [displayCurrency, setDisplayCurrency] = useState('USD');
    const [totalUSDBalance, setTotalUSDBalance] = useState(0);
    const [isConverting, setIsConverting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all' | 'crypto' | 'fiat'
    const [error, setError] = useState(null);

    // Action modal state
    const [actionModal, setActionModal] = useState(null); // 'deposit' | 'withdraw' | 'transfer'
    const [depositVerifying, setDepositVerifying] = useState(false);
    const [depositMessage, setDepositMessage] = useState(null);

    // Build a balance lookup from user's wallets
    const balanceMap = {};
    wallets.forEach(w => {
        balanceMap[w.currency?.toUpperCase()] = {
            balance: parseFloat(w.balance) || 0,
            wallet_id: w.id,
            wallet_type: w.wallet_type,
            is_active: w.is_active,
        };
    });

    // Build unified asset list (crypto from API + fiat)
    const buildAssetList = useCallback(() => {
        const assets = [];

        // Add crypto assets
        const cryptoCodes = new Set();
        allCryptos.forEach(c => {
            const code = (c.code || c.coin || c.currency || '').toUpperCase();
            if (!code || cryptoCodes.has(code)) return;
            cryptoCodes.add(code);
            assets.push({
                code,
                name: c.name || code,
                type: 'crypto',
                balance: balanceMap[code]?.balance || 0,
                wallet_id: balanceMap[code]?.wallet_id || null,
                is_active: balanceMap[code]?.is_active ?? true,
            });
        });

        // Ensure popular cryptos are always present even if API didn't return them
        POPULAR_CRYPTO.forEach(code => {
            if (!cryptoCodes.has(code)) {
                cryptoCodes.add(code);
                assets.push({
                    code, name: code, type: 'crypto',
                    balance: balanceMap[code]?.balance || 0,
                    wallet_id: balanceMap[code]?.wallet_id || null,
                    is_active: balanceMap[code]?.is_active ?? true,
                });
            }
        });

        // Add fiat currencies
        FIAT_CURRENCIES.forEach(f => {
            assets.push({
                code: f.code,
                name: f.name,
                type: 'fiat',
                symbol: f.symbol,
                flag: f.flag,
                balance: balanceMap[f.code]?.balance || 0,
                wallet_id: balanceMap[f.code]?.wallet_id || null,
                is_active: balanceMap[f.code]?.is_active ?? true,
            });
        });

        return assets;
    }, [allCryptos, wallets]);

    const allAssets = buildAssetList();

    // Filter and sort
    const filteredAssets = allAssets
        .filter(a => {
            if (hideZero && a.balance <= 0) return false;
            if (filterType === 'crypto' && a.type !== 'crypto') return false;
            if (filterType === 'fiat' && a.type !== 'fiat') return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
            }
            return true;
        })
        .sort((a, b) => {
            // Non-zero balance first
            if (a.balance > 0 && b.balance <= 0) return -1;
            if (b.balance > 0 && a.balance <= 0) return 1;
            // Then by USD value
            const aUSD = a.balance / (FALLBACK_RATES[a.code] || 1);
            const bUSD = b.balance / (FALLBACK_RATES[b.code] || 1);
            return bUSD - aUSD;
        });

    // Handle Korapay redirect return
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const depositStatus = params.get('deposit');
        const ref = params.get('ref');
        if (depositStatus === 'pending' && ref) {
            window.history.replaceState({}, '', '/dashboard/wallets');
            setDepositVerifying(true);
            setDepositMessage('Verifying your payment...');
            walletService.verifyDeposit(ref).then(result => {
                setDepositVerifying(false);
                if (result.success && result.data?.status === 'completed') {
                    setDepositMessage('Payment confirmed! Your wallet has been credited.');
                    fetchWallets();
                } else if (result.data?.status === 'pending' || result.data?.status === 'processing') {
                    setDepositMessage('Payment is still processing. Your wallet will be credited shortly.');
                } else {
                    setDepositMessage(result.error || result.data?.message || 'Payment could not be confirmed. Please contact support.');
                }
                setTimeout(() => setDepositMessage(null), 8000);
            });
        }
    }, []);

    useEffect(() => { fetchWallets(); fetchCryptos(); }, []);

    const fetchWallets = async () => {
        setLoading(true);
        const result = await walletService.getWallets();
        if (result.success) {
            const data = Array.isArray(result.data) ? result.data : (result.data?.wallets || []);
            setWallets(data);
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const fetchCryptos = async () => {
        const result = await cryptoService.getSupportedCryptos();
        if (result.success) {
            setAllCryptos(result.data || []);
        }
    };

    // Calculate total USD balance
    useEffect(() => {
        if (wallets.length === 0) { setTotalUSDBalance(0); return; }
        setIsConverting(true);
        let total = 0;
        for (const wallet of wallets) {
            const balance = parseFloat(wallet.balance) || 0;
            const rate = FALLBACK_RATES[wallet.currency] || 1;
            total += balance / rate;
        }
        setTotalUSDBalance(total);
        setIsConverting(false);
    }, [wallets]);

    const assetsWithBalance = allAssets.filter(a => a.balance > 0).length;

    if (loading && wallets.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Error Alert */}
            {error && (
                <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-danger shrink-0" />
                    <p className="text-danger text-sm font-medium">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-danger/70 hover:text-danger"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Deposit Verification Banner */}
            {depositMessage && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg p-4 flex items-center gap-3 bg-primary/10 border border-primary/20">
                    {depositVerifying && <RefreshCw className="w-5 h-5 animate-spin text-primary shrink-0" />}
                    <p className="font-medium text-foreground text-sm">{depositMessage}</p>
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
                            <button onClick={() => setShowBalances(!showBalances)} className="p-1 hover:bg-white/10 rounded-md transition-colors">
                                {showBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="flex flex-col gap-1">
                            {isConverting ? (
                                <div className="h-12 w-48 bg-white/10 animate-pulse rounded-lg" />
                            ) : (
                                <div className="flex items-baseline gap-2">
                                    <h2 className="text-4xl md:text-5xl font-black tracking-tight">
                                        {showBalances ? formatCurrency(totalUSDBalance * (FALLBACK_RATES[displayCurrency] || 1), displayCurrency) : '••••••••'}
                                    </h2>
                                    {showBalances && <span className="text-white/60 font-bold uppercase tracking-widest text-xs">{displayCurrency}</span>}
                                </div>
                            )}
                        </div>
                        <p className="text-white/80 text-sm mt-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            {assetsWithBalance} asset{assetsWithBalance !== 1 ? 's' : ''} with balance
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Display Currency</p>
                        <div className="relative">
                            <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}
                                className="appearance-none bg-card text-foreground border-none rounded-2xl px-8 py-4 pr-14 font-black text-base shadow-2xl transition-all focus:outline-none focus:ring-4 focus:ring-white/20 cursor-pointer w-full md:w-auto min-w-[180px]">
                                <option value="USD">USD (US Dollar)</option>
                                <option value="NGN">NGN (Naira)</option>
                                <option value="BTC">BTC (Bitcoin)</option>
                                <option value="ETH">ETH (Ethereum)</option>
                                <option value="USDT">USDT (Tether)</option>
                                <option value="EUR">EUR (Euro)</option>
                                <option value="GBP">GBP (Pounds)</option>
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none text-foreground" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <button onClick={() => setActionModal('deposit')}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm">
                    <div className="p-3 bg-success/10 rounded-full"><ArrowDownLeft className="w-6 h-6 text-success" /></div>
                    <span className="text-sm font-medium text-foreground">Deposit</span>
                </button>
                <button onClick={() => setActionModal('withdraw')}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm">
                    <div className="p-3 bg-danger/10 rounded-full"><ArrowUpRight className="w-6 h-6 text-danger" /></div>
                    <span className="text-sm font-medium text-foreground">Withdraw</span>
                </button>
                <button onClick={() => setActionModal('transfer')}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm">
                    <div className="p-3 bg-primary/10 rounded-full"><ArrowLeftRight className="w-6 h-6 text-primary" /></div>
                    <span className="text-sm font-medium text-foreground">Transfer</span>
                </button>
                <button onClick={() => navigate('/dashboard/cross-border')}
                    className="flex flex-col items-center gap-2 p-4 bg-card rounded-xl border border-border hover:border-primary transition-colors shadow-sm">
                    <div className="p-3 bg-primary/10 rounded-full"><TrendingUp className="w-6 h-6 text-primary" /></div>
                    <span className="text-sm font-medium text-foreground">Global Pay</span>
                </button>
            </div>

            {/* Search, Filter, and Toggle */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input type="text" placeholder="Search assets..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent text-foreground placeholder:text-muted-foreground" />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    {['all', 'crypto', 'fiat'].map(t => (
                        <button key={t} onClick={() => setFilterType(t)}
                            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors capitalize ${filterType === t ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                            {t}
                        </button>
                    ))}
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer ml-2">
                        <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary" />
                        Hide zero
                    </label>
                    <button onClick={() => { fetchWallets(); fetchCryptos(); }}
                        className="p-2.5 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                        <RefreshCw className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>
            </div>

            {/* Asset List */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Header */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-4">Asset</div>
                    <div className="col-span-3 text-right">Balance</div>
                    <div className="col-span-3 text-right">USD Value</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                {filteredAssets.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
                        <p className="font-medium">No assets found</p>
                        <p className="text-sm mt-1">{hideZero ? 'Try unchecking "Hide zero" to see all assets' : 'No matching currencies'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filteredAssets.map(asset => {
                            const usdValue = asset.balance / (FALLBACK_RATES[asset.code] || 1);
                            const isFiatAsset = asset.type === 'fiat';
                            return (
                                <div key={`${asset.type}-${asset.code}`}
                                    className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors">
                                    {/* Asset info */}
                                    <div className="col-span-6 sm:col-span-4 flex items-center gap-3">
                                        <CoinIcon code={asset.code} isFiat={isFiatAsset} />
                                        <div>
                                            <p className="font-semibold text-foreground text-sm">{asset.code}</p>
                                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{asset.name}</p>
                                        </div>
                                        {isFiatAsset && (
                                            <span className="hidden sm:inline-block px-1.5 py-0.5 bg-muted rounded text-[10px] font-bold text-muted-foreground uppercase">Fiat</span>
                                        )}
                                    </div>

                                    {/* Balance */}
                                    <div className="col-span-3 sm:col-span-3 text-right">
                                        <p className="font-semibold text-foreground text-sm">
                                            {showBalances ? (isFiatAsset ? asset.balance.toFixed(2) : (asset.balance < 0.001 && asset.balance > 0 ? asset.balance.toFixed(8) : asset.balance.toFixed(4))) : '••••'}
                                        </p>
                                    </div>

                                    {/* USD Value */}
                                    <div className="hidden sm:block col-span-3 text-right">
                                        <p className="text-sm text-muted-foreground">
                                            {showBalances ? (usdValue > 0 ? `$${usdValue.toFixed(2)}` : '-') : '••••'}
                                        </p>
                                    </div>

                                    {/* Quick action */}
                                    <div className="col-span-3 sm:col-span-2 text-right">
                                        <button onClick={() => setActionModal('deposit')}
                                            className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                                            Deposit
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Action Modal */}
            <AnimatePresence>
                {actionModal && (
                    <ActionModal
                        action={actionModal}
                        onClose={() => setActionModal(null)}
                        wallets={wallets}
                        allCryptos={allCryptos}
                        balanceMap={balanceMap}
                        onRefresh={fetchWallets}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// ── Unified Action Modal ─────────────────────────────────────────────────
// Handles Deposit, Withdraw, Transfer flows with Crypto/Fiat selector
const ActionModal = ({ action, onClose, wallets, allCryptos, balanceMap, onRefresh }) => {
    const [step, setStep] = useState(1); // 1: Choose type, 2: Choose currency, 3: Form
    const [assetType, setAssetType] = useState(''); // 'crypto' | 'fiat'
    const [selectedCode, setSelectedCode] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const actionLabels = { deposit: 'Deposit', withdraw: 'Withdraw', transfer: 'Transfer' };
    const actionLabel = actionLabels[action] || 'Action';

    // Build currency list based on type
    const getCurrencyList = () => {
        let list = [];
        if (assetType === 'crypto') {
            const seen = new Set();
            allCryptos.forEach(c => {
                const code = (c.code || c.coin || c.currency || '').toUpperCase();
                if (!code || seen.has(code)) return;
                seen.add(code);
                list.push({ code, name: c.name || code, balance: balanceMap[code]?.balance || 0 });
            });
            // Ensure popular are always present
            POPULAR_CRYPTO.forEach(code => {
                if (!seen.has(code)) {
                    seen.add(code);
                    list.push({ code, name: code, balance: balanceMap[code]?.balance || 0 });
                }
            });
        } else {
            FIAT_CURRENCIES.forEach(f => {
                list.push({ code: f.code, name: f.name, flag: f.flag, balance: balanceMap[f.code]?.balance || 0 });
            });
        }

        // Filter by search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
        }

        // Sort: balance first, then alphabetical
        list.sort((a, b) => {
            if (a.balance > 0 && b.balance <= 0) return -1;
            if (b.balance > 0 && a.balance <= 0) return 1;
            const aUSD = a.balance / (FALLBACK_RATES[a.code] || 1);
            const bUSD = b.balance / (FALLBACK_RATES[b.code] || 1);
            if (aUSD !== bUSD) return bUSD - aUSD;
            return a.code.localeCompare(b.code);
        });

        return list;
    };

    const handleSelectType = (type) => {
        setAssetType(type);
        setSelectedCode('');
        setSearchQuery('');
        setStep(2);
    };

    const handleSelectCurrency = (code) => {
        setSelectedCode(code);
        setStep(3);
    };

    const handleBack = () => {
        if (step === 3) { setStep(2); setSelectedCode(''); }
        else if (step === 2) { setStep(1); setAssetType(''); }
        else onClose();
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={onClose}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        {step > 1 && (
                            <button onClick={handleBack} className="p-1 hover:bg-muted rounded-lg transition-colors">
                                <ChevronDown className="w-5 h-5 text-muted-foreground rotate-90" />
                            </button>
                        )}
                        <h2 className="text-lg font-bold text-foreground">{actionLabel}</h2>
                        {step > 1 && (
                            <span className="px-2 py-0.5 bg-muted rounded-md text-xs font-bold text-muted-foreground uppercase">
                                {assetType}{selectedCode ? ` · ${selectedCode}` : ''}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Step 1: Choose Crypto or Fiat */}
                {step === 1 && (
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-muted-foreground">What would you like to {action}?</p>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleSelectType('crypto')}
                                className="p-6 rounded-xl border-2 border-border hover:border-primary bg-muted/30 hover:bg-primary/5 transition-all text-center group">
                                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl">🪙</span>
                                </div>
                                <p className="font-bold text-foreground">Crypto</p>
                                <p className="text-xs text-muted-foreground mt-1">BTC, ETH, USDT...</p>
                            </button>
                            <button onClick={() => handleSelectType('fiat')}
                                className="p-6 rounded-xl border-2 border-border hover:border-primary bg-muted/30 hover:bg-primary/5 transition-all text-center group">
                                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl">💵</span>
                                </div>
                                <p className="font-bold text-foreground">Fiat</p>
                                <p className="text-xs text-muted-foreground mt-1">NGN, USD, EUR...</p>
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Select Currency */}
                {step === 2 && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* Search */}
                        <div className="px-4 py-3 border-b border-border">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input type="text" placeholder={`Search ${assetType} currencies...`}
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none" />
                            </div>
                        </div>
                        {/* Currency list */}
                        <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '50vh' }}>
                            {getCurrencyList().map(c => (
                                <button key={c.code} onClick={() => handleSelectCurrency(c.code)}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors">
                                    {assetType === 'fiat' ? (
                                        <span className="text-2xl">{c.flag || '💰'}</span>
                                    ) : (
                                        <CoinIcon code={c.code} size={36} />
                                    )}
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-bold text-foreground">{c.code}</p>
                                        <p className="text-xs text-muted-foreground">{c.name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-foreground tabular-nums">
                                            {c.balance > 0 ? (assetType === 'fiat' ? c.balance.toFixed(2) : (c.balance < 0.001 ? c.balance.toFixed(8) : c.balance.toFixed(4))) : '0.00'}
                                        </p>
                                        {c.balance > 0 && (
                                            <p className="text-[10px] text-muted-foreground">
                                                ≈ ${(c.balance / (FALLBACK_RATES[c.code] || 1)).toFixed(2)}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {getCurrencyList().length === 0 && (
                                <p className="text-center text-muted-foreground text-sm py-8">No currencies found</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3: Transaction Form */}
                {step === 3 && (
                    <div className="flex-1 overflow-y-auto">
                        {action === 'deposit' && (
                            <DepositForm
                                code={selectedCode}
                                type={assetType}
                                wallets={wallets}
                                balanceMap={balanceMap}
                                onClose={onClose}
                                onRefresh={onRefresh}
                            />
                        )}
                        {action === 'withdraw' && (
                            <WithdrawForm
                                code={selectedCode}
                                type={assetType}
                                wallets={wallets}
                                balanceMap={balanceMap}
                                onClose={onClose}
                                onRefresh={onRefresh}
                            />
                        )}
                        {action === 'transfer' && (
                            <TransferForm
                                code={selectedCode}
                                type={assetType}
                                wallets={wallets}
                                balanceMap={balanceMap}
                                onClose={onClose}
                                onRefresh={onRefresh}
                            />
                        )}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

// ── Deposit Form ─────────────────────────────────────────────────────────
const DepositForm = ({ code, type, wallets, balanceMap, onClose, onRefresh }) => {
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [stage, setStage] = useState('form'); // 'form' | 'processing' | 'success'

    // Crypto deposit states
    const [network, setNetwork] = useState('');
    const [networks, setNetworks] = useState([]);
    const [depositAddress, setDepositAddress] = useState(null);
    const [addressPending, setAddressPending] = useState(false);
    const [copied, setCopied] = useState(false);
    const retryRef = useRef(0);
    const retryTimerRef = useRef(null);

    const walletInfo = balanceMap[code];
    const existingWallet = wallets.find(w => w.currency?.toUpperCase() === code?.toUpperCase());
    const isCrypto = type === 'crypto';

    const handleCopy = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Auto-create wallet if needed for deposit
    const ensureWallet = async () => {
        if (existingWallet) return existingWallet;
        const res = await walletService.createWallet(code, isCrypto ? 'crypto' : 'fiat');
        if (res.success) {
            await onRefresh();
            return res.data;
        }
        throw new Error(res.error || 'Failed to create wallet');
    };

    // Fetch networks for crypto
    useEffect(() => {
        if (!isCrypto) return;
        setLoading(true);
        const coinUp = code.toUpperCase();
        cryptoService.getNetworks(code).then(res => {
            const raw = res.success && res.data?.networks?.length > 0
                ? res.data.networks
                : (STATIC_CRYPTO_NETWORKS[coinUp] || [{ network: coinUp, name: coinUp }]);
            setNetworks(raw.filter(n => n.deposits_enabled !== false));
        }).catch(() => {
            setNetworks(STATIC_CRYPTO_NETWORKS[code.toUpperCase()] || [{ network: code, name: code }]);
        }).finally(() => setLoading(false));
    }, [code, isCrypto]);

    // Fetch deposit address when network selected
    useEffect(() => {
        if (!isCrypto || !network) { setDepositAddress(null); setAddressPending(false); return; }
        retryRef.current = 0;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

        let cancelled = false;
        const fetchAddr = async () => {
            if (cancelled) return;
            setLoading(true); setError(null);
            try {
                await ensureWallet();
                const res = await cryptoService.getDepositAddress(code, network);
                if (cancelled) return;
                if (res.success && res.data?.address) {
                    setDepositAddress(res.data);
                    setAddressPending(false);
                } else if (res.pending) {
                    setAddressPending(true);
                    setDepositAddress(null);
                    if (retryRef.current < 12) {
                        retryRef.current += 1;
                        retryTimerRef.current = setTimeout(fetchAddr, 5000);
                    } else {
                        setAddressPending(false);
                        setError('Address generation is taking longer than usual. Please try again.');
                    }
                } else {
                    setAddressPending(false);
                    setError(res.error || 'Could not get deposit address');
                }
            } catch (e) {
                if (!cancelled) { setAddressPending(false); setError(e.message || 'Failed'); }
            }
            if (!cancelled) setLoading(false);
        };
        fetchAddr();
        return () => { cancelled = true; if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
    }, [network]);

    // Fiat deposit via Korapay
    const handleFiatDeposit = async () => {
        if (!amount || parseFloat(amount) <= 0) return;
        setLoading(true); setError(null); setStage('processing');
        try {
            let wallet = existingWallet;
            if (!wallet) wallet = await ensureWallet();

            const result = await walletService.initializeDeposit(wallet.id, parseFloat(amount), code);
            if (result.success) {
                const { checkout_url, mode } = result.data;
                if (mode === 'simulation') {
                    await walletService.addFunds(wallet.id, parseFloat(amount), 'Manual deposit');
                    setStage('success');
                    setTimeout(() => { onRefresh(); onClose(); }, 2500);
                } else if (checkout_url) {
                    window.location.href = checkout_url;
                } else {
                    setError('No checkout URL returned.'); setStage('form');
                }
            } else {
                setError(result.error || 'Deposit failed'); setStage('form');
            }
        } catch (e) {
            setError(e.message || 'Something went wrong'); setStage('form');
        }
        setLoading(false);
    };

    if (stage === 'success') {
        return (
            <div className="p-8 text-center">
                <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Deposit Successful!</h3>
                <p className="text-muted-foreground text-sm">Your wallet balance will update shortly.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                {isCrypto ? <CoinIcon code={code} size={40} /> : <span className="text-3xl">{FIAT_CURRENCIES.find(f => f.code === code)?.flag || '💰'}</span>}
                <div>
                    <p className="font-bold text-foreground">{code}</p>
                    <p className="text-xs text-muted-foreground">Balance: {(balanceMap[code]?.balance || 0).toFixed(isCrypto ? 6 : 2)}</p>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                    <p className="text-sm text-danger">{error}</p>
                </div>
            )}

            {isCrypto ? (
                /* Crypto deposit: show network selector + address */
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Select Network</label>
                        <select value={network} onChange={(e) => { setNetwork(e.target.value); setDepositAddress(null); }}
                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground font-medium focus:ring-2 focus:ring-ring focus:outline-none">
                            <option value="" className="bg-card text-foreground">Choose network...</option>
                            {networks.map(n => <option key={n.network} value={n.network} className="bg-card text-foreground">{n.name || n.network}</option>)}
                        </select>
                    </div>

                    {loading && !addressPending && (
                        <div className="flex justify-center py-8"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>
                    )}

                    {addressPending && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-sm font-bold text-foreground">Generating address...</p>
                            <p className="text-xs text-muted-foreground">This usually takes 10-30 seconds.</p>
                        </div>
                    )}

                    {depositAddress && !addressPending && (
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="bg-white p-4 rounded-xl shadow-sm">
                                    <QRCodeSVG value={depositAddress.address || ''} size={128} />
                                </div>
                            </div>
                            <div className="bg-muted/50 rounded-xl p-4 border border-border">
                                <p className="text-xs text-muted-foreground mb-2">Your {code} Address ({network})</p>
                                <div className="flex items-center gap-2">
                                    <code className="text-xs font-mono text-foreground break-all flex-1">{depositAddress.address}</code>
                                    <button onClick={() => handleCopy(depositAddress.address)} className="p-2 hover:bg-muted rounded-lg shrink-0">
                                        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                                    </button>
                                </div>
                                {depositAddress.memo && (
                                    <div className="mt-3 pt-3 border-t border-border">
                                        <p className="text-xs text-danger font-bold mb-1">MEMO REQUIRED:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="text-sm font-mono font-bold text-foreground flex-1">{depositAddress.memo}</code>
                                            <button onClick={() => handleCopy(depositAddress.memo)} className="p-2 hover:bg-muted rounded-lg shrink-0">
                                                <Copy className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-danger text-center font-medium leading-relaxed">
                                Only send {code} via the {network} network. Funds sent via other networks will be lost.
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                /* Fiat deposit: amount input + proceed to payment */
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Amount to Deposit</label>
                        <div className="relative">
                            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full pl-14 pr-4 py-4 bg-muted border border-border rounded-xl focus:ring-2 focus:ring-ring focus:outline-none text-xl font-bold text-foreground placeholder:text-muted-foreground" />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">{code}</div>
                        </div>
                    </div>
                    <button onClick={handleFiatDeposit}
                        disabled={loading || !amount || parseFloat(amount) <= 0}
                        className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Proceed to Payment'}
                    </button>
                </div>
            )}
        </div>
    );
};

// ── Withdraw Form ────────────────────────────────────────────────────────
const WithdrawForm = ({ code, type, wallets, balanceMap, onClose, onRefresh }) => {
    const [amount, setAmount] = useState('');
    const [recipient, setRecipient] = useState('');
    const [network, setNetwork] = useState('');
    const [networks, setNetworks] = useState([]);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Bank transfer states (fiat)
    const [banks, setBanks] = useState([]);
    const [selectedBank, setSelectedBank] = useState('');
    const [accountName, setAccountName] = useState('');
    const [resolvingAccount, setResolvingAccount] = useState(false);

    const isCrypto = type === 'crypto';
    const balance = balanceMap[code]?.balance || 0;
    const walletId = balanceMap[code]?.wallet_id;
    const wallet = wallets.find(w => w.id === walletId);

    // Fetch networks for crypto
    useEffect(() => {
        if (!isCrypto) return;
        cryptoService.getNetworks(code).then(res => {
            const raw = res.success && res.data?.networks?.length > 0 ? res.data.networks : (STATIC_CRYPTO_NETWORKS[code.toUpperCase()] || []);
            setNetworks(raw.filter(n => n.withdraws_enabled !== false));
        }).catch(() => setNetworks(STATIC_CRYPTO_NETWORKS[code.toUpperCase()] || []));
    }, [code, isCrypto]);

    // Fetch banks for fiat
    useEffect(() => {
        if (isCrypto) return;
        transferService.getBanks(code).then(res => {
            if (res.success) setBanks(res.data || []);
        });
    }, [code, isCrypto]);

    // Resolve account name
    useEffect(() => {
        if (isCrypto || !selectedBank || recipient.length < 10 || code !== 'NGN') return;
        const resolve = async () => {
            setResolvingAccount(true); setAccountName('');
            const res = await transferService.resolveAccount(selectedBank, recipient, 'NGN');
            if (res.success) setAccountName(res.data.account_name);
            setResolvingAccount(false);
        };
        resolve();
    }, [recipient, selectedBank, code, isCrypto]);

    const handleWithdraw = async () => {
        setLoading(true); setError(null);
        try {
            if (isCrypto) {
                const res = await cryptoService.withdraw({
                    coin: code, address: recipient, amount: parseFloat(amount), network, memo: description,
                });
                if (res.success) { onRefresh(); onClose(); }
                else setError(res.error || 'Withdrawal failed');
            } else {
                const res = await transferService.sendTransfer({
                    wallet_id: walletId, bank_code: selectedBank, account_number: recipient,
                    account_name: accountName, amount: parseFloat(amount), narration: description, currency: code,
                });
                if (res.success) { onRefresh(); onClose(); }
                else setError(res.error || 'Transfer failed');
            }
        } catch (e) {
            setError(e.message || 'Something went wrong');
        }
        setLoading(false);
    };

    if (!walletId || balance <= 0) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">No {code} Balance</h3>
                <p className="text-sm text-muted-foreground">You need to deposit {code} first before you can withdraw.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                {isCrypto ? <CoinIcon code={code} size={40} /> : <span className="text-3xl">{FIAT_CURRENCIES.find(f => f.code === code)?.flag || '💰'}</span>}
                <div>
                    <p className="font-bold text-foreground">{code}</p>
                    <p className="text-xs text-muted-foreground">Available: {balance.toFixed(isCrypto ? 6 : 2)}</p>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                    <p className="text-sm text-danger">{error}</p>
                </div>
            )}

            <div className="space-y-4">
                {!isCrypto && (
                    <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Select Bank</label>
                        <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground font-medium focus:ring-2 focus:ring-ring focus:outline-none">
                            <option value="" className="bg-card text-foreground">Choose bank...</option>
                            {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                        </select>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        {isCrypto ? 'Wallet Address' : 'Account Number'}
                    </label>
                    <div className="relative">
                        <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
                            placeholder={isCrypto ? 'Paste wallet address' : '0123456789'}
                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground font-medium focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                        {resolvingAccount && <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
                    </div>
                    {accountName && (
                        <div className="mt-2 px-3 py-2 bg-primary/10 rounded-lg flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold text-primary">{accountName}</span>
                        </div>
                    )}
                </div>

                {isCrypto && (
                    <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Network</label>
                        <select value={network} onChange={(e) => setNetwork(e.target.value)}
                            className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground font-medium focus:ring-2 focus:ring-ring focus:outline-none">
                            <option value="" className="bg-card text-foreground">Select network...</option>
                            {networks.map(n => <option key={n.network} value={n.network}>{n.name || n.network}</option>)}
                        </select>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Amount</label>
                    <div className="relative">
                        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                            className="w-full px-4 py-3 pr-16 bg-muted border border-border rounded-xl text-foreground font-bold focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{code}</div>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                        {[25, 50, 75, 100].map(pct => (
                            <button key={pct} type="button" onClick={() => setAmount((balance * pct / 100).toFixed(isCrypto ? 6 : 2))}
                                className="flex-1 py-1 rounded-lg text-[10px] font-bold text-muted-foreground bg-muted border border-border hover:text-primary hover:border-primary/40 transition-colors">
                                {pct}%
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Note (optional)</label>
                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional reference"
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                </div>
            </div>

            <button onClick={handleWithdraw}
                disabled={loading || !recipient || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance || (isCrypto && !network) || (!isCrypto && !selectedBank)}
                className="w-full py-4 bg-danger hover:bg-danger/90 text-white font-bold rounded-xl shadow-lg shadow-danger/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : `Withdraw ${code}`}
            </button>
        </div>
    );
};

// ── Transfer Form (Internal P2P) ─────────────────────────────────────────
const TransferForm = ({ code, type, wallets, balanceMap, onClose, onRefresh }) => {
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const balance = balanceMap[code]?.balance || 0;
    const isCrypto = type === 'crypto';

    const handleTransfer = async () => {
        setLoading(true); setError(null);
        const res = await walletService.transfer(recipient, parseFloat(amount), code, description);
        if (res.success) { onRefresh(); onClose(); }
        else setError(res.error || 'Transfer failed');
        setLoading(false);
    };

    if (balance <= 0) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">No {code} Balance</h3>
                <p className="text-sm text-muted-foreground">Deposit {code} first to make transfers.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                {isCrypto ? <CoinIcon code={code} size={40} /> : <span className="text-3xl">{FIAT_CURRENCIES.find(f => f.code === code)?.flag || '💰'}</span>}
                <div>
                    <p className="font-bold text-foreground">{code}</p>
                    <p className="text-xs text-muted-foreground">Available: {balance.toFixed(isCrypto ? 6 : 2)}</p>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                    <p className="text-sm text-danger">{error}</p>
                </div>
            )}

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Recipient Email</label>
                    <input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground font-medium focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                </div>

                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Amount</label>
                    <div className="relative">
                        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                            className="w-full px-4 py-3 pr-16 bg-muted border border-border rounded-xl text-foreground font-bold focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{code}</div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Note (optional)</label>
                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="What's this for?"
                        className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                </div>
            </div>

            <button onClick={handleTransfer}
                disabled={loading || !recipient || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance}
                className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : `Send ${code}`}
            </button>
        </div>
    );
};

export default Wallets;
