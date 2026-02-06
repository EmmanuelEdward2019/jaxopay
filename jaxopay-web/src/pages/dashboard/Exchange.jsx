import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import walletService from '../../services/walletService';
import { formatCurrency, formatPercentage } from '../../utils/formatters';

const CRYPTO_DATA = {
    BTC: { name: 'Bitcoin', symbol: '₿', color: 'bg-orange-500', icon: '🪙' },
    ETH: { name: 'Ethereum', symbol: 'Ξ', color: 'bg-blue-500', icon: '🔷' },
    USDT: { name: 'Tether', symbol: '₮', color: 'bg-green-500', icon: '💵' },
    USDC: { name: 'USD Coin', symbol: '$', color: 'bg-blue-400', icon: '🔵' },
};

const Exchange = () => {
    const [mode, setMode] = useState('buy'); // 'buy' or 'sell'
    const [wallets, setWallets] = useState([]);
    const [cryptoWallets, setCryptoWallets] = useState([]);
    const [selectedFiatWallet, setSelectedFiatWallet] = useState('');
    const [selectedCrypto, setSelectedCrypto] = useState('BTC');
    const [amount, setAmount] = useState('');
    const [cryptoAmount, setCryptoAmount] = useState('');
    const [rates, setRates] = useState(null);
    const [loadingRates, setLoadingRates] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        fetchWallets();
        fetchHistory();
    }, []);

    useEffect(() => {
        if (amount && selectedCrypto && selectedFiatWallet) {
            fetchRates();
        }
    }, [amount, selectedCrypto, selectedFiatWallet, mode]);

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            const allWallets = result.data.wallets || [];
            setWallets(allWallets.filter(w => w.wallet_type === 'fiat' && w.status !== 'frozen'));
            setCryptoWallets(allWallets.filter(w => w.wallet_type === 'crypto'));
            if (allWallets.length > 0) {
                const usdWallet = allWallets.find(w => w.currency === 'USD');
                setSelectedFiatWallet(usdWallet?.id || allWallets[0].id);
            }
        }
    };

    const fetchRates = async () => {
        if (!amount || parseFloat(amount) <= 0) return;
        setLoadingRates(true);
        const wallet = wallets.find(w => w.id === selectedFiatWallet);
        const result = await cryptoService.getExchangeRates(
            mode === 'buy' ? wallet?.currency : selectedCrypto,
            mode === 'buy' ? selectedCrypto : wallet?.currency,
            parseFloat(amount)
        );
        if (result.success) {
            setRates(result.data);
            setCryptoAmount(result.data.converted_amount?.toFixed(8) || '');
        }
        setLoadingRates(false);
    };

    const fetchHistory = async () => {
        const result = await cryptoService.getCryptoHistory({ limit: 10 });
        if (result.success) {
            setHistory(result.data.transactions || []);
        }
    };

    const handleExchange = async () => {
        if (!amount || parseFloat(amount) <= 0 || !selectedFiatWallet) return;
        setLoading(true);
        setError(null);
        setSuccess(null);

        const wallet = wallets.find(w => w.id === selectedFiatWallet);
        let result;

        if (mode === 'buy') {
            result = await cryptoService.buyCrypto(
                selectedCrypto,
                parseFloat(amount),
                wallet?.currency,
                selectedFiatWallet
            );
        } else {
            result = await cryptoService.sellCrypto(
                selectedCrypto,
                parseFloat(amount),
                wallet?.currency,
                selectedFiatWallet
            );
        }

        if (result.success) {
            setSuccess(`Successfully ${mode === 'buy' ? 'purchased' : 'sold'} ${selectedCrypto}!`);
            setAmount('');
            setCryptoAmount('');
            setRates(null);
            fetchWallets();
            fetchHistory();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const selectedWallet = wallets.find(w => w.id === selectedFiatWallet);
    const cryptoWallet = cryptoWallets.find(w => w.currency === selectedCrypto);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Exchange</h1>
                <p className="text-gray-600 dark:text-gray-400">Buy and sell cryptocurrency instantly</p>
            </div>

            {/* Alerts */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-red-700 dark:text-red-300">{error}</p>
                        <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">Dismiss</button>
                    </div>
                </div>
            )}
            {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-green-700 dark:text-green-300">{success}</p>
                        <button onClick={() => setSuccess(null)} className="text-green-500 underline text-sm mt-1">Dismiss</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Exchange Form */}
                <div className="lg:col-span-2">
                    <div className="card">
                        {/* Mode Toggle */}
                        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg mb-6">
                            <button
                                onClick={() => setMode('buy')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${mode === 'buy' ? 'bg-green-500 text-white' : 'text-gray-600 dark:text-gray-400'
                                    }`}
                            >
                                <TrendingUp className="w-5 h-5" />
                                Buy Crypto
                            </button>
                            <button
                                onClick={() => setMode('sell')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${mode === 'sell' ? 'bg-red-500 text-white' : 'text-gray-600 dark:text-gray-400'
                                    }`}
                            >
                                <TrendingDown className="w-5 h-5" />
                                Sell Crypto
                            </button>
                        </div>

                        {/* Exchange Interface */}
                        <div className="space-y-4">
                            {/* From Currency */}
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-gray-500">{mode === 'buy' ? 'You Pay' : 'You Sell'}</span>
                                    {mode === 'buy' && selectedWallet && (
                                        <span className="text-sm text-gray-500">
                                            Balance: {formatCurrency(selectedWallet.balance || 0, selectedWallet.currency)}
                                        </span>
                                    )}
                                    {mode === 'sell' && cryptoWallet && (
                                        <span className="text-sm text-gray-500">
                                            Balance: {cryptoWallet.balance?.toFixed(8)} {selectedCrypto}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="flex-1 text-2xl font-bold bg-transparent border-none focus:outline-none text-gray-900 dark:text-white"
                                    />
                                    {mode === 'buy' ? (
                                        <select
                                            value={selectedFiatWallet}
                                            onChange={(e) => setSelectedFiatWallet(e.target.value)}
                                            className="px-4 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg font-medium"
                                        >
                                            {wallets.map((w) => (
                                                <option key={w.id} value={w.id}>{w.currency}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-600 rounded-lg">
                                            <span className="text-xl">{CRYPTO_DATA[selectedCrypto]?.icon}</span>
                                            <span className="font-medium">{selectedCrypto}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Swap Icon */}
                            <div className="flex justify-center -my-2 relative z-10">
                                <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-full">
                                    <ArrowLeftRight className="w-5 h-5 text-primary-600" />
                                </div>
                            </div>

                            {/* To Currency */}
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-gray-500">{mode === 'buy' ? 'You Receive' : 'You Get'}</span>
                                    {loadingRates && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
                                </div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="text"
                                        value={loadingRates ? '...' : cryptoAmount}
                                        readOnly
                                        placeholder="0.00"
                                        className="flex-1 text-2xl font-bold bg-transparent border-none focus:outline-none text-gray-900 dark:text-white"
                                    />
                                    {mode === 'buy' ? (
                                        <select
                                            value={selectedCrypto}
                                            onChange={(e) => setSelectedCrypto(e.target.value)}
                                            className="px-4 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg font-medium"
                                        >
                                            {Object.entries(CRYPTO_DATA).map(([code, data]) => (
                                                <option key={code} value={code}>{data.icon} {code}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <select
                                            value={selectedFiatWallet}
                                            onChange={(e) => setSelectedFiatWallet(e.target.value)}
                                            className="px-4 py-2 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg font-medium"
                                        >
                                            {wallets.map((w) => (
                                                <option key={w.id} value={w.id}>{w.currency}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>

                            {/* Rate Info */}
                            {rates && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 flex items-center gap-3">
                                    <Info className="w-5 h-5 text-blue-600 shrink-0" />
                                    <div className="text-sm text-blue-700 dark:text-blue-300">
                                        <p>1 {selectedCrypto} = {formatCurrency(rates.rate, selectedWallet?.currency || 'USD')}</p>
                                        <p className="text-xs text-blue-600 dark:text-blue-400">Rate valid for 60 seconds</p>
                                    </div>
                                </div>
                            )}

                            {/* Exchange Button */}
                            <button
                                onClick={handleExchange}
                                disabled={!amount || parseFloat(amount) <= 0 || loading || loadingRates}
                                className={`w-full py-4 font-bold text-white rounded-xl transition-colors disabled:opacity-50 ${mode === 'buy' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                                    }`}
                            >
                                {loading ? 'Processing...' : mode === 'buy' ? `Buy ${selectedCrypto}` : `Sell ${selectedCrypto}`}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Crypto Wallets & History */}
                <div className="space-y-6">
                    {/* Crypto Holdings */}
                    <div className="card">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Your Crypto</h3>
                        {cryptoWallets.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
                                No crypto holdings yet. Buy some!
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {cryptoWallets.map((wallet) => (
                                    <div
                                        key={wallet.id}
                                        onClick={() => setSelectedCrypto(wallet.currency)}
                                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${selectedCrypto === wallet.currency
                                                ? 'bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-500'
                                                : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{CRYPTO_DATA[wallet.currency]?.icon || '🪙'}</span>
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">{wallet.currency}</p>
                                                <p className="text-xs text-gray-500">{CRYPTO_DATA[wallet.currency]?.name}</p>
                                            </div>
                                        </div>
                                        <p className="font-bold text-gray-900 dark:text-white">
                                            {(wallet.balance || 0).toFixed(6)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Trades */}
                    <div className="card">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Recent Trades</h3>
                        {history.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
                                No trades yet
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {history.slice(0, 5).map((trade) => (
                                    <div key={trade.id} className="flex items-center justify-between p-2">
                                        <div className="flex items-center gap-2">
                                            {trade.type === 'buy' ? (
                                                <ArrowDown className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <ArrowUp className="w-4 h-4 text-red-500" />
                                            )}
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                {trade.type === 'buy' ? 'Bought' : 'Sold'} {trade.cryptocurrency}
                                            </span>
                                        </div>
                                        <span className={`text-sm font-medium ${trade.type === 'buy' ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            {trade.crypto_amount?.toFixed(6)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Exchange;
