import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap,
    Wifi,
    Tv,
    Phone,
    Droplets,
    Search,
    ChevronRight,
    Check,
    X,
    RefreshCw,
    AlertCircle,
    Clock,
} from 'lucide-react';
import billService from '../../services/billService';
import walletService from '../../services/walletService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const BILL_CATEGORIES = [
    { id: 'electricity', name: 'Electricity', icon: Zap, color: 'bg-yellow-100 text-yellow-600' },
    { id: 'internet', name: 'Internet', icon: Wifi, color: 'bg-blue-100 text-blue-600' },
    { id: 'cable', name: 'Cable TV', icon: Tv, color: 'bg-purple-100 text-purple-600' },
    { id: 'airtime', name: 'Airtime', icon: Phone, color: 'bg-green-100 text-green-600' },
    { id: 'water', name: 'Water', icon: Droplets, color: 'bg-cyan-100 text-cyan-600' },
];

const Bills = () => {
    const [step, setStep] = useState(1); // 1: Category, 2: Provider, 3: Details, 4: Confirm, 5: Success
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [providers, setProviders] = useState([]);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [validatedAccount, setValidatedAccount] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState(null);
    const [paymentResult, setPaymentResult] = useState(null);

    useEffect(() => {
        fetchWallets();
        fetchHistory();
    }, []);

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            setWallets(result.data.wallets?.filter(w => w.status !== 'frozen') || []);
            if (result.data.wallets?.length > 0) {
                setSelectedWallet(result.data.wallets[0].id);
            }
        }
    };

    const fetchHistory = async () => {
        const result = await billService.getHistory({ limit: 10 });
        if (result.success) {
            setHistory(result.data.payments || []);
        }
    };

    const handleCategorySelect = async (category) => {
        setSelectedCategory(category);
        setLoading(true);
        const result = await billService.getProviders(category.id, 'NG');
        if (result.success) {
            setProviders(result.data.providers || []);
        } else {
            setError(result.error);
        }
        setLoading(false);
        setStep(2);
    };

    const handleProviderSelect = (provider) => {
        setSelectedProvider(provider);
        setStep(3);
    };

    const handleValidateAccount = async () => {
        if (!accountNumber) return;
        setValidating(true);
        setError(null);
        const result = await billService.validateAccount(selectedProvider.id, accountNumber);
        if (result.success) {
            setValidatedAccount(result.data);
        } else {
            setError(result.error || 'Invalid account number');
        }
        setValidating(false);
    };

    const handlePayBill = async () => {
        if (!validatedAccount || !amount || !selectedWallet) return;
        setLoading(true);
        setError(null);
        const result = await billService.payBill({
            provider_id: selectedProvider.id,
            account_number: accountNumber,
            amount: parseFloat(amount),
            wallet_id: selectedWallet,
            customer_name: validatedAccount.customer_name,
        });
        if (result.success) {
            setPaymentResult(result.data);
            setStep(5);
            fetchHistory();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const resetFlow = () => {
        setStep(1);
        setSelectedCategory(null);
        setSelectedProvider(null);
        setAccountNumber('');
        setAmount('');
        setValidatedAccount(null);
        setPaymentResult(null);
        setError(null);
    };

    const selectedWalletData = wallets.find(w => w.id === selectedWallet);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bill Payments</h1>
                <p className="text-gray-600 dark:text-gray-400">Pay your bills quickly and securely</p>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-red-700 dark:text-red-300">{error}</p>
                        <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">Dismiss</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bill Payment Flow */}
                <div className="lg:col-span-2">
                    <div className="card">
                        {/* Progress Steps */}
                        <div className="flex items-center gap-2 mb-6">
                            {['Category', 'Provider', 'Details', 'Confirm', 'Done'].map((label, index) => (
                                <div key={label} className="flex items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step > index + 1 ? 'bg-green-500 text-white' :
                                            step === index + 1 ? 'bg-primary-600 text-white' :
                                                'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                        }`}>
                                        {step > index + 1 ? <Check className="w-4 h-4" /> : index + 1}
                                    </div>
                                    {index < 4 && <div className={`w-8 h-0.5 ${step > index + 1 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                                </div>
                            ))}
                        </div>

                        {/* Step 1: Select Category */}
                        {step === 1 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Select Bill Category</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {BILL_CATEGORIES.map((category) => (
                                        <button
                                            key={category.id}
                                            onClick={() => handleCategorySelect(category)}
                                            className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors text-center"
                                        >
                                            <div className={`w-12 h-12 rounded-xl ${category.color} flex items-center justify-center mx-auto mb-3`}>
                                                <category.icon className="w-6 h-6" />
                                            </div>
                                            <p className="font-medium text-gray-900 dark:text-white">{category.name}</p>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Step 2: Select Provider */}
                        {step === 2 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <button onClick={() => setStep(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                        <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
                                    </button>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        Select {selectedCategory?.name} Provider
                                    </h2>
                                </div>
                                {loading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                    </div>
                                ) : providers.length === 0 ? (
                                    <p className="text-gray-500 text-center py-8">No providers available</p>
                                ) : (
                                    <div className="space-y-2">
                                        {providers.map((provider) => (
                                            <button
                                                key={provider.id}
                                                onClick={() => handleProviderSelect(provider)}
                                                className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                                        {provider.logo ? (
                                                            <img src={provider.logo} alt={provider.name} className="w-8 h-8 rounded" />
                                                        ) : (
                                                            <selectedCategory.icon className="w-5 h-5 text-gray-500" />
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-gray-900 dark:text-white">{provider.name}</span>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-gray-400" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Step 3: Enter Details */}
                        {step === 3 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <button onClick={() => setStep(2)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                        <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
                                    </button>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        Payment Details
                                    </h2>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Account/Meter Number
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={accountNumber}
                                                onChange={(e) => {
                                                    setAccountNumber(e.target.value);
                                                    setValidatedAccount(null);
                                                }}
                                                placeholder="Enter account number"
                                                className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                            />
                                            <button
                                                onClick={handleValidateAccount}
                                                disabled={!accountNumber || validating}
                                                className="px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50"
                                            >
                                                {validating ? 'Validating...' : 'Verify'}
                                            </button>
                                        </div>
                                    </div>

                                    {validatedAccount && (
                                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                                                <Check className="w-5 h-5" />
                                                <span className="font-medium">Account Verified</span>
                                            </div>
                                            <p className="text-gray-700 dark:text-gray-300">
                                                Customer: <strong>{validatedAccount.customer_name}</strong>
                                            </p>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Amount
                                        </label>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Pay From
                                        </label>
                                        <select
                                            value={selectedWallet}
                                            onChange={(e) => setSelectedWallet(e.target.value)}
                                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        >
                                            {wallets.map((w) => (
                                                <option key={w.id} value={w.id}>
                                                    {w.currency} Wallet - {formatCurrency(w.balance || 0, w.currency)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <button
                                        onClick={() => setStep(4)}
                                        disabled={!validatedAccount || !amount || parseFloat(amount) <= 0}
                                        className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
                                    >
                                        Continue
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 4: Confirm */}
                        {step === 4 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
                                    Confirm Payment
                                </h2>

                                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 space-y-4 mb-6">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Category</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{selectedCategory?.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Provider</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{selectedProvider?.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Account</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{accountNumber}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Customer</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{validatedAccount?.customer_name}</span>
                                    </div>
                                    <div className="border-t border-gray-200 dark:border-gray-600 pt-4 flex justify-between">
                                        <span className="text-gray-500">Amount</span>
                                        <span className="text-xl font-bold text-gray-900 dark:text-white">
                                            {formatCurrency(parseFloat(amount), selectedWalletData?.currency || 'NGN')}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setStep(3)}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handlePayBill}
                                        disabled={loading}
                                        className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : 'Pay Now'}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 5: Success */}
                        {step === 5 && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-8 h-8 text-green-600" />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Payment Successful!</h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    Your {selectedCategory?.name} bill has been paid successfully.
                                </p>
                                {paymentResult?.token && (
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                                        <p className="text-sm text-gray-500 mb-1">Token/Receipt</p>
                                        <p className="font-mono text-lg font-bold text-gray-900 dark:text-white">{paymentResult.token}</p>
                                    </div>
                                )}
                                <button
                                    onClick={resetFlow}
                                    className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
                                >
                                    Make Another Payment
                                </button>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Payment History */}
                <div>
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Payments</h3>
                            <button onClick={fetchHistory} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                <RefreshCw className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        {history.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
                                No payment history yet
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {history.map((payment) => (
                                    <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white text-sm">{payment.provider_name}</p>
                                            <p className="text-xs text-gray-500">{formatDateTime(payment.created_at)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                                                {formatCurrency(payment.amount, payment.currency)}
                                            </p>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${payment.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {payment.status}
                                            </span>
                                        </div>
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

export default Bills;
