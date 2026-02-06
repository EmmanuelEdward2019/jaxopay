import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    User,
    Mail,
    Phone,
    MapPin,
    Calendar,
    Camera,
    Edit,
    Check,
    X,
    Shield,
    Clock,
    Wallet,
    CreditCard,
    TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import userService from '../../services/userService';
import { formatDateTime } from '../../utils/formatters';

const Profile = () => {
    const { user, refreshSession } = useAuthStore();
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState(null);
    const [activityLogs, setActivityLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchProfile();
        fetchStats();
        fetchActivityLogs();
    }, []);

    const fetchProfile = async () => {
        const result = await userService.getProfile();
        if (result.success) {
            setProfile(result.data.user);
            setEditForm({
                first_name: result.data.user?.first_name || '',
                last_name: result.data.user?.last_name || '',
                phone: result.data.user?.phone || '',
                address: result.data.user?.address || '',
                city: result.data.user?.city || '',
                country: result.data.user?.country || '',
            });
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        const result = await userService.getStatistics();
        if (result.success) {
            setStats(result.data);
        }
    };

    const fetchActivityLogs = async () => {
        const result = await userService.getActivityLogs({ limit: 10 });
        if (result.success) {
            setActivityLogs(result.data.logs || []);
        }
    };

    const handleUpdateProfile = async () => {
        setSaving(true);
        const result = await userService.updateProfile(editForm);
        if (result.success) {
            setProfile({ ...profile, ...editForm });
            setEditing(false);
            await refreshSession();
        } else {
            setError(result.error);
        }
        setSaving(false);
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const result = await userService.uploadAvatar(file);
        if (result.success) {
            await fetchProfile();
            await refreshSession();
        } else {
            setError(result.error);
        }
    };

    const getKYCBadge = (tier) => {
        const badges = {
            tier_0: { label: 'Unverified', color: 'bg-gray-100 text-gray-700' },
            tier_1: { label: 'Basic', color: 'bg-blue-100 text-blue-700' },
            tier_2: { label: 'Verified', color: 'bg-green-100 text-green-700' },
        };
        return badges[tier] || badges.tier_0;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    const kycBadge = getKYCBadge(profile?.kyc_tier);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
                <p className="text-gray-600 dark:text-gray-400">Manage your personal information</p>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">
                        Dismiss
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Card */}
                <div className="lg:col-span-2">
                    <div className="card">
                        {/* Avatar Section */}
                        <div className="flex items-center gap-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-3xl font-bold overflow-hidden">
                                    {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        (profile?.first_name?.[0] || user?.email?.[0] || 'U').toUpperCase()
                                    )}
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute bottom-0 right-0 p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <Camera className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarUpload}
                                    className="hidden"
                                />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {profile?.first_name && profile?.last_name
                                        ? `${profile.first_name} ${profile.last_name}`
                                        : user?.email?.split('@')[0]}
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400">{user?.email}</p>
                                <span className={`inline-block mt-2 px-3 py-1 text-xs font-medium rounded-full ${kycBadge.color}`}>
                                    <Shield className="w-3 h-3 inline mr-1" />
                                    {kycBadge.label}
                                </span>
                            </div>
                        </div>

                        {/* Profile Form */}
                        <div className="pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Personal Information</h3>
                                {!editing ? (
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                    >
                                        <Edit className="w-4 h-4" />
                                        Edit
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditing(false)}
                                            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={handleUpdateProfile}
                                            disabled={saving}
                                            className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Check className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">First Name</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.first_name}
                                            onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white font-medium">
                                            {profile?.first_name || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Last Name</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.last_name}
                                            onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white font-medium">
                                            {profile?.last_name || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        <Mail className="w-4 h-4 inline mr-1" />
                                        Email
                                    </label>
                                    <p className="text-gray-900 dark:text-white font-medium">{user?.email}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        <Phone className="w-4 h-4 inline mr-1" />
                                        Phone
                                    </label>
                                    {editing ? (
                                        <input
                                            type="tel"
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white font-medium">
                                            {profile?.phone || '—'}
                                        </p>
                                    )}
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        <MapPin className="w-4 h-4 inline mr-1" />
                                        Address
                                    </label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.address}
                                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white font-medium">
                                            {profile?.address || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">City</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.city}
                                            onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white font-medium">
                                            {profile?.city || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Country</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.country}
                                            onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-gray-900 dark:text-white font-medium">
                                            {profile?.country || '—'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <Calendar className="w-4 h-4" />
                                    <span>Member since {formatDateTime(profile?.created_at || user?.created_at)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats & Activity */}
                <div className="space-y-6">
                    {/* Quick Stats */}
                    {stats && (
                        <div className="card">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Stats</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                            <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <span className="text-gray-600 dark:text-gray-400">Wallets</span>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">{stats.wallet_count || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                            <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                        </div>
                                        <span className="text-gray-600 dark:text-gray-400">Cards</span>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">{stats.card_count || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                                        </div>
                                        <span className="text-gray-600 dark:text-gray-400">Transactions</span>
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">{stats.transaction_count || 0}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recent Activity */}
                    <div className="card">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                        {activityLogs.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm">No recent activity</p>
                        ) : (
                            <div className="space-y-3">
                                {activityLogs.slice(0, 5).map((log, index) => (
                                    <div key={index} className="flex items-start gap-3">
                                        <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg shrink-0">
                                            <Clock className="w-4 h-4 text-gray-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-900 dark:text-white">{log.action}</p>
                                            <p className="text-xs text-gray-500">{formatDateTime(log.created_at)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
