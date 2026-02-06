import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Settings as SettingsIcon,
    User,
    Shield,
    Bell,
    Smartphone,
    Moon,
    Sun,
    Globe,
    Key,
    Lock,
    LogOut,
    Trash2,
    ChevronRight,
    Check,
    Eye,
    EyeOff,
    X,
    AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import authService from '../../services/authService';

const Settings = () => {
    const { user, logout } = useAuthStore();
    const { theme, setTheme } = useAppStore();
    const [activeSection, setActiveSection] = useState('general');
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [show2FAModal, setShow2FAModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Notification preferences
    const [notifications, setNotifications] = useState({
        email_transactions: true,
        email_security: true,
        email_marketing: false,
        push_transactions: true,
        push_security: true,
    });

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        const result = await authService.getSessions();
        if (result.success) {
            setSessions(result.data.sessions || []);
        }
    };

    const handleLogoutAll = async () => {
        setLoading(true);
        const result = await authService.logoutAll();
        if (result.success) {
            setSuccess('All other sessions have been logged out');
            await fetchSessions();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const settingsSections = [
        { id: 'general', label: 'General', icon: SettingsIcon },
        { id: 'security', label: 'Security', icon: Shield },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'devices', label: 'Devices & Sessions', icon: Smartphone },
    ];

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                <p className="text-gray-600 dark:text-gray-400">Manage your account preferences</p>
            </div>

            {/* Alerts */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}
            {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-green-700 dark:text-green-300">{success}</p>
                    <button onClick={() => setSuccess(null)} className="text-green-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar */}
                <div className="lg:col-span-1">
                    <div className="card p-2">
                        {settingsSections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeSection === section.id
                                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                <section.icon className="w-5 h-5" />
                                <span className="font-medium">{section.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="lg:col-span-3">
                    {/* General Settings */}
                    {activeSection === 'general' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="card"
                        >
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">General Settings</h2>

                            {/* Theme */}
                            <div className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    {theme === 'dark' ? <Moon className="w-5 h-5 text-gray-500" /> : <Sun className="w-5 h-5 text-gray-500" />}
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Theme</p>
                                        <p className="text-sm text-gray-500">Choose your preferred appearance</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${theme === 'light' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-600 dark:text-gray-400'
                                            }`}
                                    >
                                        Light
                                    </button>
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-600 dark:text-gray-400'
                                            }`}
                                    >
                                        Dark
                                    </button>
                                </div>
                            </div>

                            {/* Language */}
                            <div className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <Globe className="w-5 h-5 text-gray-500" />
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Language</p>
                                        <p className="text-sm text-gray-500">Select your preferred language</p>
                                    </div>
                                </div>
                                <select className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                                    <option value="en">English</option>
                                    <option value="fr">French</option>
                                    <option value="es">Spanish</option>
                                </select>
                            </div>

                            {/* Display Balance */}
                            <div className="flex items-center justify-between py-4">
                                <div className="flex items-center gap-3">
                                    <Eye className="w-5 h-5 text-gray-500" />
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">Show Balances</p>
                                        <p className="text-sm text-gray-500">Display wallet balances on dashboard</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" defaultChecked className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                </label>
                            </div>
                        </motion.div>
                    )}

                    {/* Security Settings */}
                    {activeSection === 'security' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="card"
                        >
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Security Settings</h2>

                            {/* Change Password */}
                            <button
                                onClick={() => setShowPasswordModal(true)}
                                className="w-full flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-6 px-6 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Key className="w-5 h-5 text-gray-500" />
                                    <div className="text-left">
                                        <p className="font-medium text-gray-900 dark:text-white">Change Password</p>
                                        <p className="text-sm text-gray-500">Update your password regularly for security</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                            </button>

                            {/* Two-Factor Authentication */}
                            <button
                                onClick={() => setShow2FAModal(true)}
                                className="w-full flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-6 px-6 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Shield className="w-5 h-5 text-gray-500" />
                                    <div className="text-left">
                                        <p className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
                                        <p className="text-sm text-gray-500">Add an extra layer of security</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                                        Not Enabled
                                    </span>
                                    <ChevronRight className="w-5 h-5 text-gray-400" />
                                </div>
                            </button>

                            {/* Logout All */}
                            <button
                                onClick={handleLogoutAll}
                                disabled={loading}
                                className="w-full flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-6 px-6 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <LogOut className="w-5 h-5 text-gray-500" />
                                    <div className="text-left">
                                        <p className="font-medium text-gray-900 dark:text-white">Logout All Devices</p>
                                        <p className="text-sm text-gray-500">Sign out from all other devices</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                            </button>

                            {/* Delete Account */}
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="w-full flex items-center justify-between py-4 hover:bg-red-50 dark:hover:bg-red-900/20 -mx-6 px-6 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Trash2 className="w-5 h-5 text-red-500" />
                                    <div className="text-left">
                                        <p className="font-medium text-red-600">Delete Account</p>
                                        <p className="text-sm text-gray-500">Permanently delete your account and data</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-red-400" />
                            </button>
                        </motion.div>
                    )}

                    {/* Notifications Settings */}
                    {activeSection === 'notifications' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="card"
                        >
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Notification Preferences</h2>

                            <div className="space-y-1">
                                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Email Notifications</h3>
                                {[
                                    { key: 'email_transactions', label: 'Transaction updates', desc: 'Receive emails for all transactions' },
                                    { key: 'email_security', label: 'Security alerts', desc: 'Get notified about security events' },
                                    { key: 'email_marketing', label: 'Marketing', desc: 'Receive promotional emails and offers' },
                                ].map((item) => (
                                    <div key={item.key} className="flex items-center justify-between py-3">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                                            <p className="text-sm text-gray-500">{item.desc}</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={notifications[item.key]}
                                                onChange={() => setNotifications({ ...notifications, [item.key]: !notifications[item.key] })}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 mt-6 pt-6 space-y-1">
                                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Push Notifications</h3>
                                {[
                                    { key: 'push_transactions', label: 'Transaction alerts', desc: 'Instant push for transactions' },
                                    { key: 'push_security', label: 'Security alerts', desc: 'Push notifications for security events' },
                                ].map((item) => (
                                    <div key={item.key} className="flex items-center justify-between py-3">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                                            <p className="text-sm text-gray-500">{item.desc}</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={notifications[item.key]}
                                                onChange={() => setNotifications({ ...notifications, [item.key]: !notifications[item.key] })}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Devices & Sessions */}
                    {activeSection === 'devices' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="card"
                        >
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Active Sessions</h2>

                            {sessions.length === 0 ? (
                                <p className="text-gray-500 dark:text-gray-400">No active sessions found</p>
                            ) : (
                                <div className="space-y-4">
                                    {sessions.map((session, index) => (
                                        <div
                                            key={session.id || index}
                                            className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Smartphone className="w-8 h-8 text-gray-400" />
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {session.device || 'Unknown Device'}
                                                    </p>
                                                    <p className="text-sm text-gray-500">
                                                        {session.location || 'Unknown location'} • {session.ip || 'Unknown IP'}
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        Last active: {session.last_active || 'Unknown'}
                                                    </p>
                                                </div>
                                            </div>
                                            {session.is_current ? (
                                                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                                    Current
                                                </span>
                                            ) : (
                                                <button className="text-red-600 hover:text-red-700 text-sm font-medium">
                                                    Revoke
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Password Change Modal */}
            {showPasswordModal && (
                <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
            )}

            {/* Delete Account Modal */}
            {showDeleteModal && (
                <DeleteAccountModal onClose={() => setShowDeleteModal(false)} />
            )}
        </div>
    );
};

// Change Password Modal
const ChangePasswordModal = ({ onClose }) => {
    const [form, setForm] = useState({ current: '', new: '', confirm: '' });
    const [showPasswords, setShowPasswords] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.new !== form.confirm) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        const result = await authService.changePassword(form.current, form.new);
        if (result.success) {
            onClose();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Change Password</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {['current', 'new', 'confirm'].map((field) => (
                        <div key={field}>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                                {field === 'confirm' ? 'Confirm New Password' : `${field} Password`}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPasswords[field] ? 'text' : 'password'}
                                    value={form[field]}
                                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                                    className="w-full px-4 py-3 pr-12 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords({ ...showPasswords, [field]: !showPasswords[field] })}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                                >
                                    {showPasswords[field] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    ))}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50">
                            {loading ? 'Saving...' : 'Update Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Delete Account Modal
const DeleteAccountModal = ({ onClose }) => {
    const { logout } = useAuthStore();
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (confirmation !== 'DELETE') return;
        setLoading(true);
        // In production, call userService.deleteAccount()
        await logout();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                        <AlertTriangle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Delete Account</h2>
                        <p className="text-sm text-gray-500">This action cannot be undone</p>
                    </div>
                </div>

                <p className="text-gray-600 dark:text-gray-400 mb-4">
                    All your data will be permanently deleted, including wallets, cards, and transaction history.
                </p>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Type "DELETE" to confirm
                    </label>
                    <input
                        type="text"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        placeholder="DELETE"
                    />
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={confirmation !== 'DELETE' || loading}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {loading ? 'Deleting...' : 'Delete Account'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
