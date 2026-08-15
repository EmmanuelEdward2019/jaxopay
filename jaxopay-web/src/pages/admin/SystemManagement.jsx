import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    DollarSign,
    Percent,
    ShieldAlert,
    Save,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    Cpu,
    Network,
    Zap,
    Plus
} from 'lucide-react';
import adminService from '../../services/adminService';
import cryptoService from '../../services/cryptoService';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/formatters';

// Fiat currencies offered in the FX modal — deliberately a NARROW subset of the fiat codes
// swapMarkup.service.js recognizes on the backend (that set is broader, for direction-math
// correctness on any pair). The markup feature currently only works against Obiex swap, and NGN/
// GHS are the only fiat rails actually live there, so the dropdown is restricted to just those
// two to avoid admins configuring rates for currencies that can't actually swap yet.
// Deliberately NOT sourced from /crypto/supported: that endpoint reflects Obiex's tradeable
// *token* catalog (e.g. it lists a synthetic "NGNX" token, not the real NGN fiat rail — pulling
// fiat options from it silently dropped plain NGN from the dropdown). Only the crypto side of the
// dropdown comes from the live API; fiat is always this fixed list.
const FIAT_CURRENCIES = [
    { code: 'NGN', name: 'Nigerian Naira' },
    { code: 'GHS', name: 'Ghanaian Cedi' },
];

// Last-resort crypto list if /crypto/supported can't be reached.
const FALLBACK_CRYPTOS = [
    { code: 'BTC', name: 'Bitcoin', type: 'crypto' },
    { code: 'ETH', name: 'Ethereum', type: 'crypto' },
    { code: 'USDT', name: 'Tether', type: 'crypto' },
];

// "Base" is always quoted as the price of whichever side of the pair is crypto, expressed in the
// other currency (e.g. USDT/NGN and NGN/USDT both show "1 USDT = X NGN") — mirrors the convention
// in swapMarkup.service.js's getSwapBaseRate/isInverseDirection so the admin preview always matches
// what the live swap engine actually does with the rate.
const isInverseDirection = (from, to, fiatCodes) =>
    fiatCodes.has(String(from || '').toUpperCase()) && !fiatCodes.has(String(to || '').toUpperCase());

const priceOfCode = (from, to, fiatCodes) => (isInverseDirection(from, to, fiatCodes) ? to : from);
const priceInCode = (from, to, fiatCodes) => (isInverseDirection(from, to, fiatCodes) ? from : to);

const computeCustomerRate = (rate, markupPct) => {
    const r = Number(rate);
    if (!r || Number.isNaN(r)) return null;
    const m = Number(markupPct) || 0;
    return r * (1 + m / 100);
};

// True when the configured markup would make the customer's rate BETTER than Obiex's raw rate
// (JAXOPAY losing money) — mirrors isMarkupBackwards in swapMarkup.service.js, used here only to
// warn the admin before they save a backwards-signed pair.
const isBackwardsMarkup = (from, to, markupPct, fiatCodes) => {
    const m = Number(markupPct) || 0;
    if (!m || !from || !to || from === to) return false;
    return isInverseDirection(from, to, fiatCodes) ? m < 0 : m > 0;
};

