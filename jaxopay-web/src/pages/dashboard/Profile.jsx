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

    useEffect(() => {
        const sync = () => {
            if (document.visibilityState !== 'visible') return;
            fetchProfile();
            refreshSession();
        };
        document.addEventListener('visibilitychange', sync);
        window.addEventListener('focus', sync);
        return () => {
            document.removeEventListener('visibilitychange', sync);
            window.removeEventListener('focus', sync);
        };
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
            tier_0: { label: 'Unverified', color: 'bg-muted text-foreground' },
            tier_1: { label: 'Basic', color: 'bg-primary/10 text-blue-700' },
            tier_2: { label: 'Verified', color: 'bg-primary-100 text-primary-700' },
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
                <h1 className="text-2xl font-bold text-foreground">Profile</h1>
                <p className="text-muted-foreground">Manage your personal information</p>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-danger/10 border border-danger/20 rounded-lg p-4">
                    <p className="text-danger">{error}</p>
                    <button onClick={() => setError(null)} className="text-danger underline text-sm mt-1">
                        Dismiss
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Card */}
                <div className="lg:col-span-2">
                    <div className="card">
                        {/* Avatar Section */}
                        <div className="flex items-center gap-6 pb-6 border-b border-border">
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
                                    className="absolute bottom-0 right-0 p-2 bg-card rounded-full shadow-lg border border-border hover:bg-muted transition-colors"
                                >
                                    <Camera className="w-4 h-4 text-muted-foreground" />
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
                                <h2 className="text-xl font-bold text-foreground">
                                    {profile?.first_name && profile?.last_name
                                        ? `${profile.first_name} ${profile.last_name}`
                                        : user?.email?.split('@')[0]}
                                </h2>
                                <p className="text-muted-foreground">{user?.email}</p>
                                <span className={`inline-block mt-2 px-3 py-1 text-xs font-medium rounded-full ${kycBadge.color}`}>
                                    <Shield className="w-3 h-3 inline mr-1" />
                                    {kycBadge.label}
                                </span>
                            </div>
                        </div>

                        {/* Profile Form */}
                        <div className="pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-foreground">Personal Information</h3>
                                {!editing ? (
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                    >
                                        <Edit className="w-4 h-4" />
                                        Edit
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditing(false)}
                                            className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={handleUpdateProfile}
                                            disabled={saving}
                                            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Check className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">First Name</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.first_name}
                                            onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                                            className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-foreground font-medium">
                                            {profile?.first_name || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Last Name</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.last_name}
                                            onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                                            className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-foreground font-medium">
                                            {profile?.last_name || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                                        <Mail className="w-4 h-4 inline mr-1" />
                                        Email
                                    </label>
                                    <p className="text-foreground font-medium">{user?.email}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                                        <Phone className="w-4 h-4 inline mr-1" />
                                        Phone
                                    </label>
                                    {editing ? (
                                        <input
                                            type="tel"
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-foreground font-medium">
                                            {profile?.phone || '—'}
                                        </p>
                                    )}
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                                        <MapPin className="w-4 h-4 inline mr-1" />
                                        Address
                                    </label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.address}
                                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                            className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-foreground font-medium">
                                            {profile?.address || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">City</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.city}
                                            onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                                            className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-foreground font-medium">
                                            {profile?.city || '—'}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Country</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editForm.country}
                                            onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                                            className="w-full px-3 py-2 bg-card border border-border rounded-lg"
                                        />
                                    ) : (
                                        <p className="text-foreground font-medium">
                                            {profile?.country || '—'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-border">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                            <h3 className="text-lg font-semibold text-foreground mb-4">Account Stats</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 rounded-lg">
                                            <Wallet className="w-5 h-5 text-primary" />
                                        </div>
                                        <span className="text-muted-foreground">Wallets</span>
                                    </div>
                                    <span className="font-bold text-foreground">{stats.wallet_count || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-100 rounded-lg">
                                            <CreditCard className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <span className="text-muted-foreground">Cards</span>
                                    </div>
                                    <span className="font-bold text-foreground">{stats.card_count || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary-100 rounded-lg">
                                            <TrendingUp className="w-5 h-5 text-primary" />
                                        </div>
                                        <span className="text-muted-foreground">Transactions</span>
                                    </div>
                                    <span className="font-bold text-foreground">{stats.transaction_count || 0}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recent Activity */}
                    <div className="card">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
                        {activityLogs.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No recent activity</p>
                        ) : (
                            <div className="space-y-3">
                                {activityLogs.slice(0, 5).map((log, index) => (
                                    <div key={index} className="flex items-start gap-3">
                                        <div className="p-1.5 bg-muted rounded-lg shrink-0">
                                            <Clock className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-foreground">{log.action}</p>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
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
