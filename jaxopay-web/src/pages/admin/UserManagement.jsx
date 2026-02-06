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
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatDateTime } from '../../utils/formatters';

const KYC_TIERS = {
    0: { label: 'Unverified', color: 'bg-gray-100 text-gray-700' },
    1: { label: 'Basic', color: 'bg-blue-100 text-blue-700' },
    2: { label: 'Verified', color: 'bg-green-100 text-green-700' },
    3: { label: 'Premium', color: 'bg-purple-100 text-purple-700' },
};

const STATUS_COLORS = {
    active: 'bg-green-100 text-green-700',
    suspended: 'bg-red-100 text-red-700',
    inactive: 'bg-gray-100 text-gray-700',
};

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ kyc_tier: '', status: '', role: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showSuspendModal, setShowSuspendModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, [pagination.page, filters]);

    const fetchUsers = async () => {
        setLoading(true);
        const result = await adminService.getUsers({
            page: pagination.page,
            limit: pagination.limit,
            search: searchQuery || undefined,
            kyc_tier: filters.kyc_tier || undefined,
            status: filters.status || undefined,
            role: filters.role || undefined,
        });
        if (result.success) {
            setUsers(result.data.users || []);
            setPagination(prev => ({ ...prev, total: result.data.total || 0 }));
        }
        setLoading(false);
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
                <button
                    onClick={fetchUsers}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

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
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
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
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-medium">
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
            </AnimatePresence>
        </div>
    );
};

// User Detail Modal
const UserDetailModal = ({ user, onClose, onUpdate, onSuspend, loading }) => {
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({
        kyc_tier: user.kyc_tier || 0,
        status: user.status || 'active',
        role: user.role || 'user',
    });
    const [suspendReason, setSuspendReason] = useState('');
    const [showSuspendForm, setShowSuspendForm] = useState(false);

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
                        <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
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
                                    className="text-sm text-green-600 hover:text-green-700"
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
                                <label className="block text-sm font-medium text-gray-500 mb-2">Role</label>
                                {editMode ? (
                                    <select
                                        value={form.role}
                                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                    >
                                        <option value="user">User</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                ) : (
                                    <span className="text-gray-900 dark:text-white capitalize">{user.role || 'User'}</span>
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
                                        onUpdate(user.id, form);
                                        setEditMode(false);
                                    }}
                                    disabled={loading}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>

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