const SystemManagement = () => {
    const [searchParams] = useSearchParams();
    const { user } = useAuthStore();
    // Finance has no backend access to /system/orchestration or /system/shutdown (both are
    // admin/super_admin-only — see admin.routes.js), so they're locked to Rates & Fees.
    const isFinanceOnly = user?.role === 'finance';
    // Allows deep-linking straight into the Rates & Fees tab (e.g. from the sidebar) instead of
    // always landing on 'general' and requiring an extra click to find fee configuration.
    const [activeTab, setActiveTab] = useState(
        isFinanceOnly || searchParams.get('tab') === 'rates_fees' ? 'rates_fees' : 'general'
    );
    const [exchangeRates, setExchangeRates] = useState([]);
    const [feeConfigs, setFeeConfigs] = useState([]);
    const [supportedCurrencies, setSupportedCurrencies] = useState([]);
    const [isGlobalShutdown, setIsGlobalShutdown] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // 'fx', 'fees', 'system'
    const [message, setMessage] = useState(null);
    const [orchestrationStatus, setOrchestrationStatus] = useState([]);
    const [statusLoading, setStatusLoading] = useState(false);

    // Create Modal States
    const [showFXModal, setShowFXModal] = useState(false);
    const [showFeeModal, setShowFeeModal] = useState(false);
    const [newFX, setNewFX] = useState({ from_currency: 'USDT', to_currency: 'NGN', rate: 0, markup_percentage: 0 });
    const [newFee, setNewFee] = useState({ transaction_type: 'transfer', fee_type: 'fixed', fee_value: 0, min_fee: 0, max_fee: 0, currency: 'USD', country: '' });
    // Live "Base" rate fetch state for the Add Exchange Rate modal — refetched whenever the
    // selected pair changes so the admin always sees what Obiex is quoting right now.
    const [liveBase, setLiveBase] = useState({ loading: false, error: null });
    const [liveBaseRefreshKey, setLiveBaseRefreshKey] = useState(0);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [fxRes, feeRes, toggleRes, cryptoRes] = await Promise.all([
            adminService.getExchangeRates(),
            adminService.getFeeConfigs(),
            adminService.getFeatureToggles(),
            cryptoService.getSupportedCryptos()
        ]);

        if (fxRes.success) setExchangeRates(fxRes.data || []);
        if (feeRes.success) setFeeConfigs(feeRes.data || []);
        if (cryptoRes.success) setSupportedCurrencies(cryptoRes.data || []);

        const platformToggle = toggleRes.data?.find(t => t.feature_name === 'PLATFORM_GLOBAL');
        setIsGlobalShutdown(platformToggle ? !platformToggle.is_enabled : false);

        if (!isFinanceOnly) fetchOrchestrationStatus();
        setLoading(false);
    };

    // All swap-supported currencies (crypto from the live API + the fixed fiat rail list above),
    // sorted crypto-first so the admin sees the coins that actually matter for swap markup at the
    // top of each dropdown.
    const currencyOptions = useMemo(() => {
        const cryptoList = supportedCurrencies.length
            ? supportedCurrencies.filter(c => c.type === 'crypto')
            : FALLBACK_CRYPTOS;
        const fiatList = FIAT_CURRENCIES.map(c => ({ ...c, type: 'fiat' }));
        const dedup = Array.from(new Map([...cryptoList, ...fiatList].map(c => [c.code, c])).values());
        return dedup.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'crypto' ? -1 : 1;
            return a.code.localeCompare(b.code);
        });
    }, [supportedCurrencies]);

    const fiatCodes = useMemo(() => new Set(FIAT_CURRENCIES.map(c => c.code)), []);

    // Auto-fetch the live Obiex "Base" rate whenever the modal is open and a valid, distinct
    // pair is selected — this is what lets the admin just type a markup instead of hand-entering
    // a rate that's already changing by the second.
    useEffect(() => {
        if (!showFXModal) return;
        const from = newFX.from_currency;
        const to = newFX.to_currency;
        // Same-currency pair: nothing to fetch. The modal already hides the Base Rate section in
        // this case (see `samePair` below), so there's no stale loading/error state to clear.
        if (!from || !to || from === to) return;
        let cancelled = false;
        const fetchLiveBase = async () => {
            setLiveBase({ loading: true, error: null });
            const result = await adminService.getLiveFxBaseRate(from, to);
            if (cancelled) return;
            if (result.success) {
                const base = result.data?.base_rate;
                setLiveBase({ loading: false, error: null });
                setNewFX(prev => ({ ...prev, rate: base }));
            } else {
                setLiveBase({ loading: false, error: result.error });
            }
        };
        fetchLiveBase();
        return () => { cancelled = true; };
    }, [showFXModal, newFX.from_currency, newFX.to_currency, liveBaseRefreshKey]);

    const fetchOrchestrationStatus = async () => {
        setStatusLoading(true);
        const result = await adminService.getOrchestrationStatus();
        if (result.success) {
            setOrchestrationStatus(result.data || []);
        }
        setStatusLoading(false);
    };

    const handleUpdateFX = async (rateId, data) => {
        setSaving(`fx-${rateId}`);
        const result = await adminService.updateExchangeRate(rateId, data);
        if (result.success) {
            setMessage({ type: 'success', text: 'FX rate updated successfully' });
            fetchData();
        } else {
            setMessage({ type: 'error', text: result.error });
        }
        setSaving(null);
    };

    const handleUpdateFee = async (feeId, data) => {
        setSaving(`fee-${feeId}`);
        const result = await adminService.updateFeeConfig(feeId, data);
        if (result.success) {
            setMessage({ type: 'success', text: 'Fee configuration updated successfully' });
            fetchData();
        } else {
            setMessage({ type: 'error', text: result.error });
        }
        setSaving(null);
    };

    const handleEmergencyToggle = async () => {
        const confirmMsg = isGlobalShutdown
            ? "Are you sure you want to RESTORE platform access? This will enable all services."
            : "⚠️ EMERGENCY: Are you sure you want to SHUT DOWN the platform? This will block all user access.";

        if (!window.confirm(confirmMsg)) return;

        setSaving('system');
        const result = await adminService.toggleEmergencyShutdown(!isGlobalShutdown);
        if (result.success) {
            setIsGlobalShutdown(!isGlobalShutdown);
            setMessage({ type: 'success', text: result.message });
        } else {
            setMessage({ type: 'error', text: result.error });
        }
        setSaving(null);
    };

    const handleCreateFX = async () => {
        setSaving('create-fx');
        const result = await adminService.createExchangeRate(newFX);
        if (result.success) {
            setMessage({ type: 'success', text: 'New FX rate created successfully' });
            setShowFXModal(false);
            setNewFX({ from_currency: 'USDT', to_currency: 'NGN', rate: 0, markup_percentage: 0 }); // Reset
            fetchData();
        } else {
            setMessage({ type: 'error', text: result.error });
        }
        setSaving(null);
    };

    const handleCreateFee = async () => {
        setSaving('create-fee');
        const result = await adminService.createFeeConfig(newFee);
        if (result.success) {
            setMessage({ type: 'success', text: 'New fee configuration created successfully' });
            setShowFeeModal(false);
            setNewFee({ transaction_type: 'transfer', fee_type: 'fixed', fee_value: 0, min_fee: 0, max_fee: 0, currency: 'USD', country: '' }); // Reset
            fetchData();
        } else {
            setMessage({ type: 'error', text: result.error });
        }
        setSaving(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-20">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Configurations</h1>
                        <p className="text-gray-600 dark:text-gray-400">Manage platform-wide financial and operational settings</p>
                    </div>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-gray-900 font-medium rounded-lg transition-colors self-start sm:self-auto"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
                    {!isFinanceOnly && (
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'general'
                                ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            General Status
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('rates_fees')}
                        className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'rates_fees'
                            ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                    >
                        Rates & Fees
                    </button>
                </div>
            </div>

            {message && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                >
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    <span className="font-medium">{message.text}</span>
                    <button onClick={() => setMessage(null)} className="ml-auto text-sm opacity-70 hover:opacity-100 uppercase tracking-tighter">Dismiss</button>
                </motion.div>
            )}

            {activeTab === 'general' ? (
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-8"
                >
                    {/* Emergency Controls - SUPER ADMIN ONLY */}
                    {user?.role === 'super_admin' && (
                        <section className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-2xl p-6 shadow-sm">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                                    <ShieldAlert className="w-6 h-6 text-red-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-red-900 dark:text-red-200">Emergency Global Controls</h2>
                                    <p className="text-red-700 dark:text-red-400 text-sm">Caution: These actions affect all users worldwide.</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-red-100 dark:border-red-900/30">
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white">Platform Global Access</p>
                                    <p className="text-sm text-gray-500">Currently: {isGlobalShutdown ? <span className="text-red-600 font-bold uppercase">OFFLINE</span> : <span className="text-primary-600 font-bold uppercase">OPERATIONAL</span>}</p>
                                </div>
                                <button
                                    onClick={handleEmergencyToggle}
                                    disabled={saving === 'system'}
                                    className={`px-6 py-2.5 rounded-xl font-bold transition-all ${isGlobalShutdown
                                        ? 'bg-primary-600 hover:bg-primary-700 text-gray-900 shadow-lg shadow-primary-200'
                                        : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200'
                                        }`}
                                >
                                    {saving === 'system' ? 'Processing...' : (isGlobalShutdown ? 'Restore Access' : 'Emergency Shutdown')}
                                </button>
                            </div>
                        </section>
                    )}

                    {/* Orchestration Hub */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Cpu className="w-5 h-5 text-primary-500" />
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Orchestration Hub</h2>
                            </div>
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-bold rounded-lg uppercase">Multi-API Layer Active</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {orchestrationStatus.length === 0 ? (
                                <div className="col-span-3 text-center py-8 text-gray-500">Initializing orchestration registry...</div>
                            ) : orchestrationStatus.map(domain => (
                                <div key={domain.type} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600 transition-hover hover:border-primary-500/50">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                        <Network className="w-3.5 h-3.5" />
                                        {domain.type} Services
                                    </h3>
                                    <div className="space-y-2">
                                        {domain.adapters.map(adapter => (
                                            <div key={adapter.name} className="p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-600 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize truncate">{adapter.name.replace(/_/g, ' ')}</span>
                                                        {adapter.role && (
                                                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${adapter.role === 'primary' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>{adapter.role}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${adapter.status === 'active' ? 'bg-green-500 animate-pulse' : adapter.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} />
                                                        <span className={`text-[10px] font-bold uppercase ${adapter.status === 'active' ? 'text-green-600' : adapter.status === 'degraded' ? 'text-amber-600' : 'text-red-600'}`}>{adapter.status === 'active' ? 'OK' : adapter.status === 'degraded' ? 'DEGRADED' : 'INACTIVE'}</span>
                                                    </div>
                                                </div>
                                                {adapter.features?.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {adapter.features.map(f => (
                                                            <span key={f} className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-1.5 py-0.5 rounded">{f}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </motion.div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-8"
                >
                    {/* FX Rates */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <DollarSign className="w-5 h-5 text-blue-500" />
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">FX Rates & Markups</h2>
                            </div>
                            <button
                                onClick={() => setShowFXModal(true)}
                                className="p-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            {exchangeRates.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 bg-gray-50 dark:bg-gray-900/20 rounded-xl border border-dashed border-gray-200">
                                    No FX rates configured.
                                </div>
                            ) : exchangeRates.map(rate => {
                                const backwards = isBackwardsMarkup(rate.from_currency, rate.to_currency, rate.markup_percentage, fiatCodes);
                                const customerRate = rate.final_rate ?? computeCustomerRate(rate.rate, rate.markup_percentage);
                                return (
                                <div key={rate.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-bold text-gray-900 dark:text-white uppercase">{rate.from_currency} → {rate.to_currency}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] text-gray-400">UP: {new Date(rate.updated_at).toLocaleDateString()}</span>
                                            <button
                                                onClick={() => handleUpdateFX(rate.id, { is_active: !rate.is_active })}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${rate.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                            >
                                                {rate.is_active ? 'Active' : 'Inactive'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mb-3 px-3 py-2 bg-primary-50 dark:bg-primary-900/10 rounded-lg border border-primary-100 dark:border-primary-900/20">
                                        <span className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase">Customer Rate</span>
                                        <span className="text-sm font-bold text-primary-800 dark:text-primary-200">
                                            {customerRate != null ? `1 ${priceOfCode(rate.from_currency, rate.to_currency, fiatCodes)} = ${Number(customerRate).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${priceInCode(rate.from_currency, rate.to_currency, fiatCodes)}` : '—'}
                                        </span>
                                    </div>
                                    {backwards && (
                                        <div className="flex items-center gap-1.5 mb-3 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            Markup sign looks backwards — this pair gives customers a better rate than Obiex.
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="relative">
                                            <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">Base Rate</label>
                                            <input
                                                type="number"
                                                defaultValue={rate.rate}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm pr-10 focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFX(rate.id, { rate: parseFloat(e.target.value) })}
                                            />
                                            <Save className="w-3 h-3 absolute right-3 bottom-3 text-gray-300" />
                                        </div>
                                        <div className="relative">
                                            <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">Markup (%)</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                defaultValue={rate.markup_percentage}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm pr-10 focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFX(rate.id, { markup_percentage: parseFloat(e.target.value) })}
                                            />
                                            <Save className="w-3 h-3 absolute right-3 bottom-3 text-gray-300" />
                                        </div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Fees */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Percent className="w-5 h-5 text-purple-500" />
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Fee Configuration</h2>
                            </div>
                            <button
                                onClick={() => setShowFeeModal(true)}
                                className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            {feeConfigs.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 bg-gray-50 dark:bg-gray-900/20 rounded-xl border border-dashed border-gray-200">
                                    No fee configs found.
                                </div>
                            ) : feeConfigs.map(fee => (
                                <div key={fee.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="min-w-0">
                                            <span className="font-bold text-gray-900 dark:text-white uppercase truncate max-w-[150px] block">{fee.transaction_type.replace(/_/g, ' ')}</span>
                                            <span className="text-[10px] font-bold text-primary-500 uppercase">{(fee.fee_type || '').replace(/_/g, ' ') || 'fixed'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">{fee.country || 'GLOBAL'} / {fee.currency || 'USD'}</span>
                                            <button
                                                onClick={() => handleUpdateFee(fee.id, { is_active: !fee.is_active })}
                                                className={`w-3.5 h-3.5 rounded-full transition-all ${fee.is_active ? 'bg-primary-500 shadow-sm shadow-primary-500/50' : 'bg-gray-300'}`}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="relative">
                                            <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">{fee.fee_type === 'fixed' ? 'Amount' : 'Percent %'}</label>
                                            <input
                                                type="number"
                                                defaultValue={fee.fee_value}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFee(fee.id, { fee_value: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div className="relative">
                                            <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">{fee.fee_type === 'flat_plus_percent' ? 'Flat $' : 'Min'}</label>
                                            <input
                                                type="number"
                                                defaultValue={fee.min_fee}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFee(fee.id, { min_fee: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div className="relative">
                                            <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">{fee.fee_type === 'flat_plus_percent' ? 'Cap' : 'Max'}</label>
                                            <input
                                                type="number"
                                                defaultValue={fee.max_fee}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFee(fee.id, { max_fee: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section >
                </motion.div >
            )}

            {/* Create FX Modal */}
            {showFXModal && (() => {
                const from = newFX.from_currency;
                const to = newFX.to_currency;
                const samePair = from === to;
                const customerRatePreview = computeCustomerRate(newFX.rate, newFX.markup_percentage);
                const backwards = isBackwardsMarkup(from, to, newFX.markup_percentage, fiatCodes);
                const buyingCryptoWithFiat = isInverseDirection(from, to, fiatCodes);
                return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowFXModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-1 dark:text-white">Add Exchange Rate</h3>
                        <p className="text-xs text-gray-500 mb-4">Pick any swap-supported pair — the Base rate is fetched live from Obiex, you just set the markup.</p>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">From</label>
                                    <select
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={from}
                                        onChange={e => setNewFX({ ...newFX, from_currency: e.target.value })}
                                    >
                                        <optgroup label="Crypto">
                                            {currencyOptions.filter(c => c.type === 'crypto').map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                        </optgroup>
                                        <optgroup label="Fiat">
                                            {currencyOptions.filter(c => c.type === 'fiat').map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                        </optgroup>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">To</label>
                                    <select
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={to}
                                        onChange={e => setNewFX({ ...newFX, to_currency: e.target.value })}
                                    >
                                        <optgroup label="Crypto">
                                            {currencyOptions.filter(c => c.type === 'crypto').map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                        </optgroup>
                                        <optgroup label="Fiat">
                                            {currencyOptions.filter(c => c.type === 'fiat').map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>

                            {samePair ? (
                                <div className="text-xs text-amber-600 font-medium">From and To must be different currencies.</div>
                            ) : (
                                <>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs uppercase font-bold text-gray-500 block">
                                                Base Rate {liveBase.loading ? '(fetching from Obiex…)' : !liveBase.error ? '(live from Obiex)' : ''}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setLiveBaseRefreshKey(k => k + 1)}
                                                disabled={liveBase.loading}
                                                className="text-primary-600 hover:text-primary-700 disabled:opacity-50"
                                                title="Refresh live rate"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${liveBase.loading ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                        <input
                                            type="number"
                                            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                            value={newFX.rate}
                                            onChange={e => setNewFX({ ...newFX, rate: parseFloat(e.target.value) })}
                                        />
                                        <p className="text-[10px] text-gray-400 mt-1">
                                            1 {priceOfCode(from, to, fiatCodes)} = X {priceInCode(from, to, fiatCodes)}. Auto-filled, but you can override manually.
                                        </p>
                                        {liveBase.error && (
                                            <p className="text-[10px] text-red-500 mt-1">Live fetch failed: {liveBase.error}. Enter the Base rate manually.</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Markup (%)</label>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                            value={newFX.markup_percentage}
                                            onChange={e => setNewFX({ ...newFX, markup_percentage: parseFloat(e.target.value) })}
                                        />
                                        <p className="text-[10px] text-gray-400 mt-1">
                                            {buyingCryptoWithFiat
                                                ? `Customer is buying ${priceOfCode(from, to, fiatCodes)} with ${from} — use a positive markup to earn margin.`
                                                : `Customer is selling ${priceOfCode(from, to, fiatCodes)} — use a negative markup to earn margin.`}
                                        </p>
                                    </div>

                                    <div className="p-3 bg-primary-50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/20">
                                        <span className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase block mb-1">JAXOPAY Customer Rate</span>
                                        <span className="text-lg font-bold text-primary-800 dark:text-primary-200">
                                            {customerRatePreview != null
                                                ? `1 ${priceOfCode(from, to, fiatCodes)} = ${customerRatePreview.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${priceInCode(from, to, fiatCodes)}`
                                                : '—'}
                                        </span>
                                    </div>
                                    {backwards && (
                                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/20 rounded-xl">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                                This markup sign looks backwards — it would give customers a better rate than Obiex, meaning JAXOPAY loses money on this pair. Double-check the sign before saving.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            <button
                                onClick={handleCreateFX}
                                disabled={saving === 'create-fx' || samePair}
                                className="w-full py-3 bg-primary-600 text-gray-900 font-bold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
                            >
                                {saving === 'create-fx' ? 'Creating...' : 'Create Rate'}
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* Create Fee Modal */}
            {showFeeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowFeeModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 dark:text-white">Add Fee Configuration</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Transaction Type</label>
                                <select
                                    className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                    value={newFee.transaction_type}
                                    onChange={e => setNewFee({ ...newFee, transaction_type: e.target.value })}
                                >
                                    {['transfer', 'withdrawal', 'exchange', 'bill_payment', 'card_creation', 'card_funding'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Fee Type</label>
                                    <select
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={newFee.fee_type}
                                        onChange={e => setNewFee({ ...newFee, fee_type: e.target.value })}
                                    >
                                        <option value="fixed">Fixed</option>
                                        <option value="percentage">Percentage</option>
                                        <option value="flat_plus_percent">Flat + Percentage</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">{newFee.fee_type === 'fixed' ? 'Amount ($)' : 'Percentage (%)'}</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={newFee.fee_value}
                                        onChange={e => setNewFee({ ...newFee, fee_value: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">{newFee.fee_type === 'flat_plus_percent' ? 'Flat fee ($)' : 'Min Fee'}</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={newFee.min_fee}
                                        onChange={e => setNewFee({ ...newFee, min_fee: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">{newFee.fee_type === 'flat_plus_percent' ? 'Cap ($, 0 = none)' : 'Max Fee'}</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={newFee.max_fee}
                                        onChange={e => setNewFee({ ...newFee, max_fee: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleCreateFee}
                                disabled={saving === 'create-fee'}
                                className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors"
                            >
                                {saving === 'create-fee' ? 'Creating...' : 'Create Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default SystemManagement;
