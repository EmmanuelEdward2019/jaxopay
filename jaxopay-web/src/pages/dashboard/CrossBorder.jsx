import { useState, useEffect } from 'react';
import {
    Globe,
    ArrowLeftRight,
    Send,
    TrendingUp,
    RefreshCw,
    Wallet,
    CheckCircle2,
    AlertCircle,
    ChevronDown,
    Building2,
    User,
    CreditCard,
    ArrowRight,
    Search
} from 'lucide-react';
import fxService from '../../services/fxService';
import walletService from '../../services/walletService';
import { formatCurrency } from '../../utils/formatters';
import { useRecentInputs } from '../../hooks/useRecentInputs';

const CrossBorder = () => {
    const [activeTab, setActiveTab] = useState('swap'); // 'swap' | 'transfer'
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [step, setStep] = useState(1);

    const { recentInputs: recentAccounts, addRecentInput: addRecentAccount } = useRecentInputs('cross_border_accounts');

    // Swap State
    const [swapData, setSwapData] = useState({
        fromCurrency: 'NGN',
        toCurrency: 'USD',
        amount: '',
        receiveAmount: '',
        rate: 0
    });

    // Transfer State
    const [transferData, setTransferData] = useState({
        amount: '',
        currency: 'NGN',
        targetCurrency: 'USD',
        recipientName: '',
        recipientBank: '',
        accountNumber: '',
        destinationCountry: 'United States',
        purpose: 'Settlement'
    });

    useEffect(() => {
        fetchWallets();
    }, []);

    const [quoteExpiry, setQuoteExpiry] = useState(0);

    useEffect(() => {
        let timer;
        if (quoteExpiry > 0) {
            timer = setInterval(() => setQuoteExpiry(prev => prev - 1), 1000);
        }
        return () => clearInterval(timer);
    }, [quoteExpiry]);

    // Debounce FX rate fetching
    useEffect(() => {
        const timer = setTimeout(() => {
            if (swapData.amount && parseFloat(swapData.amount) > 0) {
                fetchRate(swapData.fromCurrency, swapData.toCurrency, swapData.amount);
            } else {
                setSwapData(prev => ({ ...prev, receiveAmount: '', rate: 0 }));
                setQuoteExpiry(0);
            }
        }, 650);
        return () => clearTimeout(timer);
    }, [swapData.amount, swapData.fromCurrency, swapData.toCurrency]);

    const fetchWallets = async () => {
        const res = await walletService.getWallets();
        if (res.success) {
            setWallets(res.data || []);
        }
    };

    const handleSwap = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fxService.swap(swapData.fromCurrency, swapData.toCurrency, swapData.amount);
            if (res.success) {
                setStep(3); // Success step
                fetchWallets();
            }
        } catch (err) {
            setError(err.message || 'Swap failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleTransfer = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fxService.sendInternationalPayment(transferData);
            if (res.success) {
                addRecentAccount(transferData.accountNumber);
                setStep(3);
                fetchWallets();
            }
        } catch (err) {
            setError(err.message || 'Transfer failed.');
        } finally {
            setLoading(false);
        }
    };

    const fetchRate = async (from, to, amount) => {
        if (!amount || amount <= 0) return;
        setLoading(true);
        try {
            const res = await fxService.getRates(from, to);
            if (res.success) {
                setSwapData(prev => ({
                    ...prev,
                    rate: res.data.rate,
                    receiveAmount: amount * res.data.rate
                }));
                setQuoteExpiry(30);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-accent-600 to-accent-800 rounded-3xl p-8 text-white shadow-xl overflow-hidden relative">
                <div className="relative z-10">
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Globe className="w-8 h-8 animate-pulse text-accent-200" />
                        Global Finance Hub
                    </h1>
                    <p className="text-accent-100 max-w-md">
                        Swap currencies instantly and make international payments to over 50 countries with the best real-time rates.
                    </p>
                </div>

                <div className="flex gap-2 p-1 bg-white/10 backdrop-blur-md rounded-2xl relative z-10 self-start">
                    <button
                        onClick={() => { setActiveTab('swap'); setStep(1); }}
                        className={`px-6 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 ${activeTab === 'swap' ? 'bg-white text-accent-700 shadow-lg' : 'text-white hover:bg-white/10'}`}
                    >
                        <ArrowLeftRight className="w-4 h-4" />
                        Currency Swap
                    </button>
                    <button
                        onClick={() => { setActiveTab('transfer'); setStep(1); }}
                        className={`px-6 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 ${activeTab === 'transfer' ? 'bg-white text-accent-700 shadow-lg' : 'text-white hover:bg-white/10'}`}
                    >
                        <Send className="w-4 h-4" />
                        International Transfer
                    </button>
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-accent-400/20 rounded-full blur-3xl"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Form Content */}
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 min-h-[500px]">
                        {step === 1 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-2xl font-bold dark:text-white capitalize">{activeTab} Details</h2>
                                    <p className="text-gray-500 text-sm">Fill in the information below to proceed.</p>
                                </div>

                                {activeTab === 'swap' ? (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-11 items-center gap-4">
                                            <div className="md:col-span-11 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">You Send</label>
                                                <div className="flex items-center gap-4">
                                                    <input
                                                        type="number"
                                                        value={swapData.amount}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setSwapData(prev => ({ ...prev, amount: val }));
                                                            // Removed direct fetchRate call to use debounced useEffect
                                                        }}
                                                        placeholder="0.00"
                                                        className="w-full bg-transparent text-3xl font-bold outline-none dark:text-white border-none focus:ring-0"
                                                    />
                                                    <select
                                                        value={swapData.fromCurrency}
                                                        onChange={(e) => setSwapData(prev => ({ ...prev, fromCurrency: e.target.value }))}
                                                        className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 font-bold focus:ring-accent-500"
                                                    >
                                                        {['NGN', 'USD', 'GBP', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="md:col-span-11 flex justify-center -my-6 relative z-10">
                                                <button
                                                    onClick={() => setSwapData(prev => ({
                                                        ...prev,
                                                        fromCurrency: prev.toCurrency,
                                                        toCurrency: prev.fromCurrency,
                                                        amount: prev.receiveAmount,
                                                        receiveAmount: prev.amount
                                                    }))}
                                                    className="w-12 h-12 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg flex items-center justify-center text-accent-600 hover:rotate-180 transition-transform duration-500"
                                                >
                                                    <ArrowLeftRight className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <div className="md:col-span-11 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">You Receive (Estimated)</label>
                                                <div className="flex items-center gap-4">
                                                    <input
                                                        readOnly
                                                        value={swapData.receiveAmount}
                                                        placeholder="0.00"
                                                        className="w-full bg-transparent text-3xl font-bold outline-none text-gray-400 dark:text-gray-500 border-none focus:ring-0"
                                                    />
                                                    <select
                                                        value={swapData.toCurrency}
                                                        onChange={(e) => setSwapData(prev => ({ ...prev, toCurrency: e.target.value }))}
                                                        className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 font-bold focus:ring-accent-500"
                                                    >
                                                        {['USD', 'GBP', 'EUR', 'NGN'].map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        {swapData.rate > 0 && (
                                            <div className="p-4 bg-accent-50 dark:bg-accent-900/10 rounded-2xl space-y-2 border border-accent-100 dark:border-accent-900/20">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-accent-700 dark:text-accent-400">
                                                        <TrendingUp className="w-4 h-4 text-green-500" />
                                                        <span className="text-sm font-medium">Guaranteed Rate</span>
                                                    </div>
                                                    <span className="font-bold text-accent-700 dark:text-accent-400">
                                                        1 {swapData.fromCurrency} = {Number(swapData.rate).toFixed(4)} {swapData.toCurrency}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-gray-500 dark:text-gray-400">Quote valid for</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold ${quoteExpiry < 10 ? 'text-red-500 animate-pulse' : 'text-accent-600'}`}>
                                                            {quoteExpiry}s
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); fetchRate(swapData.fromCurrency, swapData.toCurrency, swapData.amount); }}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-accent-600 transition-colors"
                                                            title="Refresh Rate"
                                                        >
                                                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => setStep(2)}
                                            disabled={!swapData.amount || swapData.amount <= 0 || swapData.fromCurrency === swapData.toCurrency}
                                            className="w-full py-4 bg-accent-600 text-white rounded-2xl font-bold text-lg hover:bg-accent-700 shadow-lg shadow-accent-200 dark:shadow-none transition-all disabled:opacity-50"
                                        >
                                            Review Swap
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Recipient Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={transferData.recipientName}
                                                        onChange={(e) => setTransferData(prev => ({ ...prev, recipientName: e.target.value }))}
                                                        placeholder="Full Name"
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-accent-500 transition-all dark:text-white"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Destination Country</label>
                                                <div className="relative">
                                                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <select
                                                        value={transferData.destinationCountry}
                                                        onChange={(e) => setTransferData(prev => ({ ...prev, destinationCountry: e.target.value }))}
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-accent-500 transition-all dark:text-white"
                                                    >
                                                        <option value="United States">United States (USD)</option>
                                                        <option value="United Kingdom">United Kingdom (GBP)</option>
                                                        <option value="European Union">European Union (EUR)</option>
                                                        <option value="China">China (CNY)</option>
                                                        <option value="Canada">Canada (CAD)</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Recipient Bank</label>
                                                <div className="relative">
                                                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={transferData.recipientBank}
                                                        onChange={(e) => setTransferData(prev => ({ ...prev, recipientBank: e.target.value }))}
                                                        placeholder="Bank Name"
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-accent-500 transition-all dark:text-white"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Account Number / IBAN</label>
                                                <div className="relative">
                                                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        list="recent-global-accounts"
                                                        value={transferData.accountNumber}
                                                        onChange={(e) => setTransferData(prev => ({ ...prev, accountNumber: e.target.value }))}
                                                        placeholder="Account Details"
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-accent-500 transition-all dark:text-white"
                                                    />
                                                    {recentAccounts.length > 0 && (
                                                        <datalist id="recent-global-accounts">
                                                            {recentAccounts.map((val, idx) => (
                                                                <option key={`${val}-${idx}`} value={val} />
                                                            ))}
                                                        </datalist>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Amount to Send</label>
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="number"
                                                    value={transferData.amount}
                                                    onChange={(e) => setTransferData(prev => ({ ...prev, amount: e.target.value }))}
                                                    placeholder="0.00"
                                                    className="w-full bg-transparent text-3xl font-bold outline-none dark:text-white border-none focus:ring-0"
                                                />
                                                <select
                                                    value={transferData.currency}
                                                    onChange={(e) => setTransferData(prev => ({ ...prev, currency: e.target.value }))}
                                                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 font-bold focus:ring-accent-500"
                                                >
                                                    <option value="NGN">NGN</option>
                                                    <option value="USD">USD</option>
                                                </select>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setStep(2)}
                                            disabled={!transferData.amount || !transferData.recipientName || !transferData.accountNumber}
                                            className="w-full py-4 bg-accent-600 text-white rounded-2xl font-bold text-lg hover:bg-accent-700 shadow-lg shadow-accent-200 dark:shadow-none transition-all disabled:opacity-50"
                                        >
                                            Next Step
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="max-w-md mx-auto py-8 animate-in zoom-in-95 duration-300">
                                <button onClick={() => setStep(1)} className="mb-6 flex items-center gap-2 text-gray-500 hover:text-accent-600 font-medium">
                                    <ArrowLeftRight className="w-4 h-4" /> Back to edit
                                </button>

                                <h2 className="text-2xl font-bold mb-6 dark:text-white">Review Transaction</h2>

                                <div className="space-y-4 bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 mb-8">
                                    {activeTab === 'swap' ? (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">From</span>
                                                <span className="font-bold dark:text-white">{swapData.amount} {swapData.fromCurrency}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">To</span>
                                                <span className="font-bold text-accent-600">{Number(swapData.receiveAmount).toFixed(2)} {swapData.toCurrency}</span>
                                            </div>
                                            <hr className="border-gray-200 dark:border-gray-700" />
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Exchange Rate</span>
                                                <span className="font-medium dark:text-gray-400">1 : {Number(swapData.rate).toFixed(4)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Amount</span>
                                                <span className="font-bold dark:text-white">{transferData.amount} {transferData.currency}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Recipient</span>
                                                <span className="font-bold dark:text-white text-right">{transferData.recipientName}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Destination</span>
                                                <span className="font-medium dark:text-gray-400">{transferData.destinationCountry}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Transfer Fee</span>
                                                <span className="font-bold text-green-600">FREE</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {error && (
                                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center gap-3 text-red-600">
                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                        <p className="text-sm font-medium">{error}</p>
                                    </div>
                                )}

                                <button
                                    onClick={activeTab === 'swap' ? handleSwap : handleTransfer}
                                    disabled={loading}
                                    className="w-full py-4 bg-accent-600 text-white rounded-2xl font-bold text-lg hover:bg-accent-700 shadow-lg shadow-accent-200 dark:shadow-none transition-all flex items-center justify-center gap-3"
                                >
                                    {loading ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-5 h-5" />
                                            Confirm {activeTab === 'swap' ? 'Swap' : 'Transfer'}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="text-center py-12 animate-in fade-in zoom-in-95 duration-500">
                                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                                </div>
                                <h2 className="text-3xl font-bold mb-2 dark:text-white">Transaction Successful!</h2>
                                <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                                    {activeTab === 'swap'
                                        ? `You successfully swapped currencies. Your reflected balance has been updated.`
                                        : `Your international transfer to ${transferData.recipientName} has been initiated and is processing.`}
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <button
                                        onClick={() => { setStep(1); setError(null); }}
                                        className="px-8 py-3 bg-accent-600 text-white rounded-2xl font-bold hover:bg-accent-700 transition-all"
                                    >
                                        New Transaction
                                    </button>
                                    <button
                                        onClick={() => window.location.href = '/dashboard/transactions'}
                                        className="px-8 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                                    >
                                        View History
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Information & Rates */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-accent-600" />
                            Live Exchange Rates
                        </h3>
                        <div className="space-y-4">
                            {[
                                { pair: 'NGN/USD', rate: '1,540.20', trend: 'up' },
                                { pair: 'GBP/NGN', rate: '2,012.45', trend: 'down' },
                                { pair: 'EUR/NGN', rate: '1,720.10', trend: 'up' },
                                { pair: 'USD/CNY', rate: '7.21', trend: 'down' }
                            ].map((item, i) => (
                                <div key={i} className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-2xl transition-all group">
                                    <span className="font-bold text-sm text-gray-700 dark:text-gray-300 group-hover:text-accent-600">{item.pair}</span>
                                    <div className="text-right">
                                        <p className="font-bold dark:text-white">{item.rate}</p>
                                        <span className={`text-[10px] font-bold uppercase ${item.trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                                            {item.trend === 'up' ? '▲ 0.12%' : '▼ 0.05%'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
                        <Globe className="absolute -right-10 -bottom-10 w-40 h-40 text-white/10 group-hover:scale-110 transition-transform duration-700" />
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5" />
                            Jaxopay Safeguard
                        </h3>
                        <p className="text-sm text-white/80 leading-relaxed mb-6">
                            All international transactions are fully protected and processed through licensed partners. We guarantee zero hidden fees.
                        </p>
                        <button className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-all flex items-center gap-2">
                            Security Protocol <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold dark:text-white mb-4">Your Wallets</h3>
                        <div className="space-y-3">
                            {wallets.filter(w => ['NGN', 'USD', 'GBP', 'EUR'].includes(w.currency)).map(wallet => (
                                <div key={wallet.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/30 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center font-bold text-accent-700">
                                            {wallet.currency.slice(0, 1)}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-500 uppercase">{wallet.currency}</p>
                                            <p className="text-sm font-bold dark:text-white truncate max-w-[80px]">
                                                {formatCurrency(wallet.balance, wallet.currency)}
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-gray-300" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CrossBorder;
