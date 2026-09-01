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
    User,
    CreditCard,
    ArrowRight,
    Search,
    Landmark,
    Smartphone,
    Copy,
    Clock,
    Download
} from 'lucide-react';
import { Link } from 'react-router-dom';
import fxService from '../../services/fxService';
import walletService from '../../services/walletService';
import PinModal from '../../components/common/PinModal';
import SearchableBankSelect from '../../components/common/SearchableBankSelect';
import NigerianIdGate from '../../components/common/NigerianIdGate';
import { formatCurrency } from '../../utils/formatters';
import { useRecentInputs } from '../../hooks/useRecentInputs';
import { useAppStore } from '../../store/appStore';

// Friendly names for Yellow Card payout country codes (falls back to the code).
const COUNTRY_NAMES = {
    NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', UG: 'Uganda', TZ: 'Tanzania',
    CM: 'Cameroon', CI: "Côte d'Ivoire", SN: 'Senegal', ZM: 'Zambia', RW: 'Rwanda', BF: 'Burkina Faso',
    TG: 'Togo', BJ: 'Benin', MW: 'Malawi', BW: 'Botswana', GA: 'Gabon', CD: 'DR Congo', CG: 'Congo',
    US: 'United States', GB: 'United Kingdom', FR: 'France', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina',
    PE: 'Peru', CO: 'Colombia', EC: 'Ecuador', LK: 'Sri Lanka', KH: 'Cambodia',
};

// Payment Collection always credits a stablecoin wallet — matches Yellow Card's own "hold in
// USD stablecoins, protect against local devaluation" model. Swapping to local currency or
// withdrawing externally uses the existing Currency Swap / crypto withdraw features.
const STABLECOINS = ['USDT', 'USDC'];

