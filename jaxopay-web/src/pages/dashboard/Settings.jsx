import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    QrCode,
    Copy,
    RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import authService from '../../services/authService';
import userService from '../../services/userService';

const Settings = () => {
    const { user, logout, setUser } = useAuthStore();
    const { theme, setTheme } = useAppStore();
    const [activeSection, setActiveSection] = useState('general');

    // Modals
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [show2FAModal, setShow2FAModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Data
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Preferences State
    const [language, setLanguage] = useState(user?.preferred_language || 'en');
    const [showBalances, setShowBalances] = useState(user?.preferences?.show_balances ?? true);
    const [notifications, setNotifications] = useState(user?.preferences?.notifications || {
        email_transactions: true,
        email_security: true,
        email_marketing: false,
        push_transactions: true,
        push_security: true,
    });

    useEffect(() => {
        if (activeSection === 'devices') {
            fetchSessions();
        }
    }, [activeSection]);

    // Update local state when user updates
    useEffect(() => {
        if (user) {
            setLanguage(user.preferred_language || 'en');
            setShowBalances(user.preferences?.show_balances ?? true);
            if (user.preferences?.notifications) {
                setNotifications(user.preferences.notifications);
            }
        }
    }, [user]);

    const fetchSessions = async () => {
        const result = await authService.getSessions();
        if (result.success) {
            setSessions(result.data.sessions || []);
        }
    };

    const handleUpdateSettings = async (updates) => {
        // Optimistic update
        const currentUser = { ...user };
        const newPreferences = { ...currentUser.preferences, ...updates.preferences };
        const newUser = {
            ...currentUser,
            ...updates,
            preferences: newPreferences
        };
        setUser(newUser);

        // API Call
        const result = await userService.updateSettings({
            language: updates.preferred_language,
            notifications: updates.preferences?.notifications,
            show_balances: updates.preferences?.show_balances
        });

        if (!result.success) {
            setError('Failed to update settings');
            setUser(currentUser); // Revert
        } else {
            setSuccess('Settings saved');
            setTimeout(() => setSuccess(null), 3000);
        }
    };

    const handleLogoutAll = async () => {
        if (!window.confirm('Are you sure you want to log out of all other devices?')) return;
        setLoading(true);
        const result = await authService.logoutAll();
        if (result.success) {
            setSuccess('All other sessions have been logged out');
            fetchSessions();
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const handleRevokeSession = async (sessionId) => {
        if (!window.confirm('Revoke this session?')) return;
        const result = await authService.terminateSession(sessionId);
        if (result.success) {
            setSessions(sessions.filter(s => s.id !== sessionId));
            setSuccess('Session revoked');
            setTimeout(() => setSuccess(null), 3000);
        } else {
            setError(result.error);
        }
    };

    const settingsSections = [
        { id: 'general', label: 'General', icon: SettingsIcon },
        { id: 'security', label: 'Security', icon: Shield },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'devices', label: 'Devices & Sessions', icon: Smartphone },
    ];

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Settings</h1>
                <p className="text-muted-foreground">Manage your account preferences</p>
            </div>

            {/* Alerts */}
            <AnimatePresence>
                {(error || success) && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-4 rounded-xl flex items-start gap-3 ${error ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-success/10 text-success border border-success/20'}`}
                    >
                        {error ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <Check className="w-5 h-5 shrink-0" />}
                        <div className="flex-1">
                            <p className="font-medium">{error ? 'Error' : 'Success'}</p>
                            <p className="text-sm opacity-90">{error || success}</p>
                        </div>
                        <button onClick={() => { setError(null); setSuccess(null); }} className="p-1 hover:bg-black/5 rounded">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar */}
                <div className="lg:col-span-1">
                    <div className="bg-card rounded-2xl p-2 shadow-sm border border-border sticky top-24">
                        {settingsSections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeSection === section.id
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'hover:bg-muted/50 text-muted-foreground'
                                    }`}
                            >
                                <section.icon className={`w-5 h-5 ${activeSection === section.id ? 'text-primary' : 'text-muted-foreground'}`} />
                                <span>{section.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="lg:col-span-3 space-y-6">
                    {/* General Settings */}
                    {activeSection === 'general' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-card rounded-2xl p-6 shadow-sm border border-border"
                        >
                            <h2 className="text-lg font-bold text-foreground mb-6">General Settings</h2>

                            {/* Theme */}
                            <div className="flex items-center justify-between py-4 border-b border-border">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-muted rounded-lg">
                                        {theme === 'dark' ? <Moon className="w-5 h-5 text-muted-foreground" /> : <Sun className="w-5 h-5 text-muted-foreground" />}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-foreground">Appearance</p>
                                        <p className="text-sm text-muted-foreground">Customize how the app looks</p>
                                    </div>
                                </div>
                                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${theme === 'light' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                    >
                                        Light
                                    </button>
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${theme === 'dark' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                    >
                                        Dark
                                    </button>
                                </div>
                            </div>

                            {/* Language */}
                            <div className="flex items-center justify-between py-4 border-b border-border">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Globe className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-foreground">Language</p>
                                        <p className="text-sm text-muted-foreground">Select your preferred language</p>
                                    </div>
                                </div>
                                <select
                                    value={language}
                                    onChange={(e) => {
                                        setLanguage(e.target.value);
                                        handleUpdateSettings({ preferred_language: e.target.value });
                                    }}
                                    className="px-4 py-2 bg-muted border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-ring outline-none"
                                >
                                    <option value="en">English</option>
                                    <option value="fr">Français</option>
                                    <option value="es">Español</option>
                                </select>
                            </div>

                            {/* Display Balance */}
                            <div className="flex items-center justify-between py-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-success/10 rounded-lg">
                                        <Eye className="w-5 h-5 text-success" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-foreground">Show Balances</p>
                                        <p className="text-sm text-muted-foreground">Hide balances for privacy</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={showBalances}
                                        onChange={(e) => {
                                            setShowBalances(e.target.checked);
                                            handleUpdateSettings({ preferences: { show_balances: e.target.checked } });
                                        }}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>
                        </motion.div>
                    )}

                    {/* Security Settings */}
                    {activeSection === 'security' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-card rounded-2xl p-6 shadow-sm border border-border"
                        >
                            <h2 className="text-lg font-bold text-foreground mb-6">Security Settings</h2>

                            {/* Passwords */}
                            <button
                                onClick={() => setShowPasswordModal(true)}
                                className="w-full flex items-center justify-between py-4 border-b border-border group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-purple-50 rounded-lg">
                                        <Key className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Change Password</p>
                                        <p className="text-sm text-muted-foreground">Update your password regularly</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                            </button>

                            {/* 2FA */}
                            <button
                                onClick={() => setShow2FAModal(true)}
                                className="w-full flex items-center justify-between py-4 border-b border-border group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Shield className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Two-Factor Authentication</p>
                                        <p className="text-sm text-muted-foreground">Secure your account with 2FA</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {user?.two_fa_enabled ? (
                                        <span className="px-2.5 py-0.5 bg-success/10 text-success text-xs font-bold rounded-full uppercase tracking-wide">
                                            Enabled
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-0.5 bg-muted text-muted-foreground text-xs font-bold rounded-full uppercase tracking-wide">
                                            Disabled
                                        </span>
                                    )}
                                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                                </div>
                            </button>

                            {/* Logout All */}
                            <button
                                onClick={handleLogoutAll}
                                disabled={loading}
                                className="w-full flex items-center justify-between py-4 border-b border-border group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-warning/10 rounded-lg">
                                        <LogOut className="w-5 h-5 text-warning" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Logout All Devices</p>
                                        <p className="text-sm text-muted-foreground">Sign out from all other active sessions</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                            </button>

                            {/* Delete Account */}
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="w-full flex items-center justify-between py-4 group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-danger/10 rounded-lg">
                                        <Trash2 className="w-5 h-5 text-danger" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-semibold text-danger">Delete Account</p>
                                        <p className="text-sm text-muted-foreground">Permanently remove your data</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-red-300 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </motion.div>
                    )}

                    {/* Notification Settings */}
                    {activeSection === 'notifications' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-card rounded-2xl p-6 shadow-sm border border-border"
                        >
                            <h2 className="text-lg font-bold text-foreground mb-6">Notification Preferences</h2>

                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Email Notifications</h3>
                                    <div className="space-y-4">
                                        {[
                                            { key: 'email_transactions', label: 'Transaction Updates', desc: 'Receive emails for all deposits, withdrawals, and transfers' },
                                            { key: 'email_security', label: 'Security Alerts', desc: 'Get notified about new logins and security events' },
                                            { key: 'email_marketing', label: 'Marketing & Offers', desc: 'Receive updates about new features and promotions' },
                                        ].map((item) => (
                                            <div key={item.key} className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-semibold text-foreground">{item.label}</p>
                                                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer mt-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={notifications[item.key]}
                                                        onChange={(e) => {
                                                            const newNotes = { ...notifications, [item.key]: e.target.checked };
                                                            setNotifications(newNotes);
                                                            handleUpdateSettings({ preferences: { notifications: newNotes } });
                                                        }}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="h-px bg-muted" />

                                <div>
                                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Push Notifications</h3>
                                    <div className="space-y-4">
                                        {[
                                            { key: 'push_transactions', label: 'Transaction Alerts', desc: 'Instant push notifications for account activity' },
                                            { key: 'push_security', label: 'Security Alerts', desc: 'Push notifications for critical security events' },
                                        ].map((item) => (
                                            <div key={item.key} className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-semibold text-foreground">{item.label}</p>
                                                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer mt-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={notifications[item.key]}
                                                        onChange={(e) => {
                                                            const newNotes = { ...notifications, [item.key]: e.target.checked };
                                                            setNotifications(newNotes);
                                                            handleUpdateSettings({ preferences: { notifications: newNotes } });
                                                        }}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Devices & Sessions */}
                    {activeSection === 'devices' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-card rounded-2xl p-6 shadow-sm border border-border"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-foreground">Active Sessions</h2>
                                <button onClick={fetchSessions} className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
                                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                                </button>
                            </div>

                            {sessions.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">Loading sessions...</p>
                            ) : (
                                <div className="space-y-4">
                                    {sessions.map((session, index) => (
                                        <div
                                            key={session.id || index}
                                            className="flex items-center justify-between p-4 bg-muted/30 rounded-xl"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="p-3 bg-card rounded-xl shadow-sm">
                                                    <Smartphone className="w-6 h-6 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground flex items-center gap-2">
                                                        {session.user_agent || 'Unknown Device'}
                                                        {session.is_current && (
                                                            <span className="px-2 py-0.5 bg-success/10 text-success text-[10px] font-bold rounded-full uppercase">
                                                                Current
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        IP: {session.ip_address || 'Unknown'} • Active: {new Date(session.last_activity_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            {!session.is_current && (
                                                <button
                                                    onClick={() => handleRevokeSession(session.id)}
                                                    className="px-3 py-1.5 bg-card text-danger text-sm font-medium rounded-lg border border-border hover:bg-danger/10 transition-colors"
                                                >
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

            {/* Modals */}
            {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
            {show2FAModal && <TwoFactorModal onClose={() => setShow2FAModal(false)} user={user} setUser={setUser} />}
            {showDeleteModal && <DeleteAccountModal onClose={() => setShowDeleteModal(false)} />}
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
        setError(null);
        if (form.new.length < 6) return setError('Password must be at least 6 characters');
        if (form.new !== form.confirm) return setError('Passwords do not match');

        setLoading(true);
        const result = await authService.changePassword(form.current, form.new);
        if (result.success) {
            onClose();
            alert('Password changed successfully');
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">Change Password</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {error && <div className="bg-danger/10 text-danger p-3 rounded-lg mb-4 text-sm font-medium flex gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {['current', 'new', 'confirm'].map((field) => (
                        <div key={field}>
                            <label className="block text-sm font-semibold text-foreground mb-1 capitalize">
                                {field === 'confirm' ? 'Confirm New Password' : `${field} Password`}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPasswords[field] ? 'text' : 'password'}
                                    value={form[field]}
                                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                                    className="w-full px-4 py-3 pr-12 bg-card border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords({ ...showPasswords, [field]: !showPasswords[field] })}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                                >
                                    {showPasswords[field] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    ))}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl disabled:opacity-50 shadow-lg shadow-primary/20">
                            {loading ? 'Saving...' : 'Update Password'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

// 2FA Modal
const TwoFactorModal = ({ onClose, user, setUser }) => {
    const [step, setStep] = useState(user?.two_fa_enabled ? 'manage' : 'intro'); // intro, scan, verify, manage
    const [qrData, setQrData] = useState(null);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleStartSetup = async () => {
        setLoading(true);
        const result = await authService.enable2FA('authenticator');
        if (result.success) {
            setQrData(result.data);
            setStep('scan');
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const handleVerify = async () => {
        setLoading(true);
        const result = await authService.verify2FA(code, 'authenticator');
        if (result.success) {
            setUser({ ...user, two_fa_enabled: true, two_fa_method: 'authenticator' }); // Update store
            onClose();
            alert('2FA Enabled Successfully!');
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const handleDisable = async () => {
        setLoading(true);
        const result = await authService.disable2FA(password);
        if (result.success) {
            setUser({ ...user, two_fa_enabled: false, two_fa_method: null }); // Update store
            onClose();
            alert('2FA Disabled Successfully');
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-foreground">Two-Factor Authentication</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {error && <div className="bg-danger/10 text-danger p-3 rounded-lg mb-4 text-sm font-medium">{error}</div>}

                {step === 'manage' && (
                    <div className="space-y-4">
                        <div className="text-center py-6">
                            <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4">
                                <Shield className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">2FA is Enabled</h3>
                            <p className="text-sm text-muted-foreground mt-2">Your account is secured with Authenticator App.</p>
                        </div>
                        <div className="pt-4 border-t border-border">
                            <label className="block text-sm font-semibold text-foreground mb-2">Password to Disable</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-card border border-border rounded-xl mb-4"
                                placeholder="Enter your password"
                            />
                            <button
                                onClick={handleDisable}
                                disabled={!password || loading}
                                className="w-full py-3 bg-danger/10 text-danger hover:bg-red-200 font-bold rounded-xl transition-colors disabled:opacity-50"
                            >
                                {loading ? 'Disabling...' : 'Disable 2FA'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'intro' && (
                    <div className="space-y-4">
                        <p className="text-muted-foreground">
                            Protect your account by requiring a code from an authenticator app (Google Authenticator, Authy, etc.) when you log in.
                        </p>
                        <button
                            onClick={handleStartSetup}
                            disabled={loading}
                            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20"
                        >
                            {loading ? 'Starting...' : 'Setup Authenticator'}
                        </button>
                    </div>
                )}

                {step === 'scan' && qrData && (
                    <div className="space-y-6 text-center">
                        <div>
                            <p className="text-sm font-semibold mb-4 text-foreground">1. Scan this QR Code with your app</p>
                            <div className="bg-card p-4 rounded-xl border border-border inline-block">
                                <img src={qrData.qr_code} alt="2FA QR Code" className="w-48 h-48" />
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-semibold mb-2 text-foreground">2. Enter the code</p>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000 000"
                                className="w-32 text-center text-2xl font-bold tracking-widest px-2 py-2 bg-muted border border-border rounded-lg focus:ring-2 focus:ring-ring outline-none"
                            />
                        </div>
                        <button
                            onClick={handleVerify}
                            disabled={code.length !== 6 || loading}
                            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-50"
                        >
                            {loading ? 'Verifying...' : 'Verify & Enable'}
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

// Delete Account Modal
const DeleteAccountModal = ({ onClose }) => {
    const { logout } = useAuthStore();
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleDelete = async () => {
        if (confirmation !== 'DELETE') return;
        setLoading(true);
        const result = await userService.deleteAccount(password);
        if (result.success) {
            await logout();
            window.location.href = '/';
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-danger/10 rounded-full">
                        <AlertTriangle className="w-6 h-6 text-danger" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Delete Account</h2>
                        <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                    </div>
                </div>

                {error && <div className="bg-danger/10 text-danger p-3 rounded-lg mb-4 text-sm font-medium">{error}</div>}

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-card border border-border rounded-lg"
                            placeholder="Enter your password"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Type "DELETE" to confirm</label>
                        <input
                            type="text"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            className="w-full px-4 py-3 bg-card border border-border rounded-lg"
                            placeholder="DELETE"
                        />
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl">
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={confirmation !== 'DELETE' || !password || loading}
                        className="flex-1 py-3 bg-danger hover:bg-red-700 text-white font-bold rounded-xl disabled:opacity-50"
                    >
                        {loading ? 'Deleting...' : 'Delete Account'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
