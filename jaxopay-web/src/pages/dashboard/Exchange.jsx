import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeftRight,
    TrendingUp,
    TrendingDown,
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
    Settings
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import walletService from '../../services/walletService';
import { formatCurrency } from '../../utils/formatters';

const CRYPTO_DATA = {
    BTC: { name: 'Bitcoin', symbol: 'BTC', color: 'bg-orange-500', icon: '₿' },
    ETH: { name: 'Ethereum', symbol: 'ETH', color: 'bg-blue-500', icon: 'Ξ' },
    USDT: { name: 'Tether', symbol: 'USDT', color: 'bg-green-500', icon: '₮' },
    USDC: { name: 'USD Coin', symbol: 'USDC', color: 'bg-blue-400', icon: '$' },
};

const Exchange = () => {
    const [mode, setMode] = useState('buy'); // 'buy' or 'sell'
    const [wallets, setWallets] = useState([]);
    const [cryptoWallets, setCryptoWallets] = useState([]);
    const [selectedFiatWallet, setSelectedFiatWallet] = useState('');
    const [selectedCrypto, setSelectedCrypto] = useState('BTC');

    // Amounts
    const [payAmount, setPayAmount] = useState('');
    const [receiveAmount, setReceiveAmount] = useState('');

    // Logic
    const [rates, setRates] = useState(null);
    const [loadingRates, setLoadingRates] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [history, setHistory] = useState([]);

    // UI
    const [showTokenModal, setShowTokenModal] = useState(false);
    const [tokenModalType, setTokenModalType] = useState('crypto'); // 'crypto' or 'fiat'
    const [showSettings, setShowSettings] = useState(false);
    const [slippage, setSlippage] = useState(0.5);
    const [deadline, setDeadline] = useState(20);
    const searchInputRef = useRef(null);

    // Debounce for rate fetching
    useEffect(() => {
        const timer = setTimeout(() => {
            if (payAmount && parseFloat(payAmount) > 0) {
                fetchRates();
            } else {
                setReceiveAmount('');
                setRates(null);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [payAmount, selectedCrypto, selectedFiatWallet, mode]);

    useEffect(() => {
        fetchWallets();
        fetchHistory();
    }, []);

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            const allWallets = Array.isArray(result.data) ? result.data : (result.data?.wallets || []);
            setWallets(allWallets.filter(w => w.wallet_type === 'fiat' && w.status !== 'frozen'));
            setCryptoWallets(allWallets.filter(w => w.wallet_type === 'crypto'));
            if (allWallets.length > 0 && !selectedFiatWallet) {
                const usdWallet = allWallets.find(w => w.currency === 'USD');
                setSelectedFiatWallet(usdWallet?.id || allWallets[0].id);
            }
        }
    };

    const fetchRates = async () => {
        setLoadingRates(true);
        const wallet = wallets.find(w => w.id === selectedFiatWallet);
        if (!wallet) return;

        const from = mode === 'buy' ? wallet.currency : selectedCrypto;
        const to = mode === 'buy' ? selectedCrypto : wallet.currency;

        const result = await cryptoService.getExchangeRates(from, to, parseFloat(payAmount));

        if (result.success) {
            setRates(result.data);
            setReceiveAmount(result.data.converted_amount ? Number(result.data.converted_amount).toFixed(mode === 'buy' ? 6 : 2) : '');
        }
        setLoadingRates(false);
    };

    const fetchHistory = async () => {
        const result = await cryptoService.getCryptoHistory({ limit: 5 });
        if (result.success) {
            setHistory(result.data.transactions || []);
        }
    };

    const handleExchange = async () => {
        if (!payAmount || parseFloat(payAmount) <= 0 || !selectedFiatWallet) return;
        setLoading(true);
        setError(null);
        setSuccess(null);

        const wallet = wallets.find(w => w.id === selectedFiatWallet);
        let result;

        if (mode === 'buy') {
            result = await cryptoService.buyCrypto(
                selectedCrypto,
                parseFloat(payAmount),
                wallet?.currency,
                selectedFiatWallet
            );
        } else {
            result = await cryptoService.sellCrypto(
                selectedCrypto,
                parseFloat(payAmount),
                wallet?.currency,
                selectedFiatWallet
            );
        }

        if (result.success) {
            setSuccess(`Successfully ${mode === 'buy' ? 'purchased' : 'sold'} ${selectedCrypto}!`);
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

    const handleMax = () => {
        const wallet = mode === 'buy'
            ? wallets.find(w => w.id === selectedFiatWallet)
            : cryptoWallets.find(w => w.currency === selectedCrypto);

        if (wallet) {
            setPayAmount(wallet.balance.toString());
        }
    };

    const selectedWallet = wallets.find(w => w.id === selectedFiatWallet);
    const cryptoWallet = cryptoWallets.find(w => w.currency === selectedCrypto);

    const getBalance = (isPay) => {
        if (mode === 'buy') {
            return isPay
                ? formatCurrency(selectedWallet?.balance || 0, selectedWallet?.currency)
                : `${Number(cryptoWallet?.balance || 0).toFixed(6)} ${selectedCrypto}`;
        } else {
            return isPay
                ? `${Number(cryptoWallet?.balance || 0).toFixed(6)} ${selectedCrypto}`
                : formatCurrency(selectedWallet?.balance || 0, selectedWallet?.currency);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Exchange</h1>
                    <p className="text-gray-600 dark:text-gray-400">Swap assets instantly with zero slippage</p>
                </div>
                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <button
                        onClick={() => { setMode('buy'); setPayAmount(''); setReceiveAmount(''); }}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'buy'
                            ? 'bg-white dark:bg-gray-700 text-accent-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                            }`}
                    >
                        Buy
                    </button>
                    <button
                        onClick={() => { setMode('sell'); setPayAmount(''); setReceiveAmount(''); }}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'sell'
                            ? 'bg-white dark:bg-gray-700 text-red-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                            }`}
                    >
                        Sell
                    </button>
                </div>
            </div>

            {/* Custom Alert */}
            <AnimatePresence>
                {(error || success) && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-4 rounded-xl flex items-start gap-3 ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}
                    >
                        {error ? <AlertCircle className="w-5 h-5 shrink-0" /> : <Check className="w-5 h-5 shrink-0" />}
                        <div className="flex-1">
                            <p className="font-medium">{error ? 'Transaction Failed' : 'Success'}</p>
                            <p className="text-sm opacity-90">{error || success}</p>
                        </div>
                        <button onClick={() => { setError(null); setSuccess(null); }} className="p-1 hover:bg-black/5 rounded">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Swap Interface */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden">
                        {/* Settings Icon */}
                        <div className="absolute top-4 right-4 z-10">
                            <button
                                onClick={() => setShowSettings(true)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Pay Section */}
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border border-transparent focus-within:border-accent-500/50 focus-within:ring-2 focus-within:ring-accent-500/20">
                                <div className="flex justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">You Pay</label>
                                    <div className="flex items-center gap-2">
                                        <Wallet className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="text-xs text-gray-500 font-medium">
                                            {getBalance(true)}
                                        </span>
                                        <button
                                            onClick={handleMax}
                                            className="text-xs font-bold text-accent-600 hover:text-accent-700 px-1.5 py-0.5 bg-accent-50 dark:bg-accent-900/20 rounded uppercase transition-colors"
                                        >
                                            Max
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="number"
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-transparent text-3xl font-bold text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none"
                                    />
                                    {mode === 'buy' ? (
                                        <button
                                            onClick={() => { setTokenModalType('fiat'); setShowTokenModal(true); }}
                                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 hover:border-accent-500 hover:ring-2 hover:ring-accent-100 dark:hover:ring-accent-900/20 transition-all min-w-[140px]"
                                        >
                                            {selectedWallet ? (
                                                <>
                                                    <span className="text-xl">{CURRENCY_OPTIONS.fiat.find(c => c.code === selectedWallet.currency)?.flag || '💰'}</span>
                                                    <span className="font-bold text-gray-900 dark:text-white">{selectedWallet.currency}</span>
                                                    <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-bold text-gray-500">Select</span>
                                                    <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setTokenModalType('crypto'); setShowTokenModal(true); }}
                                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 hover:border-accent-500 hover:ring-2 hover:ring-accent-100 dark:hover:ring-accent-900/20 transition-all min-w-[140px]"
                                        >
                                            <span className="text-xl">{CRYPTO_DATA[selectedCrypto]?.icon}</span>
                                            <span className="font-bold text-gray-900 dark:text-white">{selectedCrypto}</span>
                                            <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Swap Divider */}
                        <div className="relative h-2 my-2">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-8 h-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-600 shadow-sm flex items-center justify-center z-10 transition-transform hover:rotate-180 duration-500 cursor-pointer" onClick={() => {
                                    setMode(mode === 'buy' ? 'sell' : 'buy');
                                    setPayAmount('');
                                    setReceiveAmount('');
                                }}>
                                    <ArrowDown className="w-4 h-4 text-gray-500" />
                                </div>
                            </div>
                        </div>

                        {/* Receive Section */}
                        <div className="space-y-4 mb-6">
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                                <div className="flex justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">You Receive</label>
                                    {loadingRates && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="text"
                                        readOnly
                                        value={receiveAmount}
                                        placeholder="0.00"
                                        className="w-full bg-transparent text-3xl font-bold text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none cursor-default"
                                    />
                                    {mode === 'buy' ? (
                                        <button
                                            onClick={() => { setTokenModalType('crypto'); setShowTokenModal(true); }}
                                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 hover:border-accent-500 hover:ring-2 hover:ring-accent-100 dark:hover:ring-accent-900/20 transition-all min-w-[140px]"
                                        >
                                            <span className="text-xl">{CRYPTO_DATA[selectedCrypto]?.icon}</span>
                                            <span className="font-bold text-gray-900 dark:text-white">{selectedCrypto}</span>
                                            <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setTokenModalType('fiat'); setShowTokenModal(true); }}
                                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 hover:border-accent-500 hover:ring-2 hover:ring-accent-100 dark:hover:ring-accent-900/20 transition-all min-w-[140px]"
                                        >
                                            {selectedWallet ? (
                                                <>
                                                    <span className="text-xl">{CURRENCY_OPTIONS.fiat.find(c => c.code === selectedWallet.currency)?.flag || '💰'}</span>
                                                    <span className="font-bold text-gray-900 dark:text-white">{selectedWallet.currency}</span>
                                                    <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-bold text-gray-500">Select</span>
                                                    <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Fee Breakdown */}
                        {rates && (
                            <div className="mb-6 p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Rate</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        1 {selectedCrypto} = {formatCurrency(rates.rate, selectedWallet?.currency)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Network Fee</span>
                                    <span className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                        Low
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Action Button */}
                        <button
                            onClick={handleExchange}
                            disabled={!payAmount || parseFloat(payAmount) <= 0 || loading || loadingRates}
                            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none ${mode === 'buy'
                                ? 'bg-accent-600 hover:bg-accent-700 text-white shadow-accent-200 dark:shadow-none'
                                : 'bg-red-600 hover:bg-red-700 text-white shadow-red-200 dark:shadow-none'
                                }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <RefreshCw className="w-5 h-5 animate-spin" /> Processing...
                                </span>
                            ) : (
                                mode === 'buy' ? `Buy ${selectedCrypto}` : `Sell ${selectedCrypto}`
                            )}
                        </button>
                    </div>
                </div>

                {/* Sidebar: Recent Activity & Quick Stats */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Your Assets</h3>
                        {cryptoWallets.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No assets yet</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {cryptoWallets.map(w => (
                                    <button
                                        key={w.id}
                                        onClick={() => { setSelectedCrypto(w.currency); setMode('sell'); }}
                                        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg">
                                                {CRYPTO_DATA[w.currency]?.icon}
                                            </div>
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white">{w.currency}</p>
                                                <p className="text-xs text-gray-500">{CRYPTO_DATA[w.currency]?.name}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-gray-900 dark:text-white">{Number(w.balance || 0).toFixed(6)}</p>
                                            <p className="text-xs text-accent-600 opacity-0 group-hover:opacity-100 transition-opacity">Click to Sell</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-900 dark:text-white">Recent Trades</h3>
                            <button onClick={fetchHistory} className="text-accent-600 hover:text-accent-700">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            {history.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-4">No recent trades</p>
                            ) : (
                                history.map(trade => (
                                    <div key={trade.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${trade.type === 'buy' ? 'bg-accent-50 text-accent-600' : 'bg-red-50 text-red-600'}`}>
                                                {trade.type === 'buy' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {trade.type === 'buy' ? 'Bought' : 'Sold'} {trade.cryptocurrency}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(trade.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`text-sm font-bold ${trade.type === 'buy' ? 'text-accent-600' : 'text-gray-900 dark:text-white'}`}>
                                            {trade.type === 'buy' ? '+' : '-'}{Number(trade.crypto_amount || 0).toFixed(4)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Token Selection Modal */}
            <AnimatePresence>
                {showTokenModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowTokenModal(false)}>
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                <h3 className="font-bold text-lg dark:text-white">Select {tokenModalType === 'crypto' ? 'Token' : 'Wallet'}</h3>
                                <button onClick={() => setShowTokenModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            <div className="p-4">
                                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                                    {tokenModalType === 'crypto' ? (
                                        <>
                                            <p className="text-xs font-bold text-gray-500 uppercase px-2 mb-2">Popular Tokens</p>
                                            {Object.entries(CRYPTO_DATA).map(([code, data]) => (
                                                <button
                                                    key={code}
                                                    onClick={() => {
                                                        setSelectedCrypto(code);
                                                        setShowTokenModal(false);
                                                    }}
                                                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl">{data.icon}</span>
                                                        <div className="text-left">
                                                            <p className="font-bold text-gray-900 dark:text-white">{data.name}</p>
                                                            <p className="text-xs text-gray-500">{data.symbol}</p>
                                                        </div>
                                                    </div>
                                                    {cryptoWallets.find(w => w.currency === code) && (
                                                        <div className="text-right">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                                {Number(cryptoWallets.find(w => w.currency === code)?.balance || 0).toFixed(4)}
                                                            </p>
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-xs font-bold text-gray-500 uppercase px-2 mb-2">Your Wallets</p>
                                            {wallets.length === 0 ? (
                                                <div className="text-center py-8 text-gray-500">
                                                    <p>No fiat wallets found.</p>
                                                </div>
                                            ) : (
                                                wallets.map(wallet => (
                                                    <button
                                                        key={wallet.id}
                                                        onClick={() => {
                                                            setSelectedFiatWallet(wallet.id);
                                                            setShowTokenModal(false);
                                                        }}
                                                        className={`w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors group ${selectedFiatWallet === wallet.id ? 'bg-accent-50 dark:bg-accent-900/10 ring-1 ring-accent-500' : ''}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-2xl">{CURRENCY_OPTIONS.fiat.find(c => c.code === wallet.currency)?.flag || '💰'}</span>
                                                            <div className="text-left">
                                                                <p className="font-bold text-gray-900 dark:text-white">{wallet.currency} Wallet</p>
                                                                <p className="text-xs text-gray-500">{formatCurrency(wallet.balance, wallet.currency)}</p>
                                                            </div>
                                                        </div>
                                                        {selectedFiatWallet === wallet.id && (
                                                            <Check className="w-5 h-5 text-accent-600" />
                                                        )}
                                                    </button>
                                                ))
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-bold text-lg dark:text-white">Transaction Settings</h3>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Slippage Tolerance</p>
                                        <div className="group relative">
                                            <Info className="w-4 h-4 text-gray-400 cursor-help" />
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-900 text-white text-xs rounded shadow-lg w-48 hidden group-hover:block z-50">
                                                Your transaction will revert if the price changes unfavorably by more than this percentage.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[0.1, 0.5, 1.0].map((val) => (
                                            <button
                                                key={val}
                                                onClick={() => setSlippage(val)}
                                                className={`py-2 px-1 text-sm font-medium rounded-lg transition-colors ${slippage === val
                                                    ? 'bg-accent-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                            >
                                                {val}%
                                            </button>
                                        ))}
                                        <div className="relative">
                                            <input
                                                type="number"
                                                placeholder="Custom"
                                                value={!([0.1, 0.5, 1.0].includes(slippage)) ? slippage : ''}
                                                onChange={(e) => setSlippage(parseFloat(e.target.value))}
                                                className={`w-full py-2 px-2 text-sm text-center rounded-lg border focus:ring-2 focus:ring-accent-500 focus:outline-none ${!([0.1, 0.5, 1.0].includes(slippage))
                                                    ? 'border-accent-500 bg-white dark:bg-gray-800 text-accent-600'
                                                    : 'border-transparent bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                                    }`}
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">%</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Transaction Deadline</p>
                                        <div className="group relative">
                                            <Info className="w-4 h-4 text-gray-400 cursor-help" />
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-900 text-white text-xs rounded shadow-lg w-48 hidden group-hover:block z-50">
                                                Your transaction will revert if it is pending for more than this long.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            value={deadline}
                                            onChange={(e) => setDeadline(parseInt(e.target.value))}
                                            className="w-20 py-2 px-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-right focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-white"
                                        />
                                        <span className="text-gray-500 dark:text-gray-400">minutes</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const CURRENCY_OPTIONS = {
    fiat: [
        { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
        { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
        { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
        { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
        { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭' },
        { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
    ]
};

export default Exchange;