const CrossBorder = () => {
    const [activeTab, setActiveTab] = useState('swap'); // 'swap' | 'transfer' | 'collect'
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [ratesLoading, setRatesLoading] = useState(false);
    const [liveRates, setLiveRates] = useState([]);
    const [ratesError, setRatesError] = useState(null);
    const [error, setError] = useState(null);
    const [needsProfile, setNeedsProfile] = useState(false); // show a Profile link on incomplete-profile errors
    const [transferStatus, setTransferStatus] = useState(null); // { id, status } for the success screen poll
    const [step, setStep] = useState(1);

    const { recentInputs: recentAccounts, addRecentInput: addRecentAccount } = useRecentInputs('cross_border_accounts');
    const { isFeatureEnabled } = useAppStore();

    // Swap State. `lastEdited` tracks which of the two amount fields the user is actively typing
    // into ('pay' | 'receive') — the OTHER field is always the one recomputed from the live rate,
    // so typing a desired receive amount works the same way as typing a pay amount.
    const [swapData, setSwapData] = useState({
        fromCurrency: 'NGN',
        toCurrency: 'USD',
        amount: '',
        receiveAmount: '',
        rate: 0,
        lastEdited: 'pay',
    });

    // Transfer State
    const [transferData, setTransferData] = useState({
        amount: '',
        currency: 'NGN',              // wallet the user pays FROM
        targetCurrency: 'NGN',        // destination local currency (set from country)
        recipientName: '',
        accountNumber: '',
        recipientCountry: '',         // ISO2, e.g. NG
        networkId: '',
        networkName: '',
        networkAccountType: '',
        networkChannelIds: [],
    });

    // Payment Collection state — the user is the RECIPIENT here; `payer` is who they're
    // collecting money from (must be supplied upfront — Yellow Card doesn't support an
    // anonymous "pay this link" mode).
    const [collectData, setCollectData] = useState({
        amount: '',
        userCurrency: 'USDT',     // stablecoin wallet credited — see STABLECOINS below
        payerCountry: '',
        payerCurrency: '',
        channelType: 'bank',       // 'bank' | 'momo'
        networkId: '',
        networkName: '',
        accountNumber: '',          // payer's bank account number (bank channel only)
        payer: { name: '', address: '', dob: '', email: '', phone: '', bvn: '', nin: '', idType: '', idNumber: '' },
    });
    const [collectResult, setCollectResult] = useState(null); // { transactionId, bankInfo, reference, expiresAt, status }
    const [collectFeeQuote, setCollectFeeQuote] = useState(null);
    const [collectFeeLoading, setCollectFeeLoading] = useState(false);
    const [collectNetworks, setCollectNetworks] = useState([]);
    const [collectNetworksLoading, setCollectNetworksLoading] = useState(false);

    // Yellow Card payout destinations
    const [payoutCountries, setPayoutCountries] = useState([]);
    const [payoutNetworks, setPayoutNetworks] = useState([]);
    const [networksLoading, setNetworksLoading] = useState(false);

    // Nigerian BVN/NIN gate — both must be verified before swap or international transfer.
    const [gate, setGate] = useState(null);
    const idBlocked = gate?.required && !gate?.verified;

    // Transaction PIN flow (international transfer)
    const [showPin, setShowPin] = useState(false);
    const [pinError, setPinError] = useState('');
    const [pinProcessing, setPinProcessing] = useState(false);

    useEffect(() => {
        fetchWallets();
        fxService.getRampStatus().then((res) => { if (res.success) setGate(res.data); }).catch(() => {});
    }, []);

    useEffect(() => {
        fetchLiveRates();
        const interval = setInterval(fetchLiveRates, 30000);
        return () => clearInterval(interval);
    }, []);

    const [quoteExpiry, setQuoteExpiry] = useState(0);

    useEffect(() => {
        let timer;
        if (quoteExpiry > 0) {
            timer = setInterval(() => setQuoteExpiry(prev => prev - 1), 1000);
        }
        return () => clearInterval(timer);
    }, [quoteExpiry]);

    // Load Yellow Card payout countries once, and networks whenever the country changes.
    useEffect(() => {
        (async () => {
            try {
                const res = await fxService.getPayoutCountries();
                if (res.success) setPayoutCountries(res.data || []);
            } catch { /* non-fatal */ }
        })();
    }, []);

    // Currency Swap options: every fiat currency across all Yellow Card payout countries
    // (not just the original hardcoded shortlist), plus the stablecoins (not tied to any country).
    const swapCurrencyOptions = [...new Set([
        'NGN', 'USDT', 'USDC',
        ...payoutCountries.flatMap(c => c.currencies || []),
    ])];

    // Matches InstantSwap.jsx's getBalance — same wallets state, same "Bal: X CODE" pattern next
    // to the field label, so a user swapping/sending currency can see what they hold without
    // leaving the form.
    const getBalance = (code) => {
        const w = wallets.find((x) => x.currency?.toUpperCase() === code?.toUpperCase());
        return parseFloat(w?.balance || 0);
    };

    // International transfer fee — fetched once the user reaches the review step (every required
    // field is set by then), from the same computation POST /fx/transfers/international itself
    // uses, so what's disclosed here can never drift from what actually gets charged.
    const [transferFeeQuote, setTransferFeeQuote] = useState(null);
    const [transferFeeLoading, setTransferFeeLoading] = useState(false);

    useEffect(() => {
        if (step !== 2 || activeTab !== 'transfer' || !transferData.amount || !transferData.currency) {
            return;
        }
        const destCurrency = payoutCountries.find(c => c.country === transferData.recipientCountry)?.currency || transferData.currency;
        let active = true;
        setTransferFeeLoading(true);
        fxService.getInternationalTransferFeeQuote(transferData.currency, destCurrency, transferData.amount)
            .then((res) => { if (active && res.success) setTransferFeeQuote(res.data); })
            .catch(() => { if (active) setTransferFeeQuote(null); })
            .finally(() => { if (active) setTransferFeeLoading(false); });
        return () => { active = false; };
    }, [step, activeTab, transferData.amount, transferData.currency, transferData.recipientCountry, payoutCountries]);

    useEffect(() => {
        const country = transferData.recipientCountry;
        if (!country) { setPayoutNetworks([]); return; }
        let active = true;
        setNetworksLoading(true);
        (async () => {
            try {
                const res = await fxService.getPayoutNetworks(country);
                if (active) setPayoutNetworks(res.success ? (res.data || []) : []);
            } catch { if (active) setPayoutNetworks([]); }
            finally { if (active) setNetworksLoading(false); }
        })();
        return () => { active = false; };
    }, [transferData.recipientCountry]);

    // Payer networks for Payment Collection — same catalog as International Transfer's recipient
    // picker (bank/momo networks are direction-agnostic), filtered to the chosen channel type.
    useEffect(() => {
        const country = collectData.payerCountry;
        if (!country) { setCollectNetworks([]); return; }
        let active = true;
        setCollectNetworksLoading(true);
        (async () => {
            try {
                const res = await fxService.getPayoutNetworks(country);
                if (active) setCollectNetworks(res.success ? (res.data || []) : []);
            } catch { if (active) setCollectNetworks([]); }
            finally { if (active) setCollectNetworksLoading(false); }
        })();
        return () => { active = false; };
    }, [collectData.payerCountry]);

    // Payment Collection fee — fetched once the user reaches the review step, from the same
    // computation POST /fx/collections itself uses.
    useEffect(() => {
        if (step !== 2 || activeTab !== 'collect' || !collectData.amount || !collectData.userCurrency) {
            return;
        }
        let active = true;
        setCollectFeeLoading(true);
        fxService.getPaymentCollectionFeeQuote(collectData.userCurrency, collectData.amount)
            .then((res) => { if (active && res.success) setCollectFeeQuote(res.data); })
            .catch(() => { if (active) setCollectFeeQuote(null); })
            .finally(() => { if (active) setCollectFeeLoading(false); });
        return () => { active = false; };
    }, [step, activeTab, collectData.amount, collectData.userCurrency]);

    // Debounce FX rate fetching — recomputes whichever field ISN'T the one the user is typing
    // into (swapData.lastEdited), so entering an amount in either "You Send" or "You Receive"
    // works the same way.
    useEffect(() => {
        const editingReceive = swapData.lastEdited === 'receive';
        const activeVal = editingReceive ? swapData.receiveAmount : swapData.amount;
        const timer = setTimeout(() => {
            if (activeVal && parseFloat(activeVal) > 0) {
                fetchRate(swapData.fromCurrency, swapData.toCurrency, activeVal, editingReceive ? 'receive' : 'pay');
            } else {
                setSwapData(prev => ({ ...prev, [editingReceive ? 'amount' : 'receiveAmount']: '', rate: 0 }));
                setQuoteExpiry(0);
            }
        }, 150); // Reduced from 300ms for faster updates
        return () => clearTimeout(timer);
    }, [swapData.amount, swapData.receiveAmount, swapData.fromCurrency, swapData.toCurrency, swapData.lastEdited]);

    const fetchWallets = async () => {
        const res = await walletService.getWallets();
        if (res.success) {
            setWallets(res.data || []);
        }
    };

    const fetchLiveRates = async () => {
        // Pairs Yellow Card supports (Africa-focused + majors). CNY is not supported.
        const pairs = [
            { from: 'USD', to: 'NGN' },
            { from: 'GBP', to: 'NGN' },
            { from: 'EUR', to: 'NGN' },
            { from: 'USD', to: 'GHS' },
            { from: 'USD', to: 'KES' },
            { from: 'USD', to: 'ZAR' },
            { from: 'USD', to: 'UGX' },
            { from: 'USD', to: 'TZS' },
            { from: 'CAD', to: 'NGN' },
            { from: 'NGN', to: 'GHS' },
        ];

        setRatesLoading(true);
        setRatesError(null);
        try {
            // allSettled → one unsupported pair can't blank the whole panel.
            const settled = await Promise.allSettled(
                pairs.map(async ({ from, to }) => {
                    const res = await fxService.getRates(from, to);
                    return { pair: `${from}/${to}`, rate: res.data?.rate };
                })
            );
            const results = settled
                .filter((s) => s.status === 'fulfilled' && s.value?.rate)
                .map((s) => s.value);

            if (results.length === 0) {
                setRatesError('Live rates are temporarily unavailable.');
            } else {
                setLiveRates((prev) => results.map((item) => {
                    const prevItem = prev.find(p => p.pair === item.pair);
                    let trend = 'flat';
                    if (prevItem?.rate && item.rate) {
                        trend = item.rate > prevItem.rate ? 'up' : item.rate < prevItem.rate ? 'down' : 'flat';
                    }
                    return { ...item, trend };
                }));
            }
        } catch (err) {
            setRatesError(err.message || 'Unable to load live rates');
        } finally {
            setRatesLoading(false);
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

    // Money-out → require the transaction PIN as the final step.
    const handleTransfer = () => {
        setError(null);
        setPinError('');
        setShowPin(true);
    };

    // Poll the payout status a few times so async failures reconcile (and refund) without waiting on a webhook.
    const pollTransferStatus = async (txId) => {
        for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 3500));
            try {
                const s = await fxService.checkStatus(txId);
                const st = String(s.data?.status || '').toUpperCase();
                if (st) setTransferStatus(prev => ({ ...(prev || {}), status: st }));
                if (['FAILED', 'COMPLETED', 'SUCCESS', 'REVERSED'].includes(st)) { fetchWallets(); break; }
            } catch { /* keep polling */ }
        }
    };

    const runTransfer = async (pin) => {
        setPinProcessing(true);
        setPinError('');
        setError(null);
        setNeedsProfile(false);
        try {
            const res = await fxService.sendInternationalPayment({ ...transferData, pin });
            if (res.success) {
                setShowPin(false);
                addRecentAccount(transferData.accountNumber);
                const txId = res.data?.transactionId;
                setTransferStatus({ id: txId, status: (res.data?.status || 'PROCESSING').toUpperCase() });
                setStep(3);
                fetchWallets();
                if (txId) pollTransferStatus(txId);
            } else {
                setShowPin(false);
                setError(res.message || res.error || 'Transfer failed.');
            }
        } catch (err) {
            if (['PIN_INCORRECT', 'PIN_LOCKED', 'PIN_NOT_SET', 'PIN_REQUIRED'].includes(err.code)) {
                setPinError(err.message || 'Incorrect PIN. Please try again.');
            } else {
                setShowPin(false);
                if (err.code === 'PROFILE_INCOMPLETE') setNeedsProfile(true);
                setError(err.message || 'Transfer failed.');
            }
        } finally {
            setPinProcessing(false);
        }
    };

    // No wallet debit happens on submission (nothing is at risk until the payer actually pays),
    // so unlike handleTransfer this doesn't go through the PIN modal.
    const handleCollect = async () => {
        setLoading(true);
        setError(null);
        try {
            const payer = { ...collectData.payer };
            if (collectData.payerCountry === 'NG') {
                delete payer.idType; delete payer.idNumber;
            } else {
                delete payer.bvn; delete payer.nin;
            }
            const res = await fxService.submitPaymentCollection({
                userCurrency: collectData.userCurrency,
                amount: collectData.amount,
                payerCountry: collectData.payerCountry,
                payerCurrency: collectData.payerCurrency,
                channelType: collectData.channelType,
                payer,
                networkId: collectData.networkId,
                accountNumber: collectData.channelType === 'bank' ? collectData.accountNumber : undefined,
            });
            if (res.success) {
                setCollectResult({ ...res.data });
                setStep(3);
                pollCollectStatus(res.data.transactionId);
            }
        } catch (err) {
            setError(err.message || 'Could not submit the payment collection request.');
        } finally {
            setLoading(false);
        }
    };

    // Poll the collection status a few times so completion (momo can auto-complete within
    // seconds) or expiry reflects on screen without waiting on a webhook.
    const pollCollectStatus = async (txId) => {
        for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 4000));
            try {
                const s = await fxService.getPaymentCollectionStatus(txId);
                const st = String(s.data?.status || '').toUpperCase();
                if (st) setCollectResult(prev => (prev ? { ...prev, status: st } : prev));
                if (['FAILED', 'COMPLETED', 'EXPIRED'].includes(st)) { fetchWallets(); break; }
            } catch { /* keep polling */ }
        }
    };

    // direction: 'pay' → `amount` is what the user typed, compute receiveAmount = amount * rate.
    //            'receive' → `amount` here is actually the desired receive amount typed by the
    //            user, compute the required pay-side amount = receiveAmount / rate. Either way,
    //            swapData.amount ends up holding the correct value that gets submitted to the
    //            backend (POST /fx/swap only takes a pay-side amount).
    const fetchRate = async (from, to, amount, direction = 'pay') => {
        if (!amount || amount <= 0) return;
        setLoading(true);
        try {
            const res = await fxService.getRates(from, to);
            if (res.success) {
                const rate = res.data.rate;
                const derivedField = direction === 'pay' ? 'receiveAmount' : 'amount';
                const derivedValue = direction === 'pay' ? amount * rate : amount / rate;
                setSwapData(prev => {
                    const currentDerived = parseFloat(prev[derivedField] || 0);
                    // Bail out (return the same object) if nothing actually changed — otherwise
                    // setting the derived field re-triggers the debounce effect (it depends on
                    // both amount and receiveAmount), which would refetch redundantly forever.
                    if (Math.abs(currentDerived - derivedValue) < 0.0001 && prev.rate === rate) return prev;
                    return { ...prev, rate, [derivedField]: derivedValue };
                });
                setQuoteExpiry(30);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
            {/* Header Area */}
            <div className="flex flex-col gap-4 bg-gradient-to-br from-primary to-accent rounded-2xl sm:rounded-3xl p-4 sm:p-8 text-white shadow-xl overflow-hidden relative">
                <div className="relative z-10">
                    <h1 className="text-xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
                        <Globe className="w-6 h-6 sm:w-8 sm:h-8 animate-pulse text-white/60 shrink-0" />
                        Global Finance Hub
                    </h1>
                    <p className="text-white/80 max-w-md text-sm sm:text-base">
                        Swap currencies instantly and make international payments to over 50 countries with the best real-time rates.
                    </p>
                </div>

                <div className="flex gap-1.5 sm:gap-2 p-1 bg-card/10 backdrop-blur-md rounded-xl sm:rounded-2xl relative z-10 self-start w-full sm:w-auto">
                    <button
                        onClick={() => { setActiveTab('swap'); setStep(1); }}
                        className={`flex-1 sm:flex-none min-w-0 px-2 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${activeTab === 'swap' ? 'bg-card text-primary shadow-lg' : 'text-white hover:bg-card/10'}`}
                    >
                        <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                        <span className="truncate"><span className="sm:hidden">Swap</span><span className="hidden sm:inline">Currency Swap</span></span>
                    </button>
                    <button
                        onClick={() => { setActiveTab('transfer'); setStep(1); }}
                        className={`flex-1 sm:flex-none min-w-0 px-2 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${activeTab === 'transfer' ? 'bg-card text-primary shadow-lg' : 'text-white hover:bg-card/10'}`}
                    >
                        <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                        <span className="truncate"><span className="sm:hidden">Transfer</span><span className="hidden sm:inline">Intl Transfer</span></span>
                    </button>
                    {isFeatureEnabled('payment_collection') && (
                        <button
                            onClick={() => { setActiveTab('collect'); setStep(1); }}
                            className={`flex-1 sm:flex-none min-w-0 px-2 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${activeTab === 'collect' ? 'bg-card text-primary shadow-lg' : 'text-white hover:bg-card/10'}`}
                        >
                            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                            <span className="truncate"><span className="sm:hidden">Collect</span><span className="hidden sm:inline">Payment Collection</span></span>
                        </button>
                    )}
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-card/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl"></div>
            </div>

            {/* Live rates — horizontal scroll strip (keeps the page from getting too tall) */}
            <div className="bg-card rounded-2xl border border-border shadow-sm px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" /> Live Rates
                    </h3>
                    {ratesLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </div>
                {ratesError ? (
                    <p className="text-xs text-danger">{ratesError}</p>
                ) : (
                    <div className="flex gap-3 overflow-x-auto pb-1 px-0.5 [scrollbar-width:thin]">
                        {liveRates.length === 0 && !ratesLoading && (
                            <span className="text-xs text-muted-foreground">No rates available.</span>
                        )}
                        {liveRates.map((item) => (
                            <div key={item.pair} className="shrink-0 min-w-[128px] bg-muted/40 rounded-xl px-3 py-2 border border-border/60">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-foreground">{item.pair}</span>
                                    <span className={`text-[10px] font-bold ${item.trend === 'up' ? 'text-success' : item.trend === 'down' ? 'text-danger' : 'text-muted-foreground'}`}>
                                        {item.trend === 'up' ? '▲' : item.trend === 'down' ? '▼' : '•'}
                                    </span>
                                </div>
                                <p className="text-sm font-bold mt-0.5 text-foreground">
                                    {item.rate ? Number(item.rate).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Form Content */}
                <div className="lg:col-span-8">
                    <div className="bg-card rounded-3xl p-6 md:p-8 shadow-sm border border-border min-h-[500px]">
                        {idBlocked ? (
                            <NigerianIdGate
                                gate={gate}
                                onRefresh={setGate}
                                title="Verify your BVN and NIN"
                                description="Both your BVN and NIN must be verified before you can swap currencies or send an international transfer — a Nigerian regulatory requirement. This is a one-time step."
                            />
                        ) : <>
                        {step === 1 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-2xl font-bold capitalize">{activeTab} Details</h2>
                                    <p className="text-muted-foreground text-sm">Fill in the information below to proceed.</p>
                                </div>

                                {activeTab === 'swap' ? (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-11 items-center gap-4">
                                            <div className="md:col-span-11 p-4 bg-muted/50 rounded-2xl border border-border">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block">You Send</label>
                                                    <span className="text-xs text-muted-foreground">
                                                        Bal: <span className="text-foreground font-medium">{getBalance(swapData.fromCurrency).toFixed(2)} {swapData.fromCurrency}</span>
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 sm:gap-4">
                                                    <div className="relative flex-1 min-w-0">
                                                        <input
                                                            type="number"
                                                            value={swapData.lastEdited === 'receive'
                                                                ? (swapData.amount ? Number(swapData.amount).toFixed(4) : '')
                                                                : swapData.amount}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setSwapData(prev => ({ ...prev, amount: val, lastEdited: 'pay' }));
                                                            }}
                                                            placeholder="0.00"
                                                            className={`w-full bg-transparent text-xl sm:text-3xl font-bold outline-none border-none focus:ring-0 ${loading && swapData.lastEdited === 'receive' ? 'opacity-50' : ''}`}
                                                        />
                                                        {loading && swapData.lastEdited === 'receive' && (
                                                            <RefreshCw className="w-4 h-4 text-primary animate-spin absolute right-0 top-1/2 -translate-y-1/2" />
                                                        )}
                                                    </div>
                                                    <select
                                                        value={swapData.fromCurrency}
                                                        onChange={(e) => setSwapData(prev => ({ ...prev, fromCurrency: e.target.value }))}
                                                        className="shrink-0 bg-card border-border rounded-xl px-4 py-2 font-bold focus:ring-ring"
                                                    >
                                                        {swapCurrencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="md:col-span-11 flex justify-center -my-6 relative z-10 pointer-events-none">
                                                <button
                                                    onClick={() => setSwapData(prev => ({
                                                        ...prev,
                                                        fromCurrency: prev.toCurrency,
                                                        toCurrency: prev.fromCurrency,
                                                        amount: prev.receiveAmount,
                                                        receiveAmount: prev.amount,
                                                        lastEdited: 'pay',
                                                    }))}
                                                    className="w-12 h-12 bg-card border border-border rounded-2xl shadow-lg flex items-center justify-center text-primary hover:rotate-180 transition-transform duration-500 pointer-events-auto"
                                                >
                                                    <ArrowLeftRight className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <div className="md:col-span-11 p-4 bg-muted/50 rounded-2xl border border-border">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block">You Receive (Estimated)</label>
                                                    <span className="text-xs text-muted-foreground">
                                                        Bal: <span className="text-foreground font-medium">{getBalance(swapData.toCurrency).toFixed(2)} {swapData.toCurrency}</span>
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 sm:gap-4">
                                                    <div className="relative flex-1 min-w-0">
                                                        <input
                                                            type="number"
                                                            placeholder="0.00"
                                                            value={swapData.lastEdited === 'pay'
                                                                ? (swapData.receiveAmount ? Number(swapData.receiveAmount).toFixed(4) : '')
                                                                : swapData.receiveAmount}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setSwapData(prev => ({ ...prev, receiveAmount: val, lastEdited: 'receive' }));
                                                            }}
                                                            className={`bg-transparent text-xl sm:text-3xl font-bold text-foreground focus:outline-none w-full ${loading && swapData.lastEdited === 'pay' ? 'opacity-50' : ''}`}
                                                        />
                                                        {loading && swapData.lastEdited === 'pay' && (
                                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                                <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                                                                <span className="text-xs text-primary font-medium hidden sm:inline">Updating...</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <select
                                                        value={swapData.toCurrency}
                                                        onChange={(e) => setSwapData(prev => ({ ...prev, toCurrency: e.target.value }))}
                                                        className="shrink-0 bg-card border-border rounded-xl px-4 py-2 font-bold focus:ring-ring"
                                                    >
                                                        {swapCurrencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        {swapData.rate > 0 && (
                                            <div className="p-4 bg-primary/10 rounded-2xl space-y-2 border border-primary/20">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-primary">
                                                        <TrendingUp className="w-4 h-4 text-success" />
                                                        <span className="text-sm font-medium">Guaranteed Rate</span>
                                                    </div>
                                                    <span className="font-bold text-primary">
                                                        1 {swapData.fromCurrency} = {Number(swapData.rate).toFixed(4)} {swapData.toCurrency}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">Quote valid for</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold ${quoteExpiry < 10 ? 'text-danger animate-pulse' : 'text-primary'}`}>
                                                            {quoteExpiry}s
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); fetchRate(swapData.fromCurrency, swapData.toCurrency, swapData.amount); }}
                                                            className="p-1 hover:bg-muted rounded text-primary transition-colors"
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
                                            disabled={loading || !swapData.amount || swapData.amount <= 0 || !swapData.receiveAmount || swapData.fromCurrency === swapData.toCurrency}
                                            className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                                        >
                                            Review Swap
                                        </button>
                                    </div>
                                ) : activeTab === 'transfer' ? (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-foreground">Recipient Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                    <input
                                                        type="text"
                                                        value={transferData.recipientName}
                                                        onChange={(e) => setTransferData(prev => ({ ...prev, recipientName: e.target.value }))}
                                                        placeholder="Full Name"
                                                        className="w-full pl-11 pr-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-foreground">Destination Country</label>
                                                <div className="relative">
                                                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                    <select
                                                        value={transferData.recipientCountry}
                                                        onChange={(e) => {
                                                            const code = e.target.value;
                                                            const c = payoutCountries.find(x => x.country === code);
                                                            const destCur = c?.currency || c?.currencies?.[0];
                                                            setTransferData(prev => ({
                                                                ...prev,
                                                                recipientCountry: code,
                                                                targetCurrency: destCur || prev.targetCurrency,
                                                                currency: destCur || prev.currency,   // auto-select the destination currency
                                                                networkId: '', networkName: '', networkAccountType: '', networkChannelIds: [],
                                                            }));
                                                        }}
                                                        className="w-full pl-11 pr-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                    >
                                                        <option value="">Select country…</option>
                                                        {payoutCountries.map((c) => (
                                                            <option key={c.country} value={c.country}>
                                                                {(COUNTRY_NAMES[c.country] || c.country)} ({c.currencies.join('/')})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <SearchableBankSelect
                                                    items={payoutNetworks}
                                                    selected={payoutNetworks.find(n => n.id === transferData.networkId) || null}
                                                    loading={networksLoading}
                                                    label="Recipient Bank / Network"
                                                    placeholder={!transferData.recipientCountry ? 'Select a country first' : 'Select bank / network'}
                                                    getId={(n) => n.id}
                                                    getSubLabel={(n) => n.accountNumberType === 'phone' ? 'Mobile Money' : 'Bank'}
                                                    onSelect={(n) => {
                                                        setTransferData(prev => ({
                                                            ...prev,
                                                            networkId: n?.id || '',
                                                            networkName: n?.name || '',
                                                            networkAccountType: n?.accountNumberType || '',
                                                            networkChannelIds: n?.channelIds || [],
                                                        }));
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-foreground">Account Number / IBAN</label>
                                                <div className="relative">
                                                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                    <input
                                                        type="text"
                                                        list="recent-global-accounts"
                                                        value={transferData.accountNumber}
                                                        onChange={(e) => setTransferData(prev => ({ ...prev, accountNumber: e.target.value }))}
                                                        placeholder="Account Details"
                                                        className="w-full pl-11 pr-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
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

                                        <div className="p-4 bg-muted/50 rounded-2xl border border-border">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase block">Amount to Send</label>
                                                <span className="text-xs text-muted-foreground">
                                                    Bal: <span className="text-foreground font-medium">{getBalance(transferData.currency).toFixed(2)} {transferData.currency}</span>
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 sm:gap-4">
                                                <input
                                                    type="number"
                                                    value={transferData.amount}
                                                    onChange={(e) => setTransferData(prev => ({ ...prev, amount: e.target.value }))}
                                                    placeholder="0.00"
                                                    className="flex-1 min-w-0 bg-transparent text-xl sm:text-3xl font-bold outline-none border-none focus:ring-0"
                                                />
                                                <select
                                                    value={transferData.currency}
                                                    onChange={(e) => setTransferData(prev => ({ ...prev, currency: e.target.value }))}
                                                    className="shrink-0 bg-card border-border rounded-xl px-4 py-2 font-bold focus:ring-ring"
                                                >
                                                    {/* Auto-set to the destination currency; includes every payout currency + your pay wallets */}
                                                    {[...new Set([transferData.currency, 'NGN', 'USD', ...payoutCountries.flatMap(c => c.currencies || [])].filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            {transferData.recipientCountry && (() => {
                                                const sc = payoutCountries.find(c => c.country === transferData.recipientCountry);
                                                const localCur = sc?.currency;
                                                return (
                                                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                                        <p>
                                                            Auto-set to <span className="font-semibold text-foreground">{localCur}</span> — you can change the send currency above.
                                                            {transferData.currency !== localCur && ` Your ${transferData.currency} is converted to ${localCur} at the live rate.`}
                                                        </p>
                                                        {sc?.min > 0 && transferData.currency === localCur && (
                                                            <p>Minimum payout to {COUNTRY_NAMES[sc.country] || sc.country}: <span className="font-semibold text-foreground">{sc.min.toLocaleString()} {localCur}</span></p>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <button
                                            onClick={() => setStep(2)}
                                            disabled={!transferData.amount || !transferData.recipientName || !transferData.accountNumber || !transferData.recipientCountry || !transferData.networkId}
                                            className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                                        >
                                            Next Step
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="p-4 bg-muted/50 rounded-2xl border border-border">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase block">Amount to Receive</label>
                                                <span className="text-xs text-muted-foreground">
                                                    Bal: <span className="text-foreground font-medium">{getBalance(collectData.userCurrency).toFixed(2)} {collectData.userCurrency}</span>
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 sm:gap-4">
                                                <input
                                                    type="number"
                                                    value={collectData.amount}
                                                    onChange={(e) => setCollectData(prev => ({ ...prev, amount: e.target.value }))}
                                                    placeholder="0.00"
                                                    className="flex-1 min-w-0 bg-transparent text-xl sm:text-3xl font-bold outline-none border-none focus:ring-0"
                                                />
                                                <select
                                                    value={collectData.userCurrency}
                                                    onChange={(e) => setCollectData(prev => ({ ...prev, userCurrency: e.target.value }))}
                                                    className="shrink-0 bg-card border-border rounded-xl px-4 py-2 font-bold focus:ring-ring"
                                                >
                                                    {STABLECOINS.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                Held as {collectData.userCurrency} in your JAXOPAY wallet, protected from local currency devaluation — swap to your local currency or withdraw to an external wallet anytime from Wallets.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-foreground">Who are you collecting from?</label>
                                            <div className="relative">
                                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <select
                                                    value={collectData.payerCountry}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const c = payoutCountries.find(x => x.country === code);
                                                        setCollectData(prev => ({
                                                            ...prev,
                                                            payerCountry: code,
                                                            payerCurrency: c?.currency || c?.currencies?.[0] || '',
                                                            networkId: '', networkName: '', accountNumber: '',
                                                        }));
                                                    }}
                                                    className="w-full pl-11 pr-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                >
                                                    <option value="">Payer's country…</option>
                                                    {payoutCountries.map((c) => (
                                                        <option key={c.country} value={c.country}>
                                                            {(COUNTRY_NAMES[c.country] || c.country)} ({c.currencies.join('/')})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 p-1 bg-muted/50 rounded-xl border border-border w-full sm:w-auto sm:inline-flex">
                                            {['bank', 'momo'].map((ct) => (
                                                <button
                                                    key={ct}
                                                    type="button"
                                                    onClick={() => setCollectData(prev => ({ ...prev, channelType: ct, networkId: '', networkName: '', accountNumber: '' }))}
                                                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${collectData.channelType === ct ? 'bg-card text-primary shadow' : 'text-muted-foreground hover:text-foreground'}`}
                                                >
                                                    {ct === 'bank' ? <Landmark className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                                                    {ct === 'bank' ? 'Bank Transfer' : 'Mobile Money'}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-foreground">Payer's Full Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                    <input
                                                        type="text"
                                                        value={collectData.payer.name}
                                                        onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, name: e.target.value } }))}
                                                        placeholder="Full Name"
                                                        className="w-full pl-11 pr-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-foreground">Payer's Phone</label>
                                                <input
                                                    type="text"
                                                    value={collectData.payer.phone}
                                                    onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, phone: e.target.value } }))}
                                                    placeholder="+234..."
                                                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-foreground">Payer's Email</label>
                                                <input
                                                    type="email"
                                                    value={collectData.payer.email}
                                                    onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, email: e.target.value } }))}
                                                    placeholder="payer@email.com"
                                                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-foreground">Payer's Date of Birth</label>
                                                <input
                                                    type="text"
                                                    value={collectData.payer.dob}
                                                    onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, dob: e.target.value } }))}
                                                    placeholder="MM/DD/YYYY"
                                                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <label className="text-sm font-bold text-foreground">Payer's Address</label>
                                                <input
                                                    type="text"
                                                    value={collectData.payer.address}
                                                    onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, address: e.target.value } }))}
                                                    placeholder="Home Address"
                                                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                />
                                            </div>

                                            {collectData.payerCountry === 'NG' ? (
                                                <>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-bold text-foreground">Payer's BVN</label>
                                                        <input
                                                            type="text"
                                                            value={collectData.payer.bvn}
                                                            onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, bvn: e.target.value } }))}
                                                            placeholder="11-digit BVN"
                                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-bold text-foreground">Payer's NIN</label>
                                                        <input
                                                            type="text"
                                                            value={collectData.payer.nin}
                                                            onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, nin: e.target.value } }))}
                                                            placeholder="11-digit NIN"
                                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                        />
                                                    </div>
                                                    <p className="md:col-span-2 text-xs text-muted-foreground -mt-2">Nigerian regulations require both the payer's BVN and NIN to process this collection.</p>
                                                </>
                                            ) : collectData.payerCountry && (
                                                <>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-bold text-foreground">Payer's ID Type</label>
                                                        <select
                                                            value={collectData.payer.idType}
                                                            onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, idType: e.target.value } }))}
                                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                        >
                                                            <option value="">Select ID type…</option>
                                                            <option value="national_id">National ID</option>
                                                            <option value="passport">Passport</option>
                                                            <option value="drivers_license">Driver's License</option>
                                                            <option value="voters_card">Voter's Card</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-bold text-foreground">Payer's ID Number</label>
                                                        <input
                                                            type="text"
                                                            value={collectData.payer.idNumber}
                                                            onChange={(e) => setCollectData(prev => ({ ...prev, payer: { ...prev.payer, idNumber: e.target.value } }))}
                                                            placeholder="ID Number"
                                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                        />
                                                    </div>
                                                </>
                                            )}

                                            <div className="space-y-2">
                                                <SearchableBankSelect
                                                    items={collectNetworks.filter(n => n.channelType === collectData.channelType)}
                                                    selected={collectNetworks.find(n => n.id === collectData.networkId) || null}
                                                    loading={collectNetworksLoading}
                                                    label={collectData.channelType === 'bank' ? "Payer's Bank" : "Payer's Mobile Network"}
                                                    placeholder={!collectData.payerCountry ? 'Select payer country first' : 'Select bank / network'}
                                                    getId={(n) => n.id}
                                                    getSubLabel={() => collectData.channelType === 'bank' ? 'Bank' : 'Mobile Money'}
                                                    onSelect={(n) => setCollectData(prev => ({ ...prev, networkId: n?.id || '', networkName: n?.name || '' }))}
                                                />
                                            </div>
                                            {collectData.channelType === 'bank' && (
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-foreground">Payer's Account Number</label>
                                                    <div className="relative">
                                                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                        <input
                                                            type="text"
                                                            value={collectData.accountNumber}
                                                            onChange={(e) => setCollectData(prev => ({ ...prev, accountNumber: e.target.value }))}
                                                            placeholder="Account Number"
                                                            className="w-full pl-11 pr-4 py-3 bg-muted/50 border border-border rounded-xl outline-none focus:ring-2 focus:ring-ring transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => setStep(2)}
                                            disabled={
                                                !collectData.amount || !collectData.payerCountry || !collectData.networkId ||
                                                !collectData.payer.name || !collectData.payer.phone || !collectData.payer.email || !collectData.payer.dob ||
                                                (collectData.payerCountry === 'NG' ? (!collectData.payer.bvn || !collectData.payer.nin) : (!collectData.payer.idType || !collectData.payer.idNumber)) ||
                                                (collectData.channelType === 'bank' && !collectData.accountNumber)
                                            }
                                            className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                                        >
                                            Next Step
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="max-w-md mx-auto py-8 animate-in zoom-in-95 duration-300">
                                <button onClick={() => setStep(1)} className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-primary font-medium">
                                    <ArrowLeftRight className="w-4 h-4" /> Back to edit
                                </button>

                                <h2 className="text-2xl font-bold mb-6">Review Transaction</h2>

                                <div className="space-y-4 bg-muted/50 p-6 rounded-3xl border border-border mb-8">
                                    {activeTab === 'swap' ? (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">From</span>
                                                <span className="font-bold">{swapData.amount} {swapData.fromCurrency}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">To</span>
                                                <span className="font-bold text-primary">{Number(swapData.receiveAmount).toFixed(2)} {swapData.toCurrency}</span>
                                            </div>
                                            <hr className="border-border" />
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Exchange Rate</span>
                                                <span className="font-medium">1 : {Number(swapData.rate).toFixed(4)}</span>
                                            </div>
                                        </>
                                    ) : activeTab === 'transfer' ? (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Amount</span>
                                                <span className="font-bold">{transferData.amount} {transferData.currency}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Recipient</span>
                                                <span className="font-bold text-right">{transferData.recipientName}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Destination</span>
                                                <span className="font-medium text-right">{transferData.networkName}, {COUNTRY_NAMES[transferData.recipientCountry] || transferData.recipientCountry}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Account</span>
                                                <span className="font-medium">{transferData.accountNumber}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Transfer Fee</span>
                                                {transferFeeLoading ? (
                                                    <span className="text-muted-foreground">Calculating...</span>
                                                ) : transferFeeQuote && transferFeeQuote.fee > 0 ? (
                                                    <span className="font-bold">
                                                        {transferFeeQuote.fee.toFixed(2)} {transferFeeQuote.fromCurrency}
                                                        {transferFeeQuote.feePercent != null && ` (${transferFeeQuote.feePercent}%)`}
                                                    </span>
                                                ) : (
                                                    <span className="font-bold text-success">FREE</span>
                                                )}
                                            </div>
                                            {transferFeeQuote && transferFeeQuote.fee > 0 && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Total Charged</span>
                                                    <span className="font-bold">
                                                        {transferFeeQuote.totalDebit.toFixed(2)} {transferFeeQuote.fromCurrency}
                                                    </span>
                                                </div>
                                            )}
                                            {transferFeeQuote && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Recipient Gets</span>
                                                    <span className="font-bold text-primary">
                                                        {transferFeeQuote.convertedAmount.toFixed(2)} {transferFeeQuote.targetCurrency}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">You'll Receive</span>
                                                <span className="font-bold">{collectData.amount} {collectData.userCurrency}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">From</span>
                                                <span className="font-bold text-right">{collectData.payer.name}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Payment Method</span>
                                                <span className="font-medium text-right">{collectData.networkName}, {COUNTRY_NAMES[collectData.payerCountry] || collectData.payerCountry}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">Collection Fee</span>
                                                {collectFeeLoading ? (
                                                    <span className="text-muted-foreground">Calculating...</span>
                                                ) : collectFeeQuote ? (
                                                    <span className="font-bold">
                                                        {collectFeeQuote.fee.toFixed(2)} {collectData.userCurrency}
                                                        {collectFeeQuote.feePercent != null && ` (${collectFeeQuote.feePercent}%)`}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </div>
                                            {collectFeeQuote && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider">You'll Be Credited</span>
                                                    <span className="font-bold text-primary">
                                                        {collectFeeQuote.netAmount.toFixed(2)} {collectData.userCurrency}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {activeTab === 'transfer' && transferFeeQuote && getBalance(transferData.currency) < transferFeeQuote.totalDebit && (
                                    <div className="mb-6 p-4 bg-danger/10 border border-red-100 rounded-2xl flex items-start gap-3 text-danger">
                                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                        <p className="text-sm font-medium">
                                            Insufficient balance. This transfer needs {transferFeeQuote.totalDebit.toFixed(2)} {transferFeeQuote.fromCurrency} (including the {transferFeeQuote.fee.toFixed(2)} {transferFeeQuote.fromCurrency} fee), but your {transferData.currency} balance is {getBalance(transferData.currency).toFixed(2)} {transferData.currency}.
                                        </p>
                                    </div>
                                )}

                                {error && (
                                    <div className="mb-6 p-4 bg-danger/10 border border-red-100 rounded-2xl flex items-start gap-3 text-danger">
                                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                        <div className="text-sm font-medium">
                                            <p>{error}</p>
                                            {needsProfile && (
                                                <Link
                                                    to="/dashboard/profile"
                                                    className="inline-flex items-center gap-1 mt-2 font-bold underline hover:no-underline"
                                                >
                                                    Update your profile <ArrowRight className="w-3.5 h-3.5" />
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={activeTab === 'swap' ? handleSwap : activeTab === 'transfer' ? handleTransfer : handleCollect}
                                    disabled={loading || (activeTab === 'transfer' && transferFeeQuote && getBalance(transferData.currency) < transferFeeQuote.totalDebit)}
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {loading ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-5 h-5" />
                                            Confirm {activeTab === 'swap' ? 'Swap' : activeTab === 'transfer' ? 'Transfer' : 'Request'}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {step === 3 && activeTab === 'collect' && (() => {
                            const st = (collectResult?.status || '').toUpperCase();
                            const failed = ['FAILED', 'EXPIRED'].includes(st);
                            const done = st === 'COMPLETED';
                            const pending = !failed && !done;
                            return (
                                <div className="py-8 animate-in fade-in zoom-in-95 duration-500">
                                    <div className="text-center mb-8">
                                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${failed ? 'bg-danger/10' : 'bg-success/10'}`}>
                                            {failed
                                                ? <AlertCircle className="w-10 h-10 text-danger" />
                                                : pending
                                                    ? <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                                                    : <CheckCircle2 className="w-10 h-10 text-success" />}
                                        </div>
                                        <h2 className="text-3xl font-bold mb-2">
                                            {failed ? (st === 'EXPIRED' ? 'Request Expired' : 'Collection Failed') : done ? 'Payment Received!' : 'Waiting for Payment'}
                                        </h2>
                                        <p className="text-muted-foreground max-w-sm mx-auto">
                                            {failed
                                                ? `${collectData.payer.name} did not complete this payment in time.`
                                                : done
                                                    ? `${collectFeeQuote ? collectFeeQuote.netAmount.toFixed(2) : collectResult?.netAmount} ${collectData.userCurrency} has been credited to your wallet. Swap it to your local currency or withdraw to an external wallet anytime from Wallets.`
                                                    : `We're waiting for ${collectData.payer.name} to complete the payment.`}
                                        </p>
                                    </div>

                                    {!failed && !done && collectResult?.channelType === 'bank' && collectResult?.bankInfo && (
                                        <div className="max-w-md mx-auto bg-muted/50 rounded-3xl border border-border p-6 space-y-4 mb-8">
                                            <p className="text-sm font-bold text-foreground">Share these details with {collectData.payer.name}:</p>
                                            {[
                                                ['Bank', collectResult.bankInfo.name],
                                                ['Account Name', collectResult.bankInfo.accountName],
                                                ['Account Number', collectResult.bankInfo.accountNumber],
                                                ['Reference', collectResult.reference],
                                            ].map(([label, value]) => (
                                                <div key={label} className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
                                                        <p className="font-bold text-foreground">{value}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => navigator.clipboard?.writeText(String(value))}
                                                        className="p-2 hover:bg-card rounded-xl text-muted-foreground hover:text-primary transition-colors shrink-0"
                                                        title="Copy"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <div className="pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                <span>The payer MUST include the reference above, or the payment can't be matched to this request.</span>
                                            </div>
                                        </div>
                                    )}

                                    {!failed && !done && collectResult?.channelType === 'momo' && (
                                        <div className="max-w-md mx-auto bg-muted/50 rounded-3xl border border-border p-6 mb-8 text-center">
                                            <Smartphone className="w-8 h-8 text-primary mx-auto mb-3" />
                                            <p className="text-sm text-foreground">
                                                A payment prompt has been sent to <span className="font-bold">{collectData.payer.phone}</span>. Ask {collectData.payer.name} to approve it on their phone.
                                            </p>
                                        </div>
                                    )}

                                    {!failed && !done && collectResult?.expiresAt && (
                                        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-8">
                                            <Clock className="w-3.5 h-3.5" /> Expires {new Date(collectResult.expiresAt).toLocaleString()}
                                        </p>
                                    )}

                                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                        <button
                                            onClick={() => { setStep(1); setError(null); setCollectResult(null); }}
                                            className="px-8 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all"
                                        >
                                            New Request
                                        </button>
                                        <button
                                            onClick={() => window.location.href = '/dashboard/transactions'}
                                            className="px-8 py-3 bg-muted text-foreground rounded-2xl font-bold hover:bg-muted transition-all"
                                        >
                                            View History
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {step === 3 && activeTab !== 'collect' && (() => {
                            const st = (transferStatus?.status || '').toUpperCase();
                            const failed = activeTab === 'transfer' && ['FAILED', 'REVERSED'].includes(st);
                            const done = activeTab === 'transfer' && ['COMPLETED', 'SUCCESS'].includes(st);
                            const pending = activeTab === 'transfer' && !failed && !done;
                            return (
                            <div className="text-center py-12 animate-in fade-in zoom-in-95 duration-500">
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${failed ? 'bg-danger/10' : 'bg-success/10'}`}>
                                    {failed
                                        ? <AlertCircle className="w-10 h-10 text-danger" />
                                        : pending
                                            ? <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                                            : <CheckCircle2 className="w-10 h-10 text-success" />}
                                </div>
                                <h2 className="text-3xl font-bold mb-2">
                                    {failed ? 'Transfer Failed' : pending ? 'Transfer Submitted' : 'Transaction Successful!'}
                                </h2>
                                <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                                    {activeTab === 'swap'
                                        ? `You successfully swapped currencies. Your reflected balance has been updated.`
                                        : failed
                                            ? `The transfer to ${transferData.recipientName} could not be completed and your wallet has been refunded.`
                                            : done
                                                ? `Your transfer to ${transferData.recipientName} has been delivered.`
                                                : `Your transfer to ${transferData.recipientName} has been submitted and is processing. We'll refund your wallet automatically if it fails.`}
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <button
                                        onClick={() => { setStep(1); setError(null); }}
                                        className="px-8 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all"
                                    >
                                        New Transaction
                                    </button>
                                    <button
                                        onClick={() => window.location.href = '/dashboard/transactions'}
                                        className="px-8 py-3 bg-muted text-foreground rounded-2xl font-bold hover:bg-muted transition-all"
                                    >
                                        View History
                                    </button>
                                </div>
                            </div>
                            );
                        })()}
                        </>}
                    </div>
                </div>

                {/* Right Column: Information */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
                        <Globe className="absolute -right-8 -bottom-8 w-28 h-28 text-white/10" />
                        <h3 className="font-bold text-base mb-2 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Jaxopay Safeguard
                        </h3>
                        <p className="text-xs text-white/80 leading-relaxed">
                            International transfers are processed through licensed partners. You'll always see the exchange rate and any fee before you confirm — no hidden charges.
                        </p>
                    </div>

                    <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
                        <h3 className="font-bold mb-4">Your Wallets</h3>
                        <div className="space-y-3">
                            {wallets.filter(w => ['NGN', 'USD', 'GBP', 'EUR'].includes(w.currency)).map(wallet => (
                                <div key={wallet.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                                            {wallet.currency.slice(0, 1)}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-muted-foreground uppercase">{wallet.currency}</p>
                                            <p className="text-sm font-bold truncate max-w-[80px]">
                                                {formatCurrency(wallet.balance, wallet.currency)}
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <PinModal
                open={showPin}
                onClose={() => { setShowPin(false); setPinError(''); }}
                onConfirm={runTransfer}
                processing={pinProcessing}
                errorMessage={pinError}
                title="Authorize International Transfer"
                description={`Enter your 4-digit PIN to send ${transferData.amount || ''} ${transferData.currency} to ${transferData.recipientName || 'the recipient'}.`}
            />
        </div>
    );
};

export default CrossBorder;
