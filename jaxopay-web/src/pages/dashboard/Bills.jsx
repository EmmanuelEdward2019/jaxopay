import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Zap, Wifi, Tv, Phone, GraduationCap,
    ChevronRight, Check, RefreshCw, AlertCircle, Signal,
} from 'lucide-react';
import billService from '../../services/billService';
import walletService from '../../services/walletService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useRecentInputs } from '../../hooks/useRecentInputs';

// Each category defines its own field label and whether verification is needed
const BILL_CATEGORIES = [
    {
        id: 'electricity', name: 'Electricity', icon: Zap,
        color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
        fieldLabel: 'Meter Number',
        fieldPlaceholder: 'Enter your meter number',
        fieldType: 'text',
        requiresValidation: true,
        description: 'Pay electricity bills for all DISCOs',
    },
    {
        id: 'airtime', name: 'Airtime', icon: Phone,
        color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
        fieldLabel: 'Phone Number',
        fieldPlaceholder: 'e.g. 08012345678',
        fieldType: 'tel',
        requiresValidation: false,
        description: 'Recharge airtime on any network',
    },
    {
        id: 'data', name: 'Data Bundle', icon: Signal,
        color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
        fieldLabel: 'Phone Number',
        fieldPlaceholder: 'e.g. 08012345678',
        fieldType: 'tel',
        requiresValidation: false,
        description: 'Buy data bundles for any network',
    },
    {
        id: 'cable_tv', name: 'Cable TV', icon: Tv,
        color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
        fieldLabel: 'Smartcard / IUC Number',
        fieldPlaceholder: 'Enter your smartcard number',
        fieldType: 'text',
        requiresValidation: true,
        description: 'Pay DSTV, GOtv, Startimes subscriptions',
    },
    {
        id: 'internet', name: 'Internet', icon: Wifi,
        color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
        fieldLabel: 'Account Number',
        fieldPlaceholder: 'Enter your account number',
        fieldType: 'text',
        requiresValidation: true,
        description: 'Pay Spectranet, Smile and others',
    },
    {
        id: 'education', name: 'Education', icon: GraduationCap,
        color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
        fieldLabel: 'Pin / Reg Number',
        fieldPlaceholder: 'Enter your pin or reg number',
        fieldType: 'text',
        requiresValidation: false,
        description: 'Pay WAEC, JAMB, and other educational fees',
    },
];

