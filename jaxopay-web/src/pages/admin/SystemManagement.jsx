import { useState, useEffect } from 'react';
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
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/formatters';

const SystemManagement = () => {
    const [activeTab, setActiveTab] = useState('general'); // 'general', 'rates_fees'
    const [exchangeRates, setExchangeRates] = useState([]);
    const [feeConfigs, setFeeConfigs] = useState([]);
    const [isGlobalShutdown, setIsGlobalShutdown] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // 'fx', 'fees', 'system'
    const [message, setMessage] = useState(null);
    const [orchestrationStatus, setOrchestrationStatus] = useState([]);
    const [statusLoading, setStatusLoading] = useState(false);

    // Create Modal States
    const [showFXModal, setShowFXModal] = useState(false);
    const [showFeeModal, setShowFeeModal] = useState(false);
    const [newFX, setNewFX] = useState({ from_currency: 'USD', to_currency: 'NGN', rate: 0, markup_percentage: 0 });
    const [newFee, setNewFee] = useState({ transaction_type: 'transfer', fee_type: 'fixed', fee_value: 0, min_fee: 0, max_fee: 0, currency: 'USD', country: '' });

    const { user } = useAuthStore();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [fxRes, feeRes, toggleRes] = await Promise.all([
            adminService.getExchangeRates(),
            adminService.getFeeConfigs(),
            adminService.getFeatureToggles()
        ]);

        if (fxRes.success) setExchangeRates(fxRes.data || []);
        if (feeRes.success) setFeeConfigs(feeRes.data || []);

        const platformToggle = toggleRes.data?.find(t => t.feature_name === 'PLATFORM_GLOBAL');
        setIsGlobalShutdown(platformToggle ? !platformToggle.is_enabled : false);

        fetchOrchestrationStatus();
        setLoading(false);
    };

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
            setNewFX({ from_currency: 'USD', to_currency: 'NGN', rate: 0, markup_percentage: 0 }); // Reset
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
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Configurations</h1>
                        <p className="text-gray-600 dark:text-gray-400">Manage platform-wide financial and operational settings</p>
                    </div>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'general'
                            ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                    >
                        General Status
                    </button>
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
                                        ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-200'
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
                                            <div key={adapter.name} className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-600 shadow-sm">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{adapter.name}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                    <span className="text-[10px] font-bold text-green-600 uppercase">Status: OK</span>
                                                </div>
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
                            ) : exchangeRates.map(rate => (
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
                                                defaultValue={rate.markup_percentage}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm pr-10 focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFX(rate.id, { markup_percentage: parseFloat(e.target.value) })}
                                            />
                                            <Save className="w-3 h-3 absolute right-3 bottom-3 text-gray-300" />
                                        </div>
                                    </div>
                                </div>
                            ))}
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
                                        <span className="font-bold text-gray-900 dark:text-white uppercase truncate max-w-[150px]">{fee.transaction_type.replace(/_/g, ' ')}</span>
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
                                            <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Value</label>
                                            <input
                                                type="number"
                                                defaultValue={fee.fee_value}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFee(fee.id, { fee_value: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div className="relative">
                                            <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Min</label>
                                            <input
                                                type="number"
                                                defaultValue={fee.min_fee}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                                                onBlur={(e) => handleUpdateFee(fee.id, { min_fee: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div className="relative">
                                            <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Max</label>
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
            {showFXModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowFXModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 dark:text-white">Add Exchange Rate</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">From</label>
                                    <select
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={newFX.from_currency}
                                        onChange={e => setNewFX({ ...newFX, from_currency: e.target.value })}
                                    >
                                        {['USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">To</label>
                                    <select
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={newFX.to_currency}
                                        onChange={e => setNewFX({ ...newFX, to_currency: e.target.value })}
                                    >
                                        {['NGN', 'GHS', 'KES', 'ZAR', 'CNY'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Base Rate</label>
                                <input
                                    type="number"
                                    className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                    value={newFX.rate}
                                    onChange={e => setNewFX({ ...newFX, rate: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Markup (%)</label>
                                <input
                                    type="number"
                                    className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                    value={newFX.markup_percentage}
                                    onChange={e => setNewFX({ ...newFX, markup_percentage: parseFloat(e.target.value) })}
                                />
                            </div>
                            <button
                                onClick={handleCreateFX}
                                disabled={saving === 'create-fx'}
                                className="w-full py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors"
                            >
                                {saving === 'create-fx' ? 'Creating...' : 'Create Rate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                    {['transfer', 'withdrawal', 'exchange', 'bill_payment', 'card_funding'].map(t => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
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
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Value</label>
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
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Min Fee</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 text-gray-900 dark:text-white"
                                        value={newFee.min_fee}
                                        onChange={e => setNewFee({ ...newFee, min_fee: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Max Fee</label>
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
