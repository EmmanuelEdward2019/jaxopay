import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeftRight,
    TrendingUp,
    RefreshCw,
    ArrowDown,
    ArrowUp,
    AlertCircle,
    Check,
    Info,
    ChevronDown,
    Search,
    X,
    Wallet,
    Settings,
    Copy,
    ArrowRight,
    QrCode,
    ShieldCheck,
    MessageCircle,
    LayoutGrid,
    BarChart3
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import walletService from '../../services/walletService';
import { formatCurrency } from '../../utils/formatters';
import TradeDashboard from '../../components/crypto/TradeDashboard';

const GET_FLAG = (code) => {
    const flags = {
        'USD': '🇺🇸', 'NGN': '🇳🇬', 'GHS': '🇬🇭', 'KES': '🇰🇪', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'ZAR': '🇿🇦',
        'USDT': '💵', 'BTC': '₿', 'ETH': 'Ξ', 'USDC': '💵', 'BNB': '🔶', 'SOL': '☀️', 'XRP': '❌',
        'ADA': '₳', 'DOGE': '🐕', 'TRX': '💎', 'LTC': 'Ł', 'DOT': '●', 'MATIC': 'M'
    };
    return flags[code?.toUpperCase()] || '🪙';
};

const GET_SYMBOL = (code) => {
    const symbols = {
        'USD': '$', 'NGN': '₦', 'GHS': '₵', 'KES': 'KSh', 'EUR': '€', 'GBP': '£',
        'BTC': '₿', 'ETH': 'Ξ', 'USDT': '₮', 'USDC': '$'
    };
    return symbols[code?.toUpperCase()] || code;
};

