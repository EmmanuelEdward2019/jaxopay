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
    ShieldCheck
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import walletService from '../../services/walletService';
import { formatCurrency } from '../../utils/formatters';

const ASSETS = {
    fiat: [
        { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
        { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
        { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
        { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
        { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭' },
        { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
        { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
    ],
    crypto: [
        { code: 'BTC', name: 'Bitcoin', symbol: '₿', flag: '🪙' },
        { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', flag: '🪙' },
        { code: 'USDT', name: 'Tether', symbol: '₮', flag: '🪙' },
        { code: 'USDC', name: 'USD Coin', symbol: '$', flag: '🪙' },
        { code: 'BNB', name: 'Binance Coin', symbol: 'BNB', flag: '🪙' },
        { code: 'SOL', name: 'Solana', symbol: 'SOL', flag: '🪙' },
    ]
};

const Exchange = () => {
    const [activeTab, setActiveTab] = useState('exchange'); // 'exchange' | 'deposit' | 'withdraw'
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
        fetchConfig();
    }, []);

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            setWallets(Array.isArray(result.data) ? result.data : (result.data?.wallets || []));
        }
    };

    const fetchConfig = async () => {
        const result = await cryptoService.getConfig();
        if (result.success) {
            setCryptoConfig(result.data);
            // Set default networks if available
            const usdtConfig = result.data.find(c => c.coin === 'USDT');
            if (usdtConfig && usdtConfig.networks.length > 0) {
                setDepositNetwork(usdtConfig.networks[0].network);
                setWithdrawNetwork(usdtConfig.networks[0].network);
            }
        }
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
        if (!payAmount || parseFloat(payAmount) <= 0) return;
        setLoading(true);
        setError(null);
        setSuccess(null);

        let result;
        const amount = parseFloat(payAmount);

        if (fromAsset.type === 'fiat' && toAsset.type === 'crypto') {
            const wallet = wallets.find(w => w.currency === fromAsset.code && w.wallet_type === 'fiat');
            result = await cryptoService.buyCrypto(toAsset.code, amount, fromAsset.code, wallet?.id);
        } else if (fromAsset.type === 'crypto' && toAsset.type === 'fiat') {
            const wallet = wallets.find(w => w.currency === toAsset.code && w.wallet_type === 'fiat');
            result = await cryptoService.sellCrypto(fromAsset.code, amount, toAsset.code, wallet?.id);
        } else if (fromAsset.type === 'crypto' && toAsset.type === 'crypto') {
            result = await cryptoService.swap({ from_coin: fromAsset.code, to_coin: toAsset.code, amount });
        } else if (fromAsset.type === 'fiat' && toAsset.type === 'fiat') {
            result = await fxService.swap(fromAsset.code, toAsset.code, amount);
        } else {
            setError("Exchange combination not supported");
            setLoading(false);
            return;
        }

        if (result.success) {
            setSuccess(`Exchange completed!`);
            setPayAmount('');
            setReceiveAmount('');
            setRates(null);
            fetchWallets();
            fetchHistory();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const handleFetchDepositAddress = async () => {
        if (!depositCoin || !depositNetwork) return;
        setFetchingDeposit(true);
        setDepositDetails(null);
        const result = await cryptoService.getDepositAddress(depositCoin, depositNetwork);
        if (result.success) {
            setDepositDetails(result.data);
        } else {
            setError(result.error || 'Failed to fetch deposit address');
        }
        setFetchingDeposit(false);
    };

    const handleWithdraw = async () => {
        if (!withdrawAddress || !withdrawAmount || !withdrawNetwork) return;
        setLoading(true);
        setError(null);
        setSuccess(null);

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
            fetchWallets();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const selectedDepositCoinConfig = cryptoConfig?.find(c => c.coin === depositCoin);
    const selectedWithdrawCoinConfig = cryptoConfig?.find(c => c.coin === withdrawCoin);

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Crypto Hub</h1>
                    <p className="text-gray-600 dark:text-gray-400">Manage, exchange, and transfer your digital assets.</p>
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                    {['exchange', 'deposit', 'withdraw'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab
                                ? 'bg-white dark:bg-gray-700 text-accent-600 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-300"
                >
                    <AlertCircle className="w-5 h-5" />
                    <p className="font-medium">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-sm font-bold">Close</button>
                </motion.div>
            )}

            {success && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3 text-green-600 dark:text-green-300"
                >
                    <Check className="w-5 h-5" />
                    <p className="font-medium">{success}</p>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-sm font-bold">Close</button>
                </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {activeTab === 'exchange' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="bg-white dark:bg-gray-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-gray-700 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-50 dark:bg-accent-900/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Exchange Assets</h2>
                                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                    <Settings className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Pay In Section */}
                            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700 mb-2">
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-500">You Pay</span>
                                    <span className="text-sm font-medium text-gray-500">
                                        Bal: {formatCurrency(wallets.find(w => w.currency === fromAsset.code)?.balance || 0, fromAsset.code)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)}
                                        className="bg-transparent text-3xl font-bold text-gray-900 dark:text-white focus:outline-none w-full"
                                    />
                                    <button
                                        onClick={() => { setTokenModalSide('from'); setShowTokenModal(true); }}
                                        className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-accent-500 transition-all shrink-0"
                                    >
                                        <span className="text-xl">{ASSETS[fromAsset.type].find(a => a.code === fromAsset.code)?.flag}</span>
                                        <span className="font-bold text-gray-900 dark:text-white">{fromAsset.code}</span>
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            </div>

                            {/* Swap Divider */}
                            <div className="flex justify-center -my-3 relative z-10">
                                <button
                                    onClick={() => {
                                        const temp = fromAsset;
                                        setFromAsset(toAsset);
                                        setToAsset(temp);
                                        setPayAmount(receiveAmount);
                                    }}
                                    className="p-3 bg-accent-600 text-white rounded-full shadow-lg hover:rotate-180 transition-all duration-300 ring-4 ring-white dark:ring-gray-800"
                                >
                                    <ArrowDown className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Receive Section */}
                            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700 mt-2 mb-6">
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-500">You Receive</span>
                                    <span className="text-sm font-medium text-gray-500">
                                        Bal: {formatCurrency(wallets.find(w => w.currency === toAsset.code)?.balance || 0, toAsset.code)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="text"
                                        placeholder="0.00"
                                        value={receiveAmount}
                                        readOnly
                                        className="bg-transparent text-3xl font-bold text-gray-900 dark:text-white focus:outline-none w-full"
                                    />
                                    <button
                                        onClick={() => { setTokenModalSide('to'); setShowTokenModal(true); }}
                                        className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-accent-500 transition-all shrink-0"
                                    >
                                        <span className="text-xl">{ASSETS[toAsset.type].find(a => a.code === toAsset.code)?.flag}</span>
                                        <span className="font-bold text-gray-900 dark:text-white">{toAsset.code}</span>
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            </div>

                            {rates && (
                                <div className="mb-6 p-4 bg-accent-50 dark:bg-accent-900/10 rounded-xl border border-accent-100 dark:border-accent-800/30">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <RefreshCw className={`w-4 h-4 ${loadingRates ? 'animate-spin' : ''}`} />
                                            <span>Exchange Rate</span>
                                        </div>
                                        <div className="text-xs font-bold text-accent-600 px-2 py-0.5 bg-white dark:bg-gray-800 rounded-full border border-accent-100">
                                            Expires in {quoteExpiry}s
                                        </div>
                                    </div>
                                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                                        1 {fromAsset.code} = {rates.rate?.toFixed(toAsset.type === 'crypto' ? 8 : 4)} {toAsset.code}
                                    </p>
                                </div>
                            )}

                            <button
                                onClick={handleExchange}
                                disabled={loading || !payAmount || parseFloat(payAmount) <= 0 || loadingRates}
                                className="w-full py-5 bg-accent-600 hover:bg-accent-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-accent-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : 'Confirm Exchange'}
                            </button>
                        </motion.div>
                    )}

                    {activeTab === 'deposit' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="bg-white dark:bg-gray-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-gray-700"
                        >
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Deposit Crypto</h2>
                            <p className="text-gray-500 text-sm mb-8">Receive crypto from any external wallet. Select your asset and preferred network below.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Currency</label>
                                    <select
                                        value={depositCoin}
                                        onChange={(e) => setDepositCoin(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white"
                                    >
                                        {ASSETS.crypto.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Network</label>
                                    <select
                                        value={depositNetwork}
                                        onChange={(e) => setDepositNetwork(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white"
                                    >
                                        <option value="">Select Network</option>
                                        {selectedDepositCoinConfig?.networkList?.map(n => (
                                            <option key={n.network} value={n.network}>{n.network} ({n.network})</option>
                                        )) || selectedDepositCoinConfig?.networks?.map(n => (
                                            <option key={n.network} value={n.network}>{n.network}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {depositDetails ? (
                                <div className="p-8 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-dashed border-accent-200 dark:border-accent-800 text-center animate-in fade-in zoom-in">
                                    <div className="inline-block bg-white p-4 rounded-2xl shadow-sm mb-6">
                                        <QrCode className="w-32 h-32 text-gray-900" />
                                    </div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Your {depositCoin} Address</p>
                                    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 mb-6">
                                        <code className="text-sm font-mono text-gray-900 dark:text-white break-all flex-1">{depositDetails.address}</code>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(depositDetails.address);
                                                setSuccess('Address copied!');
                                            }}
                                            className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                                        >
                                            <Copy className="w-5 h-5 text-accent-600" />
                                        </button>
                                    </div>
                                    {depositDetails.memo && (
                                        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
                                            <p className="text-xs font-bold text-red-600 mb-1">MEMO REQUIRED:</p>
                                            <p className="font-mono text-gray-900 dark:text-white">{depositDetails.memo}</p>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-red-500 mt-4 leading-tight italic">
                                        ⚠️ Only send {depositCoin} via {depositNetwork} network. Other coins or networks will be lost.
                                    </p>
                                </div>
                            ) : (
                                <button
                                    onClick={handleFetchDepositAddress}
                                    disabled={!depositNetwork || fetchingDeposit}
                                    className="w-full py-5 bg-accent-600 hover:bg-accent-700 text-white font-black rounded-2xl shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {fetchingDeposit ? <RefreshCw className="w-6 h-6 animate-spin" /> : 'Generate Secure Address'}
                                </button>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'withdraw' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="bg-white dark:bg-gray-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-gray-700"
                        >
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Withdraw Crypto</h2>

                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Currency</label>
                                        <select
                                            value={withdrawCoin}
                                            onChange={(e) => setWithdrawCoin(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white"
                                        >
                                            {ASSETS.crypto.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Network</label>
                                        <select
                                            value={withdrawNetwork}
                                            onChange={(e) => setWithdrawNetwork(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white"
                                        >
                                            <option value="">Select Network</option>
                                            {selectedWithdrawCoinConfig?.networkList?.map(n => (
                                                <option key={n.network} value={n.network}>{n.network} (Fee: {n.withdrawFee})</option>
                                            )) || selectedWithdrawCoinConfig?.networks?.map(n => (
                                                <option key={n.network} value={n.network}>{n.network}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recipient Address</label>
                                    <input
                                        type="text"
                                        placeholder="Paste address here"
                                        value={withdrawAddress}
                                        onChange={(e) => setWithdrawAddress(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={withdrawAmount}
                                            onChange={(e) => setWithdrawAmount(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white text-lg font-bold"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{withdrawCoin}</div>
                                    </div>
                                </div>

                                {selectedWithdrawCoinConfig?.networks.find(n => n.network === withdrawNetwork)?.memo && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Memo (Required for this network)</label>
                                        <input
                                            type="text"
                                            value={withdrawMemo}
                                            onChange={(e) => setWithdrawMemo(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white"
                                        />
                                    </div>
                                )}

                                <div className="p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-2xl">
                                    <div className="flex gap-3">
                                        <ShieldCheck className="w-6 h-6 text-orange-600 shrink-0" />
                                        <div className="text-xs text-orange-800 dark:text-orange-300 leading-normal">
                                            Please verify the address and network carefully. Crypto transactions are irreversible.
                                            Withdrawals are processed within 5-15 minutes.
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleWithdraw}
                                    disabled={loading || !withdrawAmount || !withdrawAddress || !withdrawNetwork}
                                    className="w-full py-5 bg-accent-600 hover:bg-accent-700 text-white font-black rounded-2xl shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : 'Initiate Withdrawal'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <div className="card bg-accent-600 text-white p-8 rounded-[2rem] border-none shadow-xl shadow-accent-500/20 relative overflow-hidden">
                        <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/10 rounded-full" />
                        <h3 className="font-bold mb-4 flex items-center gap-2">
                            <Wallet className="w-5 h-5" /> Portfolio
                        </h3>
                        <div className="space-y-4">
                            {wallets.length > 0 ? (
                                wallets.filter(w => w.balance > 0).slice(0, 4).map(w => (
                                    <div key={w.id} className="flex justify-between items-center group cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">{w.currency}</span>
                                            <span className="text-sm font-medium">{w.currency}</span>
                                        </div>
                                        <span className="text-sm font-bold">{Number(w.balance).toLocaleString()}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm opacity-80">No balances to display</p>
                            )}
                        </div>
                        <button className="w-full mt-6 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-all">View All Assets</button>
                    </div>

                    <div className="card p-8 rounded-[2rem]">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-6">Recent Hub Activity</h3>
                        <div className="space-y-6">
                            {history.length > 0 ? (
                                history.map((tx, i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <div className={`p-2 rounded-full ${tx.type === 'buy' || tx.type === 'deposit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                            {tx.type === 'buy' || tx.type === 'deposit' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate uppercase">{tx.type} {tx.to_currency || tx.currency || tx.coin}</p>
                                            <p className="text-xs text-gray-500">{new Date(tx.created_at || tx.timestamp).toLocaleDateString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-gray-900 dark:text-white">{Number(tx.amount || tx.from_amount).toFixed(2)}</p>
                                            <p className="text-[10px] font-bold text-accent-600 uppercase">{tx.status}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-6 text-gray-400">
                                    <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">No activity records</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
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
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl p-8 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Select Asset</h3>
                                <button onClick={() => setShowTokenModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                                    <X className="w-6 h-6 text-gray-500" />
                                </button>
                            </div>

                            <div className="relative mb-6">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search by name or symbol"
                                    className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-accent-500 focus:outline-none dark:text-white"
                                />
                            </div>

                            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-4 mb-2">Fiat Currencies</p>
                                {ASSETS.fiat.filter(t => t.code.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(token => (
                                    <button
                                        key={token.code}
                                        onClick={() => {
                                            if (tokenModalSide === 'from') setFromAsset({ type: 'fiat', code: token.code });
                                            else setToAsset({ type: 'fiat', code: token.code });
                                            setShowTokenModal(false);
                                            setSearchTerm('');
                                        }}
                                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-2xl transition-all group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className="w-12 h-12 bg-white dark:bg-gray-900 rounded-full shadow-sm flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{token.flag}</span>
                                            <div className="text-left">
                                                <div className="font-black text-gray-900 dark:text-white">{token.code}</div>
                                                <div className="text-xs text-gray-500">{token.name}</div>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-accent-500 transition-colors" />
                                    </button>
                                ))}
                                <div className="h-4" />
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-4 mb-2">Cryptocurrencies</p>
                                {ASSETS.crypto.filter(t => t.code.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(token => (
                                    <button
                                        key={token.code}
                                        onClick={() => {
                                            if (tokenModalSide === 'from') setFromAsset({ type: 'crypto', code: token.code });
                                            else setToAsset({ type: 'crypto', code: token.code });
                                            setShowTokenModal(false);
                                            setSearchTerm('');
                                        }}
                                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-2xl transition-all group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className="w-12 h-12 bg-white dark:bg-gray-900 rounded-full shadow-sm flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{token.flag}</span>
                                            <div className="text-left">
                                                <div className="font-black text-gray-900 dark:text-white">{token.code}</div>
                                                <div className="text-xs text-gray-500">{token.name}</div>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-accent-500 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 20px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; }
            `}</style>
        </div>
    );
};

export default Exchange;
