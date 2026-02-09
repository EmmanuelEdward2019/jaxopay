import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ToggleLeft,
    ToggleRight,
    Globe,
    Settings,
    AlertTriangle,
    RefreshCw,
    ShieldAlert,
    Check,
    X
} from 'lucide-react';
import adminService from '../../services/adminService';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';

const FeatureManagement = () => {
    const [toggles, setToggles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [selectedToggle, setSelectedToggle] = useState(null);
    const { fetchFeatureToggles } = useAppStore();
    const { user } = useAuthStore();

    useEffect(() => {
        fetchToggles();
    }, []);

    const fetchToggles = async () => {
        setLoading(true);
        const result = await adminService.getFeatureToggles();
        if (result.success) {
            setToggles(result.data || []);
        }
        setLoading(false);
    };

    const handleToggle = async (featureId, currentStatus, featureName) => {
        if (user?.role !== 'super_admin') {
            alert('Only Super Admins can modify feature toggles.');
            return;
        }

        setActionLoading(featureId);
        const result = await adminService.updateFeatureToggle(featureId, {
            is_enabled: !currentStatus
        });

        if (result.success) {
            // Update local state
            setToggles(prev => prev.map(t =>
                t.id === featureId ? { ...t, is_enabled: !currentStatus } : t
            ));
            // Refresh global app toggles
            await fetchFeatureToggles();
        }
        setActionLoading(null);
    };

    if (user?.role !== 'super_admin' && user?.role !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Access Denied</h2>
                <p className="text-gray-600 dark:text-gray-400">You do not have permission to view this page.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Feature Management</h1>
                    <p className="text-gray-600 dark:text-gray-400">Control platform features globally</p>
                </div>
                <button
                    onClick={fetchToggles}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {user?.role !== 'super_admin' && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Read-Only Access</h3>
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                            Only Super Admins can modify feature toggles. Standard Admins have view-only access.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
                            <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                            <div className="h-4 w-48 bg-gray-100 dark:bg-gray-700 rounded mb-6"></div>
                            <div className="h-10 w-full bg-gray-50 dark:bg-gray-700 rounded"></div>
                        </div>
                    ))
                ) : (
                    toggles.map((toggle) => (
                        <div key={toggle.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                                    {toggle.feature_name.replace('_', ' ')}
                                </h3>
                                <button
                                    onClick={() => setSelectedToggle(toggle)}
                                    className={`p-2 rounded-lg transition-colors ${toggle.is_enabled ? 'bg-primary-100 text-primary-600 hover:bg-primary-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                            </div>

                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                {toggle.is_enabled
                                    ? `This feature is currently ACTIVE for all users.`
                                    : `This feature is currently DISABLED platform-wide.`}
                            </p>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <Globe className="w-4 h-4" />
                                    Global
                                </div>
                                <button
                                    onClick={() => handleToggle(toggle.id, toggle.is_enabled, toggle.feature_name)}
                                    disabled={actionLoading === toggle.id || user?.role !== 'super_admin'}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${toggle.is_enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${toggle.is_enabled ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                    {actionLoading === toggle.id && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-full">
                                            <RefreshCw className="w-3 h-3 animate-spin text-white" />
                                        </div>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <AnimatePresence>
                {selectedToggle && (
                    <FeatureConfigModal
                        toggle={selectedToggle}
                        onClose={() => setSelectedToggle(null)}
                        onUpdate={(updatedDoc) => {
                            setToggles(prev => prev.map(t => t.id === updatedDoc.id ? updatedDoc : t));
                            setSelectedToggle(null);
                        }}
                    />
                )}
            </AnimatePresence>

            {
                !loading && toggles.length === 0 && (
                    <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No feature toggles found</h3>
                        <p className="text-gray-500">Feature toggles have not been initialized in the database.</p>
                    </div>
                )
            }
        </div >
    );
};

const FeatureConfigModal = ({ toggle, onClose, onUpdate }) => {
    const [config, setConfig] = useState(JSON.stringify(toggle.config || {}, null, 2));
    const [enabledCountries, setEnabledCountries] = useState(toggle.enabled_countries?.join(', ') || '');
    const [disabledCountries, setDisabledCountries] = useState(toggle.disabled_countries?.join(', ') || '');
    const [saving, setSaving] = useState(false);
    const { user } = useAuthStore();

    const handleSave = async () => {
        setSaving(true);
        try {
            const result = await adminService.updateFeatureToggle(toggle.id, {
                enabled_countries: enabledCountries.split(',').map(c => c.trim()).filter(Boolean),
                disabled_countries: disabledCountries.split(',').map(c => c.trim()).filter(Boolean),
                config: JSON.parse(config)
            });

            if (result.success) {
                onUpdate(result.data);
            } else {
                alert(result.error || 'Failed to update configuration');
            }
        } catch (e) {
            alert('Invalid JSON config: ' + e.message);
        }
        setSaving(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white capitalize">
                            Configure {toggle.feature_name.replace('_', ' ')}
                        </h2>
                        <p className="text-sm text-gray-500">Advanced settings and regional controls</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider text-[10px]">
                                Enabled Countries (ISO Codes)
                            </label>
                            <input
                                type="text"
                                value={enabledCountries}
                                onChange={(e) => setEnabledCountries(e.target.value)}
                                placeholder="US, NG, GB..."
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Leave empty for ALL countries</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider text-[10px]">
                                Disabled Countries (Blacklist)
                            </label>
                            <input
                                type="text"
                                value={disabledCountries}
                                onChange={(e) => setDisabledCountries(e.target.value)}
                                placeholder="KP, SY, IR..."
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider text-[10px]">
                            Feature JSON Config
                        </label>
                        <div className="relative">
                            <textarea
                                value={config}
                                onChange={(e) => setConfig(e.target.value)}
                                rows={6}
                                className="w-full px-4 py-3 bg-gray-900 text-green-400 font-mono text-xs rounded-xl border border-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
                            />
                            <div className="absolute top-2 right-2 px-2 py-1 bg-gray-800 text-[10px] text-gray-500 rounded uppercase font-bold">JSON</div>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || user?.role !== 'super_admin'}
                            className="flex-1 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-200 dark:shadow-none disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default FeatureManagement;
