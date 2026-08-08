import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Filter,
    MoreVertical,
    User,
    Mail,
    Phone,
    Shield,
    AlertTriangle,
    Check,
    X,
    Eye,
    Ban,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Plus,
    CheckCircle2
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatDateTime } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';

const KYC_TIERS = {
    0: { label: 'Unverified', color: 'bg-gray-100 text-gray-700' },
    1: { label: 'Basic', color: 'bg-blue-100 text-blue-700' },
    2: { label: 'Verified', color: 'bg-primary-100 text-primary-700' },
    3: { label: 'Premium', color: 'bg-purple-100 text-purple-700' },
};

const STATUS_COLORS = {
    active: 'bg-primary-100 text-primary-700',
    suspended: 'bg-red-100 text-red-700',
    inactive: 'bg-gray-100 text-gray-700',
};

// Shared pill switch — hoisted to module scope so it isn't recreated (and doesn't lose click
// state) on every parent render.
const ToggleSwitch = ({ label, enabled, onToggle, disabled }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <button
            onClick={onToggle}
            disabled={disabled}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
    </div>
);

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ kyc_tier: '', status: '', role: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showSuspendModal, setShowSuspendModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [selectedRecipients, setSelectedRecipients] = useState([]); // [{id, email, name}] — survives page changes
    const [showMessageModal, setShowMessageModal] = useState(false);
    const [showDeletionRequestsModal, setShowDeletionRequestsModal] = useState(false);
    const { user: currentUser } = useAuthStore();
    const isSuperAdmin = (currentUser?.roles || [currentUser?.role]).includes('super_admin');

    const isSelected = (id) => selectedRecipients.some((r) => r.id === id);
    const toggleRecipient = (user) => {
        setSelectedRecipients((prev) => isSelected(user.id)
            ? prev.filter((r) => r.id !== user.id)
            : [...prev, { id: user.id, email: user.email, name: user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.email }]);
    };
    const togglePage = () => {
        const allOnPage = users.length > 0 && users.every((u) => isSelected(u.id));
        setSelectedRecipients((prev) => allOnPage
            ? prev.filter((r) => !users.some((u) => u.id === r.id))
            : [...prev, ...users.filter((u) => !prev.some((r) => r.id === u.id)).map((u) => ({ id: u.id, email: u.email, name: u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.email }))]);
    };

    useEffect(() => {
        fetchUsers();
    }, [pagination.page, filters]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            console.log('Fetching users with filters:', filters);
            const result = await adminService.getUsers({
                page: pagination.page,
                limit: pagination.limit,
                search: searchQuery || undefined,
                kyc_tier: filters.kyc_tier || undefined,
                status: filters.status || undefined,
                role: filters.role || undefined,
            });
            console.log('GetUsers result:', result);
            if (result.success) {
                setUsers(result.data.users || []);
                setPagination(prev => ({
                    ...prev,
                    total: result.data.pagination?.total || 0,
                    pages: result.data.pagination?.pages || 0
                }));
            } else {
                console.error('Failed to fetch users:', result.error);
            }
        } catch (err) {
            console.error('Error in fetchUsers:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination(prev => ({ ...prev, page: 1 }));
        fetchUsers();
    };

    const handleViewUser = async (user) => {
        setSelectedUser(user);
        setShowUserModal(true);
    };

    const handleUpdateUser = async (userId, updates) => {
        setActionLoading(true);
        const result = await adminService.updateUser(userId, updates);
        if (result.success) {
            fetchUsers();
            setShowUserModal(false);
        }
        setActionLoading(false);
    };

    const handleCreateUser = async (userData) => {
        setActionLoading(true);
        const result = await adminService.createUser(userData);
        if (result.success) {
            fetchUsers();
            setShowCreateModal(false);
        }
        setActionLoading(false);
    };

    const handleSuspendUser = async (userId, reason) => {
        setActionLoading(true);
        const result = await adminService.suspendUser(userId, reason);
        if (result.success) {
            fetchUsers();
            setShowSuspendModal(false);
            setShowUserModal(false);
        }
        setActionLoading(false);
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
                    <p className="text-gray-600 dark:text-gray-400">{pagination.total} total users</p>
                </div>
                <div className="flex gap-2">
                    {isSuperAdmin && (
                        <button
                            onClick={() => setShowDeletionRequestsModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg border border-red-200"
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Deletion Requests
                        </button>
                    )}
                    <button
                        onClick={() => setShowMessageModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                    >
                        <Mail className="w-4 h-4" />
                        Message{selectedRecipients.length > 0 ? ` (${selectedRecipients.length})` : ''}
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white font-medium rounded-lg"
                    >
                        <Plus className="w-4 h-4" />
                        Add User
                    </button>
                    <button
                        onClick={fetchUsers}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-gray-900 font-medium rounded-lg"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* All Users Financial Controls (Super Admin Only) — platform-wide kill switches,
                separate from the per-user overrides in each user's detail modal. */}
            {isSuperAdmin && <SystemWideFinancialControls />}

            {/* Search & Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by email or name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>
                    <select
                        value={filters.kyc_tier}
                        onChange={(e) => setFilters({ ...filters, kyc_tier: e.target.value })}
                        className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                        <option value="">All KYC Tiers</option>
                        <option value="0">Unverified</option>
                        <option value="1">Basic</option>
                        <option value="2">Verified</option>
                    </select>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <button
                        type="submit"
                        className="px-4 py-2.5 bg-gray-900 dark:bg-gray-600 text-white font-medium rounded-lg"
                    >
                        Search
                    </button>
                </form>
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-12">
                        <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No users found</h3>
                        <p className="text-gray-500">Try adjusting your search or filters</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-4 w-10">
                                        <input
                                            type="checkbox"
                                            aria-label="Select all on this page"
                                            checked={users.length > 0 && users.every((u) => isSelected(u.id))}
                                            onChange={togglePage}
                                            className="w-4 h-4 accent-green-600 cursor-pointer"
                                        />
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        User
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        KYC Tier
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Role
                                    </th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Joined
                                    </th>
                                    <th className="text-right px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {users.map((user) => (
                                    <tr key={user.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${isSelected(user.id) ? 'bg-green-50/60 dark:bg-green-900/10' : ''}`}>
                                        <td className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                aria-label={`Select ${user.email}`}
                                                checked={isSelected(user.id)}
                                                onChange={() => toggleRecipient(user)}
                                                className="w-4 h-4 accent-green-600 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-medium">
                                                    {user.email?.[0]?.toUpperCase() || 'U'}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {user.first_name && user.last_name
                                                            ? `${user.first_name} ${user.last_name}`
                                                            : user.email?.split('@')[0]}
                                                    </p>
                                                    <p className="text-sm text-gray-500">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${KYC_TIERS[user.kyc_tier]?.color || KYC_TIERS[0].color
                                                }`}>
                                                {KYC_TIERS[user.kyc_tier]?.label || 'Unverified'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[user.status] || STATUS_COLORS.active
                                                }`}>
                                                {user.status || 'Active'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                                                {user.role || 'User'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-gray-500">
                                                {formatDateTime(user.created_at)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleViewUser(user)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                            >
                                                <Eye className="w-4 h-4" />
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500">
                            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                disabled={pagination.page === 1}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="px-4 py-2 text-sm">
                                Page {pagination.page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                disabled={pagination.page >= totalPages}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* User Detail Modal */}
            <AnimatePresence>
                {showUserModal && selectedUser && (
                    <UserDetailModal
                        user={selectedUser}
                        onClose={() => setShowUserModal(false)}
                        onUpdate={handleUpdateUser}
                        onSuspend={(reason) => handleSuspendUser(selectedUser.id, reason)}
                        loading={actionLoading}
                    />
                )}
                {showCreateModal && (
                    <CreateUserModal
                        onClose={() => setShowCreateModal(false)}
                        onSubmit={handleCreateUser}
                        loading={actionLoading}
                    />
                )}
                {showMessageModal && (
                    <MessageUsersModal
                        recipients={selectedRecipients}
                        onRemove={(id) => setSelectedRecipients((prev) => prev.filter((r) => r.id !== id))}
                        onClose={() => setShowMessageModal(false)}
                        onSent={() => { setShowMessageModal(false); setSelectedRecipients([]); }}
                    />
                )}
                {showDeletionRequestsModal && (
                    <DeletionRequestsModal onClose={() => setShowDeletionRequestsModal(false)} />
                )}
            </AnimatePresence>
        </div>
    );
};

// Platform-wide kill switches — halts deposits/withdrawals for EVERY user at once, independent
// of any per-user override. Backed by the same feature_toggles table/endpoints as the Feature
// Management page, just surfaced here with dedicated fiat/crypto x deposit/withdrawal labels so
// it sits directly alongside the per-user controls for a clear "per user" vs "all users" contrast.
const SYSTEM_TOGGLE_LABELS = {
    deposits_fiat: 'Fiat Deposits',
    deposits_crypto: 'Crypto Deposits',
    withdrawals_fiat: 'Fiat Withdrawals',
    withdrawals_crypto: 'Crypto Withdrawals',
};

const SystemWideFinancialControls = () => {
    const [toggles, setToggles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);

    const load = async () => {
        const result = await adminService.getFeatureToggles();
        if (result.success) {
            setToggles((result.data || []).filter((t) => SYSTEM_TOGGLE_LABELS[t.feature_name]));
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleToggle = async (toggle) => {
        setSavingId(toggle.id);
        const result = await adminService.updateFeatureToggle(toggle.id, { is_enabled: !toggle.is_enabled });
        if (result.success) {
            setToggles((prev) => prev.map((t) => (t.id === toggle.id ? { ...t, is_enabled: !toggle.is_enabled } : t)));
        }
        setSavingId(null);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-red-200 dark:border-red-900/40">
            <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">All Users Financial Controls</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">Platform-wide kill switches — applies to every user regardless of their individual settings.</p>
            {loading ? (
                <div className="flex justify-center p-4">
                    <RefreshCw className="w-5 h-5 animate-spin text-primary-500" />
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.keys(SYSTEM_TOGGLE_LABELS).map((name) => {
                        const toggle = toggles.find((t) => t.feature_name === name);
                        if (!toggle) return null;
                        return (
                            <ToggleSwitch
                                key={name}
                                label={SYSTEM_TOGGLE_LABELS[name]}
                                enabled={toggle.is_enabled}
                                disabled={savingId === toggle.id}
                                onToggle={() => handleToggle(toggle)}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Compose an email / dashboard notification to the selected users (or every user).
const MessageUsersModal = ({ recipients, onRemove, onClose, onSent }) => {
    const [allUsers, setAllUsers] = useState(recipients.length === 0);
    const [channels, setChannels] = useState({ notification: true, email: false });
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [feedback, setFeedback] = useState(null); // { ok, text }

    const canSend = subject.trim() && message.trim() && (channels.notification || channels.email)
        && (allUsers || recipients.length > 0);

    const handleSend = async () => {
        setSending(true); setFeedback(null);
        const res = await adminService.sendMessage({
            user_ids: allUsers ? undefined : recipients.map((r) => r.id),
            all_users: allUsers || undefined,
            channels: Object.keys(channels).filter((c) => channels[c]),
            subject: subject.trim(),
            message: message.trim(),
        });
        setSending(false);
        if (res.success) {
            setFeedback({ ok: true, text: res.message || 'Message sent.' });
            setTimeout(onSent, 1200);
        } else {
            setFeedback({ ok: false, text: res.error || 'Failed to send message.' });
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Mail className="w-5 h-5 text-green-600" /> Message Users
                        </h2>
                        <p className="text-sm text-gray-500">Send an email and/or a dashboard notification</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* Recipients */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Recipients</label>
                        <div className="flex items-center gap-3 mb-2">
                            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={allUsers} onChange={(e) => setAllUsers(e.target.checked)} className="w-4 h-4 accent-green-600" />
                                Send to <strong>all users</strong>
                            </label>
                        </div>
                        {!allUsers && (
                            recipients.length === 0 ? (
                                <p className="text-sm text-amber-600">No users selected — tick users in the table first, or choose “all users”.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    {recipients.map((r) => (
                                        <span key={r.id} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full text-xs">
                                            {r.name || r.email}
                                            <button onClick={() => onRemove(r.id)} aria-label={`Remove ${r.email}`}><X className="w-3 h-3" /></button>
                                        </span>
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                    {/* Channels */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Send via</label>
                        <div className="flex gap-4">
                            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={channels.notification} onChange={(e) => setChannels({ ...channels, notification: e.target.checked })} className="w-4 h-4 accent-green-600" />
                                Dashboard notification
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={channels.email} onChange={(e) => setChannels({ ...channels, email: e.target.checked })} className="w-4 h-4 accent-green-600" />
                                Email
                            </label>
                        </div>
                    </div>

                    {/* Subject + message */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Subject</label>
                        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200}
                            placeholder="e.g. Scheduled maintenance this weekend"
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Message</label>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={5000}
                            placeholder="Write your message…"
                            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm resize-y" />
                        <p className="text-[11px] text-gray-400 mt-1">{message.length}/5000</p>
                    </div>

                    {feedback && (
                        <p className={`text-sm ${feedback.ok ? 'text-green-600' : 'text-red-600'}`}>{feedback.text}</p>
                    )}
                </div>

                <div className="flex gap-3 p-6 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-lg">Cancel</button>
                    <button onClick={handleSend} disabled={!canSend || sending}
                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                        {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        {sending ? 'Sending…' : allUsers ? 'Send to all users' : `Send to ${recipients.length} user${recipients.length === 1 ? '' : 's'}`}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Create User Modal
const STAFF_ROLE_OPTIONS = [
    { value: 'admin', label: 'Admin', hint: 'All access' },
    { value: 'compliance_officer', label: 'Compliance', hint: 'KYC review' },
    { value: 'finance', label: 'Finance', hint: 'Treasury & transactions' },
    { value: 'support', label: 'Support', hint: 'Announcements & tickets' },
];

const CreateUserModal = ({ onClose, onSubmit, loading }) => {
    const [form, setForm] = useState({
        email: '',
        password: '',
        phone: '',
        first_name: '',
        last_name: '',
        kyc_tier: 'tier_0',
        // Profile — same fields captured on the user-facing profile/signup forms.
        date_of_birth: '',
        gender: '',
        country: '',
        city: '',
        address: '',
        postal_code: '',
        // Identity verification — same as self-service KYC (BVN/NIN + photo).
        id_type: '',
        id_number: '',
        photo_url: '',
    });
    const [staffRoles, setStaffRoles] = useState([]); // checkboxes; empty = plain end_user account
    const [photoPreview, setPhotoPreview] = useState(null);

    const toggleStaffRole = (value) => {
        setStaffRoles((prev) => prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]);
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setForm((f) => ({ ...f, photo_url: reader.result }));
            setPhotoPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { ...form };
        if (staffRoles.length > 0) payload.roles = staffRoles;
        else payload.role = 'end_user';
        onSubmit(payload);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New User</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                            <input
                                required
                                type="text"
                                value={form.first_name}
                                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                            <input
                                required
                                type="text"
                                value={form.last_name}
                                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                        <input
                            required
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                        <input
                            required
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                        <input
                            required
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Staff Roles <span className="text-gray-400 font-normal">(leave unchecked for a regular end user)</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {STAFF_ROLE_OPTIONS.map((opt) => (
                                <label
                                    key={opt.value}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${staffRoles.includes(opt.value) ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={staffRoles.includes(opt.value)}
                                        onChange={() => toggleStaffRole(opt.value)}
                                        className="rounded"
                                    />
                                    <span>
                                        <span className="font-medium text-gray-900 dark:text-white">{opt.label}</span>
                                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">{opt.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">A user can hold more than one staff role.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">KYC Tier</label>
                        <select
                            value={form.kyc_tier}
                            onChange={(e) => setForm({ ...form, kyc_tier: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                        >
                            <option value="tier_0">Tier 0 (Unverified)</option>
                            <option value="tier_1">Tier 1 (Basic)</option>
                            <option value="tier_2">Tier 2 (Verified)</option>
                        </select>
                    </div>

                    <hr className="border-gray-200 dark:border-gray-700" />
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Profile (optional — as captured at sign-up)</p>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth</label>
                            <input
                                type="date"
                                value={form.date_of_birth}
                                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                            <select
                                value={form.gender}
                                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            >
                                <option value="">Select...</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                            <input
                                type="text"
                                value={form.country}
                                onChange={(e) => setForm({ ...form, country: e.target.value })}
                                placeholder="e.g. NG"
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                            <input
                                type="text"
                                value={form.city}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                            <input
                                type="text"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Postal Code</label>
                            <input
                                type="text"
                                value={form.postal_code}
                                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>
                    </div>

                    <hr className="border-gray-200 dark:border-gray-700" />
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Identity Verification (optional — BVN/NIN, as in self-service KYC)</p>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Type</label>
                            <select
                                value={form.id_type}
                                onChange={(e) => setForm({ ...form, id_type: e.target.value })}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            >
                                <option value="">None</option>
                                <option value="bvn">BVN</option>
                                <option value="nin">NIN</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Number</label>
                            <input
                                type="text"
                                value={form.id_number}
                                onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                                disabled={!form.id_type}
                                maxLength={11}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo (ID / selfie)</label>
                        <div className="flex items-center gap-3">
                            {photoPreview && (
                                <img src={photoPreview} alt="Preview" className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-gray-600" />
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                className="flex-1 text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-gray-900 font-medium rounded-lg disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create User'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};

// Account Deletion Requests — super_admin approve/reject queue
const DeletionRequestsModal = ({ onClose }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actioningId, setActioningId] = useState(null);
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectNote, setRejectNote] = useState('');
    const [error, setError] = useState(null);

    const load = async () => {
        setLoading(true);
        const res = await adminService.getAccountDeletionRequests('pending');
        if (res.success) setRequests(res.data || []);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleApprove = async (id) => {
        setError(null);
        setActioningId(id);
        const res = await adminService.approveAccountDeletion(id);
        setActioningId(null);
        if (res.success) load();
        else setError(res.error || 'Could not approve this request.');
    };

    const handleReject = async (id) => {
        setError(null);
        setActioningId(id);
        const res = await adminService.rejectAccountDeletion(id, rejectNote);
        setActioningId(null);
        if (res.success) { setRejectingId(null); setRejectNote(''); load(); }
        else setError(res.error || 'Could not reject this request.');
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Account Deletion Requests</h2>
                        <p className="text-sm text-gray-500">Pending requests awaiting super admin review</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium">{error}</div>}
                    {loading ? (
                        <p className="text-center text-gray-500 py-8">Loading...</p>
                    ) : requests.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No pending deletion requests.</p>
                    ) : (
                        requests.map((r) => (
                            <div key={r.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            {r.first_name ? `${r.first_name} ${r.last_name || ''}`.trim() : r.email}
                                        </p>
                                        <p className="text-xs text-gray-500">{r.email}</p>
                                    </div>
                                    <span className="text-xs text-gray-400">{formatDateTime(r.requested_at)}</span>
                                </div>
                                {r.reason && (
                                    <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-lg p-2">{r.reason}</p>
                                )}
                                {rejectingId === r.id ? (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={rejectNote}
                                            onChange={(e) => setRejectNote(e.target.value)}
                                            placeholder="Reason for rejecting (optional)"
                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setRejectingId(null); setRejectNote(''); }}
                                                className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => handleReject(r.id)}
                                                disabled={actioningId === r.id}
                                                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                                            >
                                                Confirm Reject
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setRejectingId(r.id)}
                                            disabled={actioningId === r.id}
                                            className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                        <button
                                            onClick={() => handleApprove(r.id)}
                                            disabled={actioningId === r.id}
                                            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                                        >
                                            {actioningId === r.id ? 'Deleting...' : 'Approve & Delete'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

// User Detail Modal
const UserDetailModal = ({ user, onClose, onUpdate, onSuspend, loading }) => {
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({
        kyc_tier: user.kyc_tier || 0,
        status: user.status || 'active',
    });
    const [staffRoles, setStaffRoles] = useState(
        (user.roles && user.roles.length > 0 ? user.roles : [user.role]).filter((r) => STAFF_ROLE_OPTIONS.some((o) => o.value === r))
    );
    const toggleStaffRole = (value) => {
        setStaffRoles((prev) => prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]);
    };
    const [suspendReason, setSuspendReason] = useState('');
    const [showSuspendForm, setShowSuspendForm] = useState(false);
    const [userFeatures, setUserFeatures] = useState([]);
    const [featuresLoading, setFeaturesLoading] = useState(false);
    const [financialControls, setFinancialControls] = useState(null);
    const [financialControlsLoading, setFinancialControlsLoading] = useState(false);
    const [financialControlsSaving, setFinancialControlsSaving] = useState(false);
    const [depositLimitInput, setDepositLimitInput] = useState('');
    const [withdrawalLimitInput, setWithdrawalLimitInput] = useState('');
    const { user: currentUser } = useAuthStore();

    const availableProducts = [
        'crypto', 'virtual_cards', 'utilities', 'bill_payments', 'cross_border', 'wallet_transfers'
    ];

    useEffect(() => {
        if (currentUser?.role === 'super_admin') {
            fetchUserFeatures();
            fetchFinancialControls();
        }
    }, [user.id]);

    const fetchUserFeatures = async () => {
        setFeaturesLoading(true);
        const result = await adminService.getUserFeatures(user.id);
        if (result.success) {
            setUserFeatures(result.data || []);
        }
        setFeaturesLoading(false);
    };

    const fetchFinancialControls = async () => {
        setFinancialControlsLoading(true);
        const result = await adminService.getUserFinancialControls(user.id);
        if (result.success) {
            setFinancialControls(result.data);
            setDepositLimitInput(result.data.custom_deposit_limit_ngn ?? '');
            setWithdrawalLimitInput(result.data.custom_withdrawal_limit_usd ?? '');
        }
        setFinancialControlsLoading(false);
    };

    const handleToggleFinancialControl = async (field, value) => {
        const result = await adminService.updateUserFinancialControls(user.id, { [field]: value });
        if (result.success) setFinancialControls(result.data);
    };

    const handleSaveLimits = async () => {
        setFinancialControlsSaving(true);
        const result = await adminService.updateUserFinancialControls(user.id, {
            custom_deposit_limit_ngn: depositLimitInput === '' ? null : parseFloat(depositLimitInput),
            custom_withdrawal_limit_usd: withdrawalLimitInput === '' ? null : parseFloat(withdrawalLimitInput),
        });
        if (result.success) setFinancialControls(result.data);
        setFinancialControlsSaving(false);
    };

    const handleToggleFeature = async (featureName, isEnabled) => {
        const result = await adminService.updateUserFeature(user.id, {
            feature_name: featureName,
            is_enabled: isEnabled
        });
        if (result.success) {
            setUserFeatures(prev => {
                const existing = prev.find(f => f.feature_name === featureName);
                if (existing) {
                    return prev.map(f => f.feature_name === featureName ? { ...f, is_enabled: isEnabled } : f);
                }
                return [...prev, { feature_name: featureName, is_enabled: isEnabled }];
            });
        }
    };

    const isProductEnabled = (productName) => {
        const feat = userFeatures.find(f => f.feature_name === productName);
        return feat ? feat.is_enabled : true; // Default to true if no override
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                            {user.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {user.first_name && user.last_name
                                    ? `${user.first_name} ${user.last_name}`
                                    : user.email?.split('@')[0]}
                            </h2>
                            <p className="text-gray-500">{user.email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* User Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">User ID</label>
                            <p className="text-gray-900 dark:text-white font-mono text-sm">{user.id}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">Phone</label>
                            <p className="text-gray-900 dark:text-white">{user.phone || 'Not provided'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
                            <p className="text-gray-900 dark:text-white">{formatDateTime(user.created_at)}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">Last Login</label>
                            <p className="text-gray-900 dark:text-white">{formatDateTime(user.last_login_at) || 'Never'}</p>
                        </div>
                    </div>

                    {/* Editable Fields */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Account Settings</h3>
                            {!editMode && (
                                <button
                                    onClick={() => setEditMode(true)}
                                    className="text-sm text-primary-600 hover:text-primary-700"
                                >
                                    Edit
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2">KYC Tier</label>
                                {editMode ? (
                                    <select
                                        value={form.kyc_tier}
                                        onChange={(e) => setForm({ ...form, kyc_tier: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                    >
                                        <option value={0}>Unverified</option>
                                        <option value={1}>Basic</option>
                                        <option value={2}>Verified</option>
                                    </select>
                                ) : (
                                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${KYC_TIERS[user.kyc_tier]?.color || KYC_TIERS[0].color
                                        }`}>
                                        {KYC_TIERS[user.kyc_tier]?.label || 'Unverified'}
                                    </span>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2">Status</label>
                                {editMode ? (
                                    <select
                                        value={form.status}
                                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                    >
                                        <option value="active">Active</option>
                                        <option value="suspended">Suspended</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                ) : (
                                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[user.status] || STATUS_COLORS.active
                                        }`}>
                                        {user.status || 'Active'}
                                    </span>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2">Staff Roles</label>
                                {editMode ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {STAFF_ROLE_OPTIONS.map((opt) => (
                                            <label
                                                key={opt.value}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${staffRoles.includes(opt.value) ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={staffRoles.includes(opt.value)}
                                                    onChange={() => toggleStaffRole(opt.value)}
                                                    className="rounded"
                                                />
                                                <span className="font-medium text-gray-900 dark:text-white">{opt.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-gray-900 dark:text-white capitalize">
                                        {(user.roles && user.roles.length > 0 ? user.roles : [user.role]).join(', ') || 'User'}
                                    </span>
                                )}
                            </div>
                        </div>

                        {editMode && (
                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => setEditMode(false)}
                                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onUpdate(user.id, { ...form, roles: staffRoles.length > 0 ? staffRoles : ['end_user'] });
                                        setEditMode(false);
                                    }}
                                    disabled={loading}
                                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-gray-900 font-medium rounded-lg disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Product Access Control (Super Admin Only) */}
                    {currentUser?.role === 'super_admin' && (
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Granular Product Access</h3>
                            {featuresLoading ? (
                                <div className="flex justify-center p-4">
                                    <RefreshCw className="w-5 h-5 animate-spin text-primary-500" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {availableProducts.map(product => (
                                        <div key={product} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                                                {product.replace('_', ' ')}
                                            </span>
                                            <button
                                                onClick={() => handleToggleFeature(product, !isProductEnabled(product))}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isProductEnabled(product) ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                                                    }`}
                                            >
                                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isProductEnabled(product) ? 'translate-x-5' : 'translate-x-1'
                                                    }`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Financial Controls (Super Admin Only) */}
                    {currentUser?.role === 'super_admin' && (
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Financial Controls</h3>
                            <p className="text-xs text-gray-400 mb-4">Per-user overrides. For platform-wide controls, see "All Users Financial Controls" above the user list.</p>
                            {financialControlsLoading ? (
                                <div className="flex justify-center p-4">
                                    <RefreshCw className="w-5 h-5 animate-spin text-primary-500" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <ToggleSwitch
                                            label="Fiat Deposits"
                                            enabled={financialControls?.deposits_fiat_enabled ?? true}
                                            onToggle={() => handleToggleFinancialControl('deposits_fiat_enabled', !(financialControls?.deposits_fiat_enabled ?? true))}
                                        />
                                        <ToggleSwitch
                                            label="Crypto Deposits"
                                            enabled={financialControls?.deposits_crypto_enabled ?? true}
                                            onToggle={() => handleToggleFinancialControl('deposits_crypto_enabled', !(financialControls?.deposits_crypto_enabled ?? true))}
                                        />
                                        <ToggleSwitch
                                            label="Fiat Withdrawals"
                                            enabled={financialControls?.withdrawals_fiat_enabled ?? true}
                                            onToggle={() => handleToggleFinancialControl('withdrawals_fiat_enabled', !(financialControls?.withdrawals_fiat_enabled ?? true))}
                                        />
                                        <ToggleSwitch
                                            label="Crypto Withdrawals"
                                            enabled={financialControls?.withdrawals_crypto_enabled ?? true}
                                            onToggle={() => handleToggleFinancialControl('withdrawals_crypto_enabled', !(financialControls?.withdrawals_crypto_enabled ?? true))}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Custom deposit limit (₦/day)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="Tier default"
                                                value={depositLimitInput}
                                                onChange={(e) => setDepositLimitInput(e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Custom withdrawal limit ($/day)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="Tier default"
                                                value={withdrawalLimitInput}
                                                onChange={(e) => setWithdrawalLimitInput(e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-gray-400">Leave a field blank to fall back to the user's KYC tier default.</p>
                                        <button
                                            onClick={handleSaveLimits}
                                            disabled={financialControlsSaving}
                                            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                                        >
                                            {financialControlsSaving ? 'Saving...' : 'Save Limits'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Suspend User Section */}
                    {user.status !== 'suspended' && (
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            {!showSuspendForm ? (
                                <button
                                    onClick={() => setShowSuspendForm(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                >
                                    <Ban className="w-4 h-4" />
                                    Suspend User
                                </button>
                            ) : (
                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Suspension Reason
                                    </label>
                                    <textarea
                                        value={suspendReason}
                                        onChange={(e) => setSuspendReason(e.target.value)}
                                        placeholder="Enter reason for suspension..."
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        rows={3}
                                    />
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowSuspendForm(false)}
                                            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => onSuspend(suspendReason)}
                                            disabled={!suspendReason || loading}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50"
                                        >
                                            {loading ? 'Suspending...' : 'Confirm Suspension'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default UserManagement;