const Bills = () => {
    const [step, setStep] = useState(1);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [providers, setProviders] = useState([]);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [wallets, setWallets] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [selectedVariation, setSelectedVariation] = useState(null);
    const [validatedAccount, setValidatedAccount] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState(null);
    const [paymentResult, setPaymentResult] = useState(null);
    const [meterType, setMeterType] = useState('prepaid'); // prepaid | postpaid (electricity)
    const { recentInputs, addRecentInput } = useRecentInputs(selectedCategory?.id);

    useEffect(() => {
        fetchWallets();
        fetchHistory();
    }, []);

    const fetchWallets = async () => {
        const result = await walletService.getWallets();
        if (result.success) {
            const arr = Array.isArray(result.data) ? result.data : (result.data?.wallets || []);
            const active = arr.filter(w => w.is_active !== false);
            setWallets(active);
            if (active.length > 0) setSelectedWallet(active[0].id);
        }
    };

    const fetchHistory = async () => {
        const result = await billService.getHistory({ limit: 10 });
        if (result.success) {
            setHistory(result.data?.payments || (Array.isArray(result.data) ? result.data : []));
        }
    };

    const handleCategorySelect = async (category) => {
        setSelectedCategory(category);
        setLoading(true);
        setError(null);
        setProviders([]);
        const result = await billService.getProviders(category.id, 'NG');
        if (result.success) {
            // Backend sends { success: true, data: [...] }
            // API client returns either raw data or response.data
            const list = Array.isArray(result.data?.data) ? result.data.data : (Array.isArray(result.data) ? result.data : (result.data?.providers || []));
            setProviders(list);
        } else {
            setError(result.message || result.error || 'Failed to load providers. Try again.');
        }
        setLoading(false);
        setStep(2);
    };

    const handleProviderSelect = (provider) => {
        setSelectedProvider(provider);
        setSelectedVariation(null);
        setAmount('');
        setAccountNumber('');
        setValidatedAccount(null);
        setStep(3);
    };

    const handleValidateAccount = async () => {
        if (!accountNumber) return;
        setValidating(true);
        setError(null);
        // For electricity, pass the meter type (prepaid/postpaid) to validation
        const billType = selectedCategory?.id === 'electricity' ? meterType : selectedCategory?.id;
        const result = await billService.validateAccount(selectedProvider.id, accountNumber, billType);
        if (result.success) {
            setValidatedAccount(result.data?.data || result.data);
            addRecentInput(accountNumber);
        } else {
            setError(result.message || result.error || 'Could not verify. Check the number and try again.');
        }
        setValidating(false);
    };

    const handlePayBill = async () => {
        if (!amount || !selectedWallet) return;
        if (selectedCategory?.requiresValidation && !validatedAccount) return;
        setLoading(true);
        setError(null);

        const wallet = wallets.find(w => w.id === selectedWallet);
        const currency = wallet?.currency || 'NGN';

        const result = await billService.payBill({
            provider_id: selectedProvider.id,
            account_number: accountNumber,
            amount: parseFloat(amount),
            currency,
            // For electricity: variation_code = 'prepaid' or 'postpaid'
            // For data/cable TV: variation_code = the selected plan code
            variation_code: selectedCategory?.id === 'electricity'
                ? meterType
                : (selectedVariation?.variation_code || ''),
            bill_type: selectedCategory?.id === 'electricity' ? meterType : undefined,
            phone: accountNumber,
            metadata: {
                customer_name: validatedAccount?.customer_name,
                meter_type: meterType,
                category: selectedCategory?.id,
                variation: selectedVariation?.name,
            },
        });

        if (result.success) {
            setPaymentResult(result.data?.data || result.data);
            addRecentInput(accountNumber);
            setStep(5);
            fetchHistory();
        } else {
            setError(result.message || result.error || 'Payment failed. Please try again.');
        }
        setLoading(false);
    };

    const resetFlow = () => {
        setStep(1);
        setSelectedCategory(null);
        setSelectedProvider(null);
        setAccountNumber('');
        setAmount('');
        setSelectedVariation(null);
        setValidatedAccount(null);
        setPaymentResult(null);
        setMeterType('prepaid');
        setError(null);
    };

    const selectedWalletData = wallets.find(w => w.id === selectedWallet);
    const hasVariations = selectedCategory?.id === 'electricity'
        ? false  // electricity uses meterType toggle, not variations
        : (selectedProvider?.variations?.length ?? 0) > 0;
    const needsValidation = selectedCategory?.requiresValidation;
    // For electricity: must have verified account AND meterType selected
    // For data/cable with plans: must have selected a plan
    const canProceed = needsValidation
        ? (validatedAccount && amount && parseFloat(amount) > 0 &&
            (selectedCategory?.id !== 'electricity' || meterType) &&
            (!hasVariations || selectedVariation))
        : (accountNumber && accountNumber.length >= 10 && amount && parseFloat(amount) > 0 &&
            (!hasVariations || selectedVariation));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bill Payments</h1>
                <p className="text-gray-600 dark:text-gray-400">Pay your bills quickly and securely</p>
            </div>

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
                <div className="lg:col-span-2">
                    <div className="card">
                        {/* Progress Steps */}
                        <div className="flex items-center gap-2 mb-6">
                            {['Category', 'Provider', 'Details', 'Confirm', 'Done'].map((label, index) => (
                                <div key={label} className="flex items-center">
                                    <div className={`w - 8 h - 8 rounded - full flex items - center justify - center text - sm font - medium ${step > index + 1 ? 'bg-accent-500 text-white' :
                                        step === index + 1 ? 'bg-accent-600 text-white' :
                                            'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                        } `}>
                                        {step > index + 1 ? <Check className="w-4 h-4" /> : index + 1}
                                    </div>
                                    {index < 4 && <div className={`w - 8 h - 0.5 ${step > index + 1 ? 'bg-accent-500' : 'bg-gray-200 dark:bg-gray-700'} `} />}
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
                                            className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-accent-500 dark:hover:border-accent-500 transition-all text-center group"
                                        >
                                            <div className={`w - 12 h - 12 rounded - xl ${category.color} flex items - center justify - center mx - auto mb - 3 group - hover: scale - 110 transition - transform`}>
                                                <category.icon className="w-6 h-6" />
                                            </div>
                                            <p className="font-medium text-gray-900 dark:text-white">{category.name}</p>
                                            <p className="text-xs text-gray-500 mt-1 hidden sm:block">{category.description}</p>
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
                                    <div className="flex flex-col items-center py-12 gap-3">
                                        <RefreshCw className="w-8 h-8 text-accent-600 animate-spin" />
                                        <p className="text-gray-500 text-sm">Loading providers...</p>
                                    </div>
                                ) : error ? (
                                    <div className="text-center py-8">
                                        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                                        <p className="text-red-500 font-medium">{error}</p>
                                        <button onClick={() => handleCategorySelect(selectedCategory)} className="mt-4 px-6 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors">Try Again</button>
                                    </div>
                                ) : providers.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-500">No providers available</p>
                                        <button onClick={() => handleCategorySelect(selectedCategory)} className="mt-3 text-accent-600 underline text-sm">Retry</button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {providers.map((provider) => (
                                            <button
                                                key={provider.id}
                                                onClick={() => handleProviderSelect(provider)}
                                                className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-accent-500 hover:bg-accent-50 dark:hover:bg-accent-900/10 transition-all"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                                                        {provider.image_url ? (
                                                            <img src={provider.image_url} alt={provider.name} className="w-8 h-8 object-contain rounded" onError={e => { e.target.style.display = 'none'; }} />
                                                        ) : (
                                                            <selectedCategory.icon className="w-5 h-5 text-gray-500" />
                                                        )}
                                                    </div>
                                                    <div className="text-left">
                                                        <span className="font-medium text-gray-900 dark:text-white block">{provider.name}</span>
                                                        {(provider.variations?.length ?? 0) > 0 && (
                                                            <span className="text-xs text-gray-400">{provider.variations.length} plan{provider.variations.length > 1 ? 's' : ''} available</span>
                                                        )}
                                                    </div>
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
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment Details</h2>
                                        <p className="text-sm text-gray-500">{selectedProvider?.name}</p>
                                    </div>
                                </div>

                                {/* Prepaid / Postpaid toggle — electricity only */}
                                {selectedCategory?.id === 'electricity' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Meter Type
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {['prepaid', 'postpaid'].map((type) => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => { setMeterType(type); setValidatedAccount(null); }}
                                                    className={`py - 3 rounded - lg border - 2 font - medium capitalize transition - all ${meterType === type
                                                        ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300'
                                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-accent-400'
                                                        } `}
                                                >
                                                    {type === 'prepaid' ? '🔆 Prepaid' : '📋 Postpaid'}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">Select your meter type before verifying</p>
                                    </div>
                                )}

                                {/* Dynamic label per category */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        {selectedCategory?.fieldLabel}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type={selectedCategory?.fieldType || 'text'}
                                            list={`recent-accounts-${selectedCategory?.id}`}
                                            value={accountNumber}
                                            onChange={(e) => { setAccountNumber(e.target.value); setValidatedAccount(null); }}
                                            placeholder={selectedCategory?.fieldPlaceholder}
                                            className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent-500 outline-none"
                                        />
                                        {recentInputs.length > 0 && (
                                            <datalist id={`recent-accounts-${selectedCategory?.id}`}>
                                                {recentInputs.map((val, idx) => (
                                                    <option key={`${val}-${idx}`} value={val} />
                                                ))}
                                            </datalist>
                                        )}
                                        {needsValidation && (
                                            <button
                                                onClick={handleValidateAccount}
                                                disabled={!accountNumber || validating}
                                                className="px-4 py-3 bg-accent-600 hover:bg-accent-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                                            >
                                                {validating ? 'Verifying...' : 'Verify'}
                                            </button>
                                        )}
                                    </div>
                                    {(selectedCategory?.id === 'airtime' || selectedCategory?.id === 'data') && (
                                        <p className="text-xs text-gray-400 mt-1">Enter the 11-digit Nigerian phone number</p>
                                    )}
                                </div>

                                {/* Verified account banner */}
                                {validatedAccount && (
                                    <div className="bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 rounded-lg p-4">
                                        <div className="flex items-center gap-2 text-accent-700 dark:text-accent-300 mb-1">
                                            <Check className="w-5 h-5" />
                                            <span className="font-medium">Verified ✓</span>
                                        </div>
                                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                                            {(validatedAccount.customer_name || validatedAccount.Customer_Name) && (
                                                <>Customer: <strong>{validatedAccount.customer_name || validatedAccount.Customer_Name}</strong></>
                                            )}
                                            {validatedAccount.outstanding_balance && (
                                                <> &mdash; Outstanding: <strong>₦{validatedAccount.outstanding_balance}</strong></>
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* Plan/Variation picker */}
                                {hasVariations && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            {selectedCategory?.id === 'data' ? 'Select Data Plan' :
                                                selectedCategory?.id === 'cable_tv' ? 'Select Subscription Package' :
                                                    'Select Plan'}
                                        </label>
                                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1 rounded-lg">
                                            {selectedProvider.variations.map((v) => (
                                                <button
                                                    key={v.variation_code}
                                                    onClick={() => { setSelectedVariation(v); setAmount(String(v.variation_amount || v.price || '')); }}
                                                    className={`w - full flex items - center justify - between px - 4 py - 3 rounded - lg border - 2 transition - all text - left ${selectedVariation?.variation_code === v.variation_code
                                                        ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                                                        : 'border-gray-200 dark:border-gray-700 hover:border-accent-400'
                                                        } `}
                                                >
                                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{v.name}</span>
                                                    {(v.variation_amount || v.price) && (
                                                        <span className="text-sm font-bold text-accent-600">
                                                            ₦{parseFloat(v.variation_amount || v.price).toLocaleString()}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Amount (pre-filled from variation or manual) */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Amount (₦)
                                    </label>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => { setAmount(e.target.value); if (hasVariations) setSelectedVariation(null); }}
                                        placeholder="0.00"
                                        readOnly={hasVariations && !!selectedVariation}
                                        className={`w - full px - 4 py - 3 bg - white dark: bg - gray - 700 border border - gray - 200 dark: border - gray - 600 rounded - lg focus: ring - 2 focus: ring - accent - 500 outline - none ${hasVariations && selectedVariation ? 'font-semibold text-accent-700 dark:text-accent-300' : ''} `}
                                    />
                                </div>

                                {/* Wallet selector */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pay From</label>
                                    <select
                                        value={selectedWallet}
                                        onChange={(e) => setSelectedWallet(e.target.value)}
                                        className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                    >
                                        {wallets.map((w) => (
                                            <option key={w.id} value={w.id}>
                                                {w.currency} Wallet — {formatCurrency(w.balance || 0, w.currency)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <button
                                    onClick={() => setStep(4)}
                                    disabled={!canProceed}
                                    className="w-full py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                >
                                    Continue to Review
                                </button>
                            </motion.div>
                        )}

                        {/* Step 4: Confirm */}
                        {step === 4 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">Confirm Payment</h2>
                                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 space-y-3 mb-6">
                                    {[
                                        { label: 'Category', value: selectedCategory?.name },
                                        { label: 'Provider', value: selectedProvider?.name },
                                        selectedCategory?.id === 'electricity' && { label: 'Meter Type', value: meterType?.toUpperCase() },
                                        selectedVariation && { label: 'Plan', value: selectedVariation.name },
                                        { label: selectedCategory?.fieldLabel, value: accountNumber },
                                        validatedAccount?.customer_name && { label: 'Customer', value: validatedAccount.customer_name },
                                        { label: 'Wallet', value: `${selectedWalletData?.currency} Wallet` },
                                    ].filter(Boolean).map((row) => (
                                        <div key={row.label} className="flex justify-between">
                                            <span className="text-gray-500">{row.label}</span>
                                            <span className="font-medium text-gray-900 dark:text-white">{row.value}</span>
                                        </div>
                                    ))}
                                    <div className="border-t border-gray-200 dark:border-gray-600 pt-3 flex justify-between">
                                        <span className="text-gray-500 font-medium">Amount</span>
                                        <span className="text-xl font-bold text-gray-900 dark:text-white">
                                            {formatCurrency(parseFloat(amount), selectedWalletData?.currency || 'NGN')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setStep(3)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg">
                                        Back
                                    </button>
                                    <button
                                        onClick={handlePayBill}
                                        disabled={loading}
                                        className="flex-1 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</> : 'Confirm & Pay'}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 5: Success */}
                        {step === 5 && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-10 h-10 text-green-600" />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Payment Successful!</h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">Your {selectedCategory?.name} bill has been paid.</p>
                                {paymentResult?.token && (
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
                                        <p className="text-sm text-gray-500 mb-1">Token / Receipt</p>
                                        <p className="font-mono text-lg font-bold text-gray-900 dark:text-white">{paymentResult.token}</p>
                                        {paymentResult?.units && <p className="text-sm text-gray-500 mt-1">{paymentResult.units}</p>}
                                    </div>
                                )}
                                {paymentResult?.reference && (
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-6">
                                        <p className="text-xs text-gray-500 mb-1">Transaction Reference</p>
                                        <p className="font-mono text-sm text-gray-700 dark:text-gray-300">{paymentResult.reference}</p>
                                    </div>
                                )}
                                <button onClick={resetFlow} className="px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition-colors">
                                    Make Another Payment
                                </button>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Payment History Sidebar */}
                <div>
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Payments</h3>
                            <button onClick={fetchHistory} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                <RefreshCw className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        {history.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">No payment history yet</p>
                        ) : (
                            <div className="space-y-3">
                                {history.map((payment) => (
                                    <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white text-sm">{payment.provider_name || payment.provider_id}</p>
                                            <p className="text-xs text-gray-500">{formatDateTime(payment.created_at)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-gray-900 dark:text-white text-sm">{formatCurrency(payment.amount, payment.currency)}</p>
                                            <span className={`text - xs px - 1.5 py - 0.5 rounded font - medium ${payment.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                payment.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                    'bg-yellow-100 text-yellow-700'
                                                } `}>{payment.status}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
};

export default Bills;
