import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Zap, Wifi, Tv, Phone, GraduationCap, Search,
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
        color: 'bg-warning/10 text-warning',
        fieldLabel: 'Meter Number',
        fieldPlaceholder: 'Enter your meter number',
        fieldType: 'text',
        requiresValidation: true,
        description: 'Pay electricity bills for all DISCOs',
    },
    {
        id: 'airtime', name: 'Airtime', icon: Phone,
        color: 'bg-success/10 text-success',
        fieldLabel: 'Phone Number',
        fieldPlaceholder: 'e.g. 08012345678',
        fieldType: 'tel',
        requiresValidation: false,
        description: 'Recharge airtime on any network',
    },
    {
        id: 'data', name: 'Data Bundle', icon: Signal,
        color: 'bg-indigo-100 text-indigo-600',
        fieldLabel: 'Phone Number',
        fieldPlaceholder: 'e.g. 08012345678',
        fieldType: 'tel',
        requiresValidation: false,
        description: 'Buy data bundles for any network',
    },
    {
        id: 'cable_tv', name: 'Cable TV', icon: Tv,
        color: 'bg-purple-100 text-purple-600',
        fieldLabel: 'Smartcard / IUC Number',
        fieldPlaceholder: 'Enter your smartcard number',
        fieldType: 'text',
        requiresValidation: true,
        description: 'Pay DSTV, GOtv, Startimes subscriptions',
    },
    {
        id: 'internet', name: 'Internet', icon: Wifi,
        color: 'bg-primary/10 text-primary',
        fieldLabel: 'Account Number',
        fieldPlaceholder: 'Enter your account number',
        fieldType: 'text',
        requiresValidation: true,
        description: 'Pay Spectranet and other broadband providers',
    },
    {
        id: 'education', name: 'Education', icon: GraduationCap,
        color: 'bg-cyan-100 text-cyan-600',
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
    const [providerSearch, setProviderSearch] = useState('');
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
        setStep(2); // Transition immediately to show loading spinner in Step 2
        setLoading(true);
        setError(null);
        setProviders([]);
        try {
            const result = await billService.getProviders(category.id, 'NG');
            if (result.success) {
                const list = Array.isArray(result.data?.data) ? result.data.data : (Array.isArray(result.data) ? result.data : (result.data?.providers || []));
                setProviders(list);
            } else {
                setError(result.message || result.error || 'Failed to load providers. Try again.');
            }
        } catch (err) {
            setError('Connection error. Please check your internet and try again.');
        } finally {
            setLoading(false);
        }
    };

    const extractProviderList = (result) => {
        const payload = result?.data;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.providers)) return payload.providers;
        return [];
    };

    /** Strowallet: first data response is networks only; refetch with ?network= to load bundle plans. */
    const handleProviderSelect = async (provider) => {
        setSelectedVariation(null);
        setAmount('');
        setAccountNumber('');
        setValidatedAccount(null);

        if (selectedCategory?.id === 'data') {
            setLoading(true);
            setError(null);
            try {
                const result = await billService.getProviders('data', 'NG', { network: provider.id });
                const list = extractProviderList(result);
                const enriched = list[0];
                const vars = enriched?.variations || [];
                if (!result.success || !enriched || vars.length === 0) {
                    setError(
                        result.error ||
                            'No data plans returned for this network. Pick another network or try again later.'
                    );
                    setLoading(false);
                    return;
                }
                setSelectedProvider(enriched);
            } catch {
                setError('Could not load data plans. Check your connection and try again.');
                setLoading(false);
                return;
            }
            setLoading(false);
        } else {
            setSelectedProvider(provider);
        }
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
    const needsBundlePlan = selectedCategory?.id === 'data' || selectedCategory?.id === 'cable_tv';
    // For electricity: must have verified account AND meterType selected
    // For data/cable: must pick a bundle / package (variation_code)
    const canProceed = needsValidation
        ? (validatedAccount && amount && parseFloat(amount) > 0 &&
            (selectedCategory?.id !== 'electricity' || meterType) &&
            (!needsBundlePlan || selectedVariation) &&
            (!hasVariations || selectedVariation))
        : (accountNumber && accountNumber.length >= 10 && amount && parseFloat(amount) > 0 &&
            (!needsBundlePlan || selectedVariation) &&
            (!hasVariations || selectedVariation));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Bill Payments</h1>
                <p className="text-muted-foreground ">Pay your bills quickly and securely</p>
            </div>

            {error && (
                <div className="bg-danger/10 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <div>
                        <p className="text-danger">{error}</p>
                        <button onClick={() => setError(null)} className="text-danger underline text-sm mt-1">Dismiss</button>
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
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step > index + 1 ? 'bg-primary text-white' :
                                        step === index + 1 ? 'bg-primary text-white' :
                                            'bg-muted text-muted-foreground'
                                        }`}>
                                        {step > index + 1 ? <Check className="w-4 h-4" /> : index + 1}
                                    </div>
                                    {index < 4 && <div className={`w-8 h-0.5 ${step > index + 1 ? 'bg-primary' : 'bg-muted'}`} />}
                                </div>
                            ))}
                        </div>

                        {/* Step 1: Select Category */}
                        {step === 1 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h2 className="text-lg font-semibold text-foreground mb-4">Select Bill Category</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {BILL_CATEGORIES.map((category) => (
                                        <button
                                            key={category.id}
                                            onClick={() => handleCategorySelect(category)}
                                            className="p-4 rounded-xl border-2 border-border hover:border-primary transition-all text-center group"
                                        >
                                            <div className={`w-12 h-12 rounded-xl ${category.color} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                                                <category.icon className="w-6 h-6" />
                                            </div>
                                            <p className="font-medium text-foreground">{category.name}</p>
                                            <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{category.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Step 2: Select Provider */}
                        {step === 2 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <button onClick={() => setStep(1)} className="p-2 hover:bg-muted rounded-lg">
                                        <ChevronRight className="w-5 h-5 rotate-180 text-muted-foreground" />
                                    </button>
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Select {selectedCategory?.name} Provider
                                    </h2>
                                </div>
                                {loading ? (
                                    <div className="flex flex-col items-center py-12 gap-3">
                                        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                                        <p className="text-muted-foreground text-sm">Loading providers...</p>
                                    </div>
                                ) : error ? (
                                    <div className="text-center py-8">
                                        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-3" />
                                        <p className="text-danger font-medium">{error}</p>
                                        <button onClick={() => handleCategorySelect(selectedCategory)} className="mt-4 px-6 py-2 bg-danger/10 text-danger rounded-lg font-medium hover:bg-danger/20 transition-colors">Try Again</button>
                                    </div>
                                ) : providers.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-muted-foreground">No providers available</p>
                                        <button onClick={() => handleCategorySelect(selectedCategory)} className="mt-3 text-primary underline text-sm">Retry</button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {/* Searchable filter */}
                                        {providers.length > 4 && (
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <input
                                                    type="text"
                                                    placeholder="Search providers..."
                                                    value={providerSearch}
                                                    onChange={(e) => setProviderSearch(e.target.value)}
                                                    className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                                                />
                                            </div>
                                        )}
                                        <div className="space-y-2 max-h-72 overflow-y-auto">
                                            {providers
                                                .filter(p => !providerSearch || p.name?.toLowerCase().includes(providerSearch.toLowerCase()))
                                                .map((provider) => (
                                                <button
                                                    key={provider.id}
                                                    onClick={() => handleProviderSelect(provider)}
                                                    className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                                                            {provider.image_url ? (
                                                                <img src={provider.image_url} alt={provider.name} className="w-8 h-8 object-contain rounded" onError={e => { e.target.style.display = 'none'; }} />
                                                            ) : (
                                                                <selectedCategory.icon className="w-5 h-5 text-muted-foreground" />
                                                            )}
                                                        </div>
                                                        <div className="text-left">
                                                            <span className="font-medium text-foreground block">{provider.name}</span>
                                                            {(provider.variations?.length ?? 0) > 0 && (
                                                                <span className="text-xs text-muted-foreground">{provider.variations.length} plan{provider.variations.length > 1 ? 's' : ''} available</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                                </button>
                                            ))}
                                            {providers.filter(p => !providerSearch || p.name?.toLowerCase().includes(providerSearch.toLowerCase())).length === 0 && (
                                                <p className="text-center text-muted-foreground text-sm py-4">No providers match "{providerSearch}"</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Step 3: Enter Details */}
                        {step === 3 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <button onClick={() => setStep(2)} className="p-2 hover:bg-muted rounded-lg">
                                        <ChevronRight className="w-5 h-5 rotate-180 text-muted-foreground" />
                                    </button>
                                    <div>
                                        <h2 className="text-lg font-semibold text-foreground">Payment Details</h2>
                                        <p className="text-sm text-muted-foreground">{selectedProvider?.name}</p>
                                    </div>
                                </div>

                                {/* Prepaid / Postpaid toggle — electricity only */}
                                {selectedCategory?.id === 'electricity' && (
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            Meter Type
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {['prepaid', 'postpaid'].map((type) => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => { setMeterType(type); setValidatedAccount(null); }}
                                                    className={`py-3 rounded-lg border-2 font-medium capitalize transition-all ${meterType === type
                                                        ? 'border-primary bg-primary/10 text-primary'
                                                        : 'border-border text-muted-foreground hover:border-primary'
                                                        }`}
                                                >
                                                    {type === 'prepaid' ? '🔆 Prepaid' : '📋 Postpaid'}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">Select your meter type before verifying</p>
                                    </div>
                                )}

                                {/* Dynamic label per category */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        {selectedCategory?.fieldLabel}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type={selectedCategory?.fieldType || 'text'}
                                            list={`recent-accounts-${selectedCategory?.id}`}
                                            value={accountNumber}
                                            onChange={(e) => { setAccountNumber(e.target.value); setValidatedAccount(null); }}
                                            placeholder={selectedCategory?.fieldPlaceholder}
                                            className="flex-1 px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring outline-none"
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
                                                className="px-4 py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                                            >
                                                {validating ? 'Verifying...' : 'Verify'}
                                            </button>
                                        )}
                                    </div>
                                    {(selectedCategory?.id === 'airtime' || selectedCategory?.id === 'data') && (
                                        <p className="text-xs text-muted-foreground mt-1">Enter the 11-digit Nigerian phone number</p>
                                    )}
                                </div>

                                {/* Verified account banner */}
                                {validatedAccount && (
                                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                                        <div className="flex items-center gap-2 text-primary mb-1">
                                            <Check className="w-5 h-5" />
                                            <span className="font-medium">Verified ✓</span>
                                        </div>
                                        <p className="text-foreground text-sm">
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
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {selectedCategory?.id === 'data' ? 'Select Data Plan' :
                                                selectedCategory?.id === 'cable_tv' ? 'Select Subscription Package' :
                                                    'Select Plan'}
                                        </label>
                                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1 rounded-lg">
                                            {selectedProvider.variations.map((v, idx) => (
                                                <button
                                                    key={v.variation_code || `plan-${idx}`}
                                                    onClick={() => {
                                                        setSelectedVariation(v);
                                                        const price = v.amount ?? v.variation_amount ?? v.price;
                                                        setAmount(price != null && price !== '' ? String(price) : '');
                                                    }}
                                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all text-left ${selectedVariation?.variation_code === v.variation_code
                                                        ? 'border-primary bg-primary/10'
                                                        : 'border-border hover:border-primary'
                                                        }`}
                                                >
                                                    <span className="text-sm font-medium text-foreground">{v.name}</span>
                                                    {(v.amount != null && v.amount !== '') || v.variation_amount || v.price ? (
                                                        <span className="text-sm font-bold text-primary">
                                                            ₦{parseFloat(v.amount ?? v.variation_amount ?? v.price).toLocaleString()}
                                                        </span>
                                                    ) : null}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Amount (pre-filled from variation or manual) */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Amount (₦)
                                    </label>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => { setAmount(e.target.value); if (hasVariations) setSelectedVariation(null); }}
                                        placeholder="0.00"
                                        readOnly={hasVariations && !!selectedVariation}
                                        className={`w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring outline-none ${hasVariations && selectedVariation ? 'font-semibold !text-primary' : ''}`}
                                    />
                                </div>

                                {/* Wallet selector */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">Pay From</label>
                                    <select
                                        value={selectedWallet}
                                        onChange={(e) => setSelectedWallet(e.target.value)}
                                        className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground"
                                    >
                                        {wallets.map((w) => (
                                            <option key={w.id} value={w.id} className="bg-card text-foreground">
                                                {w.currency} Wallet — {formatCurrency(w.balance || 0, w.currency)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <button
                                    onClick={() => setStep(4)}
                                    disabled={!canProceed}
                                    className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                >
                                    Continue to Review
                                </button>
                            </motion.div>
                        )}

                        {/* Step 4: Confirm */}
                        {step === 4 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h2 className="text-lg font-semibold text-foreground mb-4 text-center">Confirm Payment</h2>
                                <div className="bg-muted/50 rounded-xl p-6 space-y-3 mb-6">
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
                                            <span className="text-muted-foreground">{row.label}</span>
                                            <span className="font-medium text-foreground">{row.value}</span>
                                        </div>
                                    ))}
                                    <div className="border-t border-border pt-3 flex justify-between">
                                        <span className="text-muted-foreground font-medium">Amount</span>
                                        <span className="text-xl font-bold text-foreground">
                                            {formatCurrency(parseFloat(amount), selectedWalletData?.currency || 'NGN')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setStep(3)} className="flex-1 py-3 bg-muted text-foreground font-semibold rounded-lg">
                                        Back
                                    </button>
                                    <button
                                        onClick={handlePayBill}
                                        disabled={loading}
                                        className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</> : 'Confirm & Pay'}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 5: Success */}
                        {step === 5 && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                                <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-10 h-10 text-success" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground mb-2">Payment Successful!</h2>
                                <p className="text-muted-foreground  mb-6">Your {selectedCategory?.name} bill has been paid.</p>
                                {paymentResult?.token && (
                                    <div className="bg-muted/50 rounded-lg p-4 mb-4">
                                        <p className="text-sm text-muted-foreground mb-1">Token / Receipt</p>
                                        <p className="font-mono text-lg font-bold text-foreground">{paymentResult.token}</p>
                                        {paymentResult?.units && <p className="text-sm text-muted-foreground mt-1">{paymentResult.units}</p>}
                                    </div>
                                )}
                                {paymentResult?.reference && (
                                    <div className="bg-muted/50 rounded-lg p-3 mb-6">
                                        <p className="text-xs text-muted-foreground mb-1">Transaction Reference</p>
                                        <p className="font-mono text-sm text-foreground">{paymentResult.reference}</p>
                                    </div>
                                )}
                                <button onClick={resetFlow} className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors">
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
                            <h3 className="font-semibold text-foreground">Recent Payments</h3>
                            <button onClick={fetchHistory} className="p-1.5 hover:bg-muted rounded-lg">
                                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                            </button>
                        </div>
                        {history.length === 0 ? (
                            <p className="text-muted-foreground  text-sm text-center py-8">No payment history yet</p>
                        ) : (
                            <div className="space-y-3">
                                {history.map((payment) => (
                                    <div key={payment.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div>
                                            <p className="font-medium text-foreground text-sm">{payment.provider_name || payment.provider_id}</p>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(payment.created_at)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-foreground text-sm">{formatCurrency(payment.amount, payment.currency)}</p>
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${payment.status === 'completed' ? 'bg-success/10 text-success' :
                                                payment.status === 'failed' ? 'bg-danger/10 text-danger' :
                                                    'bg-warning/10 text-warning'
                                                }`}>{payment.status}</span>
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