const Exchange = () => {
    const [activeTab, setActiveTab] = useState('exchange'); // 'exchange' | 'order-book' | 'deposit' | 'withdraw'
    const [fromAsset, setFromAsset] = useState({ type: 'fiat', code: 'USD' });
    const [toAsset, setToAsset] = useState({ type: 'crypto', code: 'BTC' });
    const [wallets, setWallets] = useState([]);

    // Amounts
    const [payAmount, setPayAmount] = useState('');
    const [receiveAmount, setReceiveAmount] = useState('');

    // Logic
    const [rates, setRates] = useState(null);
    const [loadingRates, setLoadingRates] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [history, setHistory] = useState([]);
    const [assets, setAssets] = useState({ fiat: [], crypto: [] });

    // Deposit State
    const [depositCoin, setDepositCoin] = useState('USDT');
    const [depositNetwork, setDepositNetwork] = useState('');
    const [depositDetails, setDepositDetails] = useState(null);
    const [fetchingDeposit, setFetchingDeposit] = useState(false);
    const [cryptoConfig, setCryptoConfig] = useState(null);

    // Withdraw State
    const [withdrawCoin, setWithdrawCoin] = useState('USDT');
    const [withdrawNetwork, setWithdrawNetwork] = useState('');
    const [withdrawAddress, setWithdrawAddress] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawMemo, setWithdrawMemo] = useState('');
    const [withdrawFee, setWithdrawFee] = useState(null);
    const [fetchingFee, setFetchingFee] = useState(false);
    const [withdrawReceiveAmount, setWithdrawReceiveAmount] = useState('');

    // UI
    const [showTokenModal, setShowTokenModal] = useState(false);
    const [tokenModalSide, setTokenModalSide] = useState('from');
    const [quoteExpiry, setQuoteExpiry] = useState(0);

    useEffect(() => {
        let timer;
        if (quoteExpiry > 0) {
            timer = setInterval(() => setQuoteExpiry(prev => prev - 1), 1000);
        }
        return () => clearInterval(timer);
    }, [quoteExpiry]);

    // Auto-refresh rates every 5 seconds when on exchange tab
    useEffect(() => {
        if (activeTab !== 'exchange' || !payAmount || parseFloat(payAmount) <= 0) return;
        
        const interval = setInterval(() => {
            fetchRates();
        }, 5000);
        
        return () => clearInterval(interval);
    }, [activeTab, payAmount, fromAsset, toAsset]);

    useEffect(() => {
        if (activeTab === 'exchange') {
            const timer = setTimeout(() => {
                if (payAmount && parseFloat(payAmount) > 0) {
                    fetchRates();
                } else {
                    setReceiveAmount('');
                    setRates(null);
                    setQuoteExpiry(0);
                }
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [payAmount, fromAsset, toAsset, activeTab]);

    useEffect(() => {
        fetchWallets();
        fetchHistory();
        fetchAssets();
    }, []);

    const fetchAssets = async () => {
        const result = await cryptoService.getSupportedCryptos();
        if (result.success) {
            const fetched = result.data;
            setAssets({
                fiat: fetched.filter(a => a.type === 'fiat'),
                crypto: fetched.filter(a => a.type === 'crypto')
            });
            setCryptoConfig(fetched); // Can reuse same data as it now includes networks
        }
    };

    // Update networks when coin changes
    useEffect(() => {
        if (!cryptoConfig) return;
        const config = cryptoConfig.find(c => c.coin === depositCoin);
        const nets = config?.networks || config?.networkList || [];
        if (nets.length > 0 && !nets.find(n => n.network === depositNetwork)) {
            setDepositNetwork(nets[0].network);
        }
    }, [depositCoin, cryptoConfig]);

    useEffect(() => {
        if (!cryptoConfig) return;
        const config = cryptoConfig.find(c => c.coin === withdrawCoin);
        const nets = config?.networks || config?.networkList || [];
        if (nets.length > 0 && !nets.find(n => n.network === withdrawNetwork)) {
            setWithdrawNetwork(nets[0].network);
        }
    }, [withdrawCoin, cryptoConfig]);

    // Fetch withdrawal fee when coin or network changes
    useEffect(() => {
        if (!withdrawCoin || !withdrawNetwork) return;
        
        const fetchFee = async () => {
            setFetchingFee(true);
            try {
                const result = await cryptoService.getWithdrawFee(withdrawCoin.toLowerCase(), withdrawNetwork);
                if (result.success) {
                    setWithdrawFee(result.data.fee);
                    // Calculate receive amount
                    if (withdrawAmount && parseFloat(withdrawAmount) > 0) {
                        const net = parseFloat(withdrawAmount) - parseFloat(result.data.fee);
                        setWithdrawReceiveAmount(net > 0 ? net.toFixed(6) : '0.00');
                    }
                }
            } catch (err) {
                console.error('Failed to fetch withdrawal fee:', err);
            }
            setFetchingFee(false);
        };
        
        fetchFee();
    }, [withdrawCoin, withdrawNetwork]);

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            setWallets(Array.isArray(result.data) ? result.data : (result.data?.wallets || []));
        }
    };

    const fetchConfig = async () => {
        // Reuse fetchAssets for config now
        await fetchAssets();
    };

    const fetchRates = async () => {
        setLoadingRates(true);
        const result = await cryptoService.getExchangeRates(fromAsset.code, toAsset.code, parseFloat(payAmount));

        if (result.success) {
            setRates(result.data);
            const amt = result.data.exchange_amount || result.data.converted_amount;
            setReceiveAmount(amt ? Number(amt).toFixed(toAsset.type === 'crypto' ? 6 : 2) : '');
            setQuoteExpiry(30);
        }
        setLoadingRates(false);
    };

    const fetchHistory = async () => {
        const result = await cryptoService.getCryptoHistory({ limit: 10 });
        if (result.success) {
            setHistory(result.data.exchanges || result.data.transactions || []);
        }
    };

    const handleExchange = async () => {
        if (!payAmount || parseFloat(payAmount) <= 0) {
            setError("Please enter a valid amount");
            return;
        }
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            let result;
            const amount = parseFloat(payAmount);

            if (fromAsset.type === 'fiat' && toAsset.type === 'crypto') {
                result = await cryptoService.buyCrypto(toAsset.code, amount, fromAsset.code);
            } else if (fromAsset.type === 'crypto' && toAsset.type === 'fiat') {
                result = await cryptoService.sellCrypto(fromAsset.code, amount, toAsset.code);
            } else if (fromAsset.type === 'crypto' && toAsset.type === 'crypto') {
                result = await cryptoService.swap({ from_coin: fromAsset.code, to_coin: toAsset.code, amount });
            } else {
                setError("Exchange combination not supported");
                setLoading(false);
                return;
            }

            if (result && result.success) {
                setSuccess(`Exchange completed successfully!`);
                setPayAmount('');
                setReceiveAmount('');
                setRates(null);
                fetchWallets();
                fetchHistory();
            } else {
                setError(result?.error || "Transaction failed. Please try again.");
            }
        } catch (err) {
            setError("An unexpected error occurred: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFetchDepositAddress = async () => {
        if (!depositCoin || !depositNetwork) return;
        setFetchingDeposit(true);
        setDepositDetails(null);
        setError(null);
        
        try {
            const result = await cryptoService.getDepositAddress(depositCoin.toLowerCase(), depositNetwork);
            if (result.success) {
                setDepositDetails(result.data);
            } else {
                setError(result.error || 'Failed to fetch deposit address');
            }
        } catch (err) {
            setError('Failed to fetch deposit address: ' + err.message);
        }
        setFetchingDeposit(false);
    };

    const handleWithdraw = async () => {
        if (!withdrawAddress || !withdrawAmount || !withdrawNetwork) {
            setError('Please fill in all required fields');
            return;
        }
        
        if (parseFloat(withdrawAmount) <= 0) {
            setError('Amount must be greater than 0');
            return;
        }
        
        if (withdrawFee && parseFloat(withdrawAmount) <= withdrawFee) {
            setError('Amount must be greater than the withdrawal fee');
            return;
        }
        
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const result = await cryptoService.withdraw({
                coin: withdrawCoin,
                network: withdrawNetwork,
                address: withdrawAddress,
                amount: parseFloat(withdrawAmount),
                memo: withdrawMemo
            });

            if (result.success) {
                setSuccess('Withdrawal request submitted successfully!');
                setWithdrawAmount('');
                setWithdrawAddress('');
                setWithdrawMemo('');
                setWithdrawReceiveAmount('');
                fetchWallets();
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Withdrawal failed: ' + err.message);
        }
        setLoading(false);
    };

    const selectedDepositCoinConfig = cryptoConfig?.find(c => c.coin?.toUpperCase() === depositCoin?.toUpperCase());
    const selectedWithdrawCoinConfig = cryptoConfig?.find(c => c.coin?.toUpperCase() === withdrawCoin?.toUpperCase());

    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">Crypto Hub</h1>
                    <p className="text-gray-600 dark:text-gray-400 font-medium">Manage, exchange, and transfer your digital assets.</p>
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-gray-700">
                    {['exchange', 'order-book', 'deposit', 'withdraw'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === tab
                                ? 'bg-white dark:bg-gray-700 text-accent-600 shadow-xl'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            {tab === 'order-book' ? 'Order Book' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mb-8 p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-3xl flex items-center gap-4 text-red-600 dark:text-red-400 shadow-sm"
                    >
                        <AlertCircle className="w-6 h-6 flex-shrink-0" />
                        <p className="font-bold">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto text-xs font-black uppercase">Dismiss</button>
                    </motion.div>
                )}
                {success && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mb-8 p-5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-3xl flex items-center gap-4 text-green-600 dark:text-green-400 shadow-sm"
                    >
                        <Check className="w-6 h-6 flex-shrink-0" />
                        <p className="font-bold">{success}</p>
                        <button onClick={() => setSuccess(null)} className="ml-auto text-xs font-black uppercase">Dismiss</button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`grid grid-cols-1 ${activeTab === 'order-book' ? '' : 'lg:grid-cols-3'} gap-8`}>
                {/* Main Content Area */}
                <div className={activeTab === 'order-book' ? 'w-full' : 'lg:col-span-2 space-y-6'}>
                    {activeTab === 'order-book' && <TradeDashboard wallets={wallets} />}

                    {activeTab === 'exchange' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 shadow-2xl border border-gray-100 dark:border-gray-700 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-accent-50 dark:bg-accent-900/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
                            <div className="flex justify-between items-center mb-10">
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Exchange Assets</h2>
                                <button className="p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl hover:bg-gray-100 transition-colors">
                                    <Settings className="w-6 h-6 text-gray-500" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                {/* Pay In Section */}
                                <div className="p-8 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-700">
                                    <div className="flex justify-between mb-4">
                                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">You Pay</span>
                                        <span className="text-xs font-black text-accent-600">
                                            Available: {formatCurrency(wallets.find(w => w.currency === fromAsset.code)?.balance || 0, fromAsset.code)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={payAmount}
                                            onChange={(e) => setPayAmount(e.target.value)}
                                            className="bg-transparent text-5xl font-black text-gray-900 dark:text-white focus:outline-none w-full placeholder-gray-200 dark:placeholder-gray-800"
                                        />
                                        <button
                                            onClick={() => { setTokenModalSide('from'); setShowTokenModal(true); }}
                                            className="flex items-center gap-3 bg-white dark:bg-gray-800 px-6 py-4 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 hover:border-accent-500 transition-all shrink-0 group"
                                        >
                                            <span className="text-3xl group-hover:scale-110 transition-transform">{GET_FLAG(fromAsset.code)}</span>
                                            <span className="font-black text-gray-900 dark:text-white text-lg">{fromAsset.code}</span>
                                            <ChevronDown className="w-5 h-5 text-gray-400" />
                                        </button>
                                    </div>
                                </div>

                                {/* Swap Button */}
                                <div className="flex justify-center -my-6 relative z-10">
                                    <button
                                        onClick={() => {
                                            const temp = fromAsset;
                                            setFromAsset(toAsset);
                                            setToAsset(temp);
                                            setPayAmount(receiveAmount);
                                        }}
                                        className="p-5 bg-accent-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 ring-[12px] ring-white dark:ring-gray-800"
                                    >
                                        <ArrowLeftRight className="w-6 h-6" />
                                    </button>
                                </div>

                                {/* Receive Section */}
                                <div className="p-8 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-700">
                                    <div className="flex justify-between mb-4">
                                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">You Receive</span>
                                        <span className="text-xs font-black text-accent-600">
                                            Available: {formatCurrency(wallets.find(w => w.currency === toAsset.code)?.balance || 0, toAsset.code)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="relative w-full">
                                            <input
                                                type="text"
                                                placeholder="0.00"
                                                value={loadingRates ? '...' : (receiveAmount || '0.00')}
                                                readOnly
                                                className={`bg-transparent text-5xl font-black text-gray-900 dark:text-white focus:outline-none w-full placeholder-gray-200 dark:placeholder-gray-800 ${loadingRates ? 'opacity-50' : ''}`}
                                            />
                                            {loadingRates && (
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                    <RefreshCw className="w-6 h-6 text-accent-500 animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => { setTokenModalSide('to'); setShowTokenModal(true); }}
                                            className="flex items-center gap-3 bg-white dark:bg-gray-800 px-6 py-4 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 hover:border-accent-500 transition-all shrink-0 group"
                                        >
                                            <span className="text-3xl group-hover:scale-110 transition-transform">{GET_FLAG(toAsset.code)}</span>
                                            <span className="font-black text-gray-900 dark:text-white text-lg">{toAsset.code}</span>
                                            <ChevronDown className="w-5 h-5 text-gray-400" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {rates && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="mt-8 p-6 bg-accent-50 dark:bg-accent-900/10 rounded-3xl border border-accent-100 dark:border-accent-800/30"
                                >
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-400">
                                            <RefreshCw className={`w-4 h-4 ${loadingRates ? 'animate-spin' : ''}`} />
                                            <span>Real-time Rate (Powered by Quidax)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-[10px] font-black text-accent-600 px-3 py-1 bg-white dark:bg-gray-800 rounded-full border border-accent-100 uppercase tracking-tighter">
                                                Secures for {quoteExpiry}s
                                            </div>
                                            {quoteExpiry <= 10 && (
                                                <button 
                                                    onClick={fetchRates}
                                                    disabled={loadingRates}
                                                    className="p-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-all disabled:opacity-50"
                                                >
                                                    <RefreshCw className={`w-4 h-4 ${loadingRates ? 'animate-spin' : ''}`} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xl font-black text-gray-900 dark:text-white">
                                        1 {fromAsset.code} = {rates.rate?.toFixed(toAsset.type === 'crypto' ? 8 : 4)} {toAsset.code}
                                    </p>
                                    {rates.rate_with_fee && (
                                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-2">
                                            After fees (1%): 1 {fromAsset.code} = {rates.rate_with_fee?.toFixed(toAsset.type === 'crypto' ? 8 : 4)} {toAsset.code}
                                        </p>
                                    )}
                                </motion.div>
                            )}

                            <button
                                onClick={handleExchange}
                                disabled={loading || !payAmount || parseFloat(payAmount) <= 0 || loadingRates}
                                className="w-full mt-10 py-6 bg-accent-600 hover:bg-accent-700 text-white font-black text-xl rounded-3xl shadow-2xl shadow-accent-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4"
                            >
                                {loading ? <RefreshCw className="w-8 h-8 animate-spin" /> : 'Confirm Swap'}
                            </button>
                        </motion.div>
                    )}

                    {activeTab === 'deposit' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 shadow-2xl border border-gray-100 dark:border-gray-700"
                        >
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">Deposit Crypto</h2>
                            <p className="text-gray-500 font-medium mb-10 leading-relaxed">Securely receive digital assets from any external wallet. Select your preferred currency and network.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Currency</label>
                                    <select
                                        value={depositCoin}
                                        onChange={(e) => setDepositCoin(e.target.value)}
                                        className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold"
                                    >
                                        {(assets.crypto.length > 0 ? assets.crypto : [{code: 'USDT', name: 'Tether'}]).map(c => (
                                            <option key={c.code} value={c.code}>
                                                {c.name} ({c.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Network</label>
                                    <select
                                        value={depositNetwork}
                                        onChange={(e) => setDepositNetwork(e.target.value)}
                                        className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold"
                                    >
                                        <option value="">Select Network</option>
                                        {(selectedDepositCoinConfig?.networkList || selectedDepositCoinConfig?.networks)?.map(n => (
                                            <option key={n.network} value={n.network}>
                                                {n.name || n.network}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Deposit Info Box */}
                            <div className="mb-8 p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-2xl">
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs text-blue-800 dark:text-blue-300 font-medium leading-relaxed">
                                        <p className="font-bold mb-1">How to deposit {depositCoin}:</p>
                                        <ol className="list-decimal list-inside space-y-1 ml-1">
                                            <li>Select the correct network above</li>
                                            <li>Generate your unique deposit address</li>
                                            <li>Send only {depositCoin} via the selected network</li>
                                            <li>Wait for blockchain confirmations</li>
                                            <li>Funds will appear in your wallet automatically</li>
                                        </ol>
                                        <p className="mt-3 font-bold text-red-600">
                                            ⚠️ Warning: Sending other tokens or using wrong network may result in permanent loss!
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {depositDetails ? (
                                <div className="p-10 bg-gray-50 dark:bg-gray-900/50 rounded-[3rem] border-2 border-dashed border-accent-200 dark:border-accent-800 text-center animate-in fade-in zoom-in slide-in-from-bottom-4">
                                    <div className="inline-block bg-white p-6 rounded-[2rem] shadow-xl mb-8">
                                        <QrCode className="w-40 h-40 text-gray-900" />
                                    </div>
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Your Secure {depositCoin} Address</p>
                                    <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 mb-8 shadow-sm">
                                        <code className="text-sm font-mono font-black text-gray-900 dark:text-white break-all flex-1">{depositDetails.address}</code>
                                        <button
                                            onClick={() => {
                                                if (depositDetails?.address) {
                                                    navigator.clipboard.writeText(depositDetails.address);
                                                    setSuccess('Address copied!');
                                                }
                                            }}
                                            className="p-4 bg-accent-50 dark:bg-accent-900/20 rounded-2xl hover:bg-accent-100 transition-all group"
                                        >
                                            <Copy className="w-6 h-6 text-accent-600 group-hover:scale-110 transition-transform" />
                                        </button>
                                    </div>
                                    {depositDetails.memo && (
                                        <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/10 rounded-3xl border border-red-200 dark:border-red-800">
                                            <p className="text-xs font-black text-red-600 mb-2 uppercase">Memo Required</p>
                                            <p className="font-mono font-black text-gray-900 dark:text-white text-lg">{depositDetails.memo}</p>
                                        </div>
                                    )}
                                    <div className="mt-8 flex items-start gap-3 text-left p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl border border-orange-100">
                                          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                                          <p className="text-[11px] text-orange-800 dark:text-orange-300 font-medium leading-relaxed uppercase">
                                              Only send {depositCoin} via {depositNetwork} network. incorrect network usage will result in permanent loss of funds.
                                          </p>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleFetchDepositAddress}
                                    disabled={!depositNetwork || fetchingDeposit}
                                    className="w-full py-6 bg-accent-600 hover:bg-accent-700 text-white font-black text-lg rounded-3xl shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-4"
                                >
                                    {fetchingDeposit ? <RefreshCw className="w-8 h-8 animate-spin" /> : <><QrCode className="w-6 h-6" /> Generate Wallet Address</>}
                                </button>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'withdraw' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 shadow-2xl border border-gray-100 dark:border-gray-700"
                        >
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">Withdraw Crypto</h2>
                            <p className="text-gray-500 font-medium mb-10 leading-relaxed">Securely transfer your assets to an external blockchain address.</p>

                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Currency</label>
                                        <select
                                            value={withdrawCoin}
                                            onChange={(e) => setWithdrawCoin(e.target.value)}
                                            className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold"
                                        >
                                            {(assets.crypto.length > 0 ? assets.crypto : [{code: 'USDT', name: 'Tether'}]).map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Blockchain Network</label>
                                        <select
                                            value={withdrawNetwork}
                                            onChange={(e) => setWithdrawNetwork(e.target.value)}
                                            className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold"
                                        >
                                            <option value="">Select Network</option>
                                            {(selectedWithdrawCoinConfig?.networkList || selectedWithdrawCoinConfig?.networks)?.map(n => (
                                                <option key={n.network} value={n.network}>{n.name || n.network} (Fee: {n.withdrawFee})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Recipient Address</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Blockchain address"
                                            value={withdrawAddress}
                                            onChange={(e) => setWithdrawAddress(e.target.value)}
                                            className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-mono font-bold"
                                        />
                                        <button className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-accent-50 dark:bg-accent-900/20 rounded-xl text-[10px] font-black text-accent-600 uppercase" onClick={async () => setWithdrawAddress(await navigator.clipboard.readText())}>Paste</button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Amount to Send</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={withdrawAmount}
                                            onChange={(e) => {
                                                setWithdrawAmount(e.target.value);
                                                if (withdrawFee && parseFloat(e.target.value) > 0) {
                                                    const net = parseFloat(e.target.value) - withdrawFee;
                                                    setWithdrawReceiveAmount(net > 0 ? net.toFixed(6) : '0.00');
                                                } else {
                                                    setWithdrawReceiveAmount('');
                                                }
                                            }}
                                            className="w-full px-6 py-5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white text-2xl font-black"
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-gray-400">{withdrawCoin}</div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 px-2">
                                         <button 
                                            onClick={() => {
                                                const balance = wallets.find(w => w.currency === withdrawCoin)?.balance || 0;
                                                setWithdrawAmount(balance);
                                                if (withdrawFee) {
                                                    const net = parseFloat(balance) - withdrawFee;
                                                    setWithdrawReceiveAmount(net > 0 ? net.toFixed(6) : '0.00');
                                                }
                                            }} 
                                            className="text-[10px] font-black text-accent-600 uppercase tracking-widest pr-2 hover:text-accent-700"
                                        >
                                            Use Max Balance
                                        </button>
                                        {withdrawFee !== null && (
                                            <span className="text-[10px] font-bold text-gray-500">
                                                Fee: {fetchingFee ? '...' : withdrawFee} {withdrawCoin}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Receive Amount Display */}
                                {withdrawReceiveAmount && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-2xl">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Recipient Receives:</span>
                                            <span className="text-xl font-black text-green-600">
                                                {withdrawReceiveAmount} {withdrawCoin}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {(selectedWithdrawCoinConfig?.networks || selectedWithdrawCoinConfig?.networkList)?.find(n => n.network === withdrawNetwork)?.memo && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-red-500 uppercase tracking-widest px-1">Network Memo (Required)</label>
                                        <input
                                            type="text"
                                            value={withdrawMemo}
                                            onChange={(e) => setWithdrawMemo(e.target.value)}
                                            className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900 border border-red-200 dark:border-red-900 rounded-2xl focus:ring-4 focus:ring-red-500/10 focus:border-red-500 focus:outline-none dark:text-white font-bold"
                                        />
                                    </div>
                                )}

                                <div className="p-6 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-3xl flex gap-4">
                                    <ShieldCheck className="w-8 h-8 text-orange-600 flex-shrink-0" />
                                    <div className="text-xs text-orange-800 dark:text-orange-300 leading-relaxed font-medium uppercase">
                                        Please verify the address and network carefully. Blockchain transactions are final and cannot be reversed or cancelled.
                                        Withdrawals are typically processed within 5-15 minutes.
                                    </div>
                                </div>

                                <button
                                    onClick={handleWithdraw}
                                    disabled={loading || !withdrawAmount || !withdrawAddress || !withdrawNetwork}
                                    className="w-full py-6 bg-accent-600 hover:bg-accent-700 text-white font-black text-lg rounded-3xl shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-4"
                                >
                                    {loading ? <RefreshCw className="w-8 h-8 animate-spin" /> : 'Confirm Withdrawal'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Sidebar - Portfolio & Activity (Hidden in Order Book Tab) */}
                {activeTab !== 'order-book' && (
                    <div className="space-y-8">
                        <div className="bg-accent-600 p-10 rounded-[3rem] text-white shadow-2xl shadow-accent-500/30 relative overflow-hidden group">
                            <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full group-hover:scale-125 transition-transform duration-500" />
                            <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                                <Wallet className="w-6 h-6" /> Portfolio
                            </h3>
                            <div className="space-y-6">
                                {wallets.length > 0 ? (
                                    wallets.filter(w => w.balance > 0).slice(0, 5).map(w => (
                                        <div key={w.id} className="flex justify-between items-center group/item">
                                            <div className="flex items-center gap-4">
                                                <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black group-hover/item:scale-110 transition-transform">{w.currency}</span>
                                                <span className="font-bold">{w.currency}</span>
                                            </div>
                                            <span className="font-black text-lg">{Number(w.balance).toLocaleString()}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-10 text-center opacity-60">
                                        <p className="text-sm font-bold">No assets found</p>
                                    </div>
                                )}
                            </div>
                            <button className="w-full mt-10 py-4 bg-white/20 hover:bg-white/30 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">Go to Wallets</button>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">Recent Hub Activity</h3>
                            <div className="space-y-8">
                                {history.length > 0 ? (
                                    history.map((tx, i) => (
                                        <div key={i} className="flex items-center gap-5 group">
                                            <div className={`p-3 rounded-2xl shadow-sm group-hover:scale-110 transition-transform ${tx.type === 'buy' || tx.type === 'deposit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                {tx.type === 'buy' || tx.type === 'deposit' ? <ArrowDown className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-gray-900 dark:text-white truncate uppercase tracking-tighter">{tx.type} {tx.to_currency || tx.currency || tx.coin}</p>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date(tx.created_at || tx.timestamp).toLocaleDateString()}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-gray-900 dark:text-white">{Number(tx.amount || tx.from_amount).toLocaleString()}</p>
                                                <p className="text-[9px] font-black text-accent-600 uppercase bg-accent-50 dark:bg-accent-900/20 px-2 py-0.5 rounded-full inline-block">{tx.status}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10">
                                        <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                        <p className="text-sm font-bold text-gray-400 italic">No activity recorded</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Asset Selection Modal */}
            <AnimatePresence>
                {showTokenModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowTokenModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-[3rem] shadow-2xl p-10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Select Asset</h3>
                                <button onClick={() => setShowTokenModal(false)} className="p-3 bg-gray-100 dark:bg-gray-900 rounded-2xl hover:scale-110 transition-all">
                                    <X className="w-6 h-6 text-gray-500" />
                                </button>
                            </div>

                            <div className="relative mb-8">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search by name or symbol"
                                    className="w-full pl-16 pr-6 py-6 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-[2rem] focus:ring-4 focus:ring-accent-500/10 focus:border-accent-500 focus:outline-none dark:text-white font-bold"
                                />
                            </div>

                            <div className="max-h-[450px] overflow-y-auto space-y-4 pr-3 custom-scrollbar">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-6 mb-4">Fiat Currencies</p>
                                {assets.fiat.filter(t => t.code.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(token => (
                                    <button
                                        key={token.code}
                                        onClick={() => {
                                            if (tokenModalSide === 'from') setFromAsset({ type: 'fiat', code: token.code });
                                            else setToAsset({ type: 'fiat', code: token.code });
                                            setShowTokenModal(false);
                                            setSearchTerm('');
                                        }}
                                        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-[2rem] transition-all group border border-transparent hover:border-accent-100"
                                    >
                                        <div className="flex items-center gap-6">
                                            <span className="w-16 h-16 bg-white dark:bg-gray-900 rounded-full shadow-lg flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">{GET_FLAG(token.code)}</span>
                                            <div className="text-left">
                                                <div className="font-black text-xl text-gray-900 dark:text-white">{token.code}</div>
                                                <div className="text-xs font-bold text-gray-400 uppercase">{token.name}</div>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-6 h-6 text-gray-300 group-hover:text-accent-500 group-hover:translate-x-2 transition-all" />
                                    </button>
                                ))}
                                <div className="h-6" />
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-6 mb-4">Cryptocurrencies</p>
                                {assets.crypto.filter(t => t.code.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(token => (
                                    <button
                                        key={token.code}
                                        onClick={() => {
                                            if (tokenModalSide === 'from') setFromAsset({ type: 'crypto', code: token.code });
                                            else setToAsset({ type: 'crypto', code: token.code });
                                            setShowTokenModal(false);
                                            setSearchTerm('');
                                        }}
                                        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-[2rem] transition-all group border border-transparent hover:border-accent-100"
                                    >
                                        <div className="flex items-center gap-6">
                                            <span className="w-16 h-16 bg-white dark:bg-gray-900 rounded-full shadow-lg flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">{GET_FLAG(token.code)}</span>
                                            <div className="text-left">
                                                <div className="font-black text-xl text-gray-900 dark:text-white">{token.code}</div>
                                                <div className="text-xs font-bold text-gray-400 uppercase">{token.name}</div>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-6 h-6 text-gray-300 group-hover:text-accent-500 group-hover:translate-x-2 transition-all" />
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Chat Floating Icon */}
            <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
                className="fixed bottom-10 right-10 w-16 h-16 bg-accent-600 text-white rounded-full shadow-2xl shadow-accent-500/40 flex items-center justify-center z-[100] group"
                onClick={() => alert("Chat Support Coming Soon!")}
            >
                <MessageCircle className="w-8 h-8 group-hover:animate-bounce" />
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
            </motion.button>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 20px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; }
            `}</style>
        </div>
    );
};

export default Exchange;
