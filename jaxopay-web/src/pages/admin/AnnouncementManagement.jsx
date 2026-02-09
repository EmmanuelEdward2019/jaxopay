import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Megaphone,
    Plus,
    X,
    Trash2,
    Calendar,
    Target,
    Type,
    MessageSquare,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Info,
    RefreshCw
} from 'lucide-react';
import announcementService from '../../services/announcementService';
import { formatDateTime } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';

const AnnouncementManagement = () => {
    const { user } = useAuthStore();
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        message: '',
        type: 'info',
        target_audience: 'all',
        ends_at: ''
    });

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        setLoading(true);
        // Note: The backend currently only has getActiveAnnouncements.
        // For a full management UI, we might need a get-all-announcements endpoint.
        // But for now we'll use active and just handle creation.
        const result = await announcementService.getActiveAnnouncements();
        if (result.success) {
            setAnnouncements(result.data);
        }
        setLoading(false);
    };

    const handleCreateAnnouncement = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const result = await announcementService.createAnnouncement(formData);
        if (result.success) {
            setMessage({ type: 'success', text: 'Announcement created successfully!' });
            setShowCreateModal(false);
            setFormData({
                title: '',
                message: '',
                type: 'info',
                target_audience: 'all',
                ends_at: ''
            });
            fetchAnnouncements();
        } else {
            setMessage({ type: 'error', text: result.error });
        }
        setIsSubmitting(false);
    };

    const handleDeactivate = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this announcement?')) return;

        const result = await announcementService.deactivateAnnouncement(id);
        if (result.success) {
            setMessage({ type: 'success', text: 'Announcement deactivated' });
            fetchAnnouncements();
        } else {
            setMessage({ type: 'error', text: result.error });
        }
    };

    const getTypeStyles = (type) => {
        switch (type) {
            case 'info': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'warning': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
            case 'error': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            default: return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Announcement Management</h1>
                    <p className="text-gray-600 dark:text-gray-400">Create and manage platform-wide announcements</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-2xl transition-all shadow-lg"
                >
                    <Plus className="w-5 h-5" />
                    New Announcement
                </button>
            </div>

            {message && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20' : 'bg-red-50 text-red-700 dark:bg-red-900/20'}`}
                >
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    <p className="text-sm font-medium">{message.text}</p>
                    <button onClick={() => setMessage(null)} className="ml-auto">
                        <X className="w-4 h-4" />
                    </button>
                </motion.div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-primary-500" />
                        Active Announcements
                    </h3>
                    <button onClick={fetchAnnouncements} className="p-2 text-gray-400 hover:text-primary-500">
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {loading ? (
                        Array(3).fill(0).map((_, i) => (
                            <div key={i} className="p-6 animate-pulse space-y-3">
                                <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-1/4"></div>
                                <div className="h-8 bg-gray-50 dark:bg-gray-700/50 rounded w-full"></div>
                            </div>
                        ))
                    ) : announcements.length === 0 ? (
                        <div className="p-12 text-center">
                            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 dark:text-gray-400">No active announcements</p>
                        </div>
                    ) : (
                        announcements.map((ann) => (
                            <div key={ann.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="space-y-2 flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getTypeStyles(ann.type)}`}>
                                                {ann.type}
                                            </span>
                                            <span className="text-xs text-gray-400 font-medium">
                                                Target: <span className="text-gray-600 dark:text-gray-300 capitalize">{ann.target_audience}</span>
                                            </span>
                                        </div>
                                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">{ann.title}</h4>
                                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{ann.message}</p>
                                        <div className="flex flex-wrap items-center gap-4 pt-2">
                                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                                <Calendar className="w-3.5 h-3.5" />
                                                Created: {formatDateTime(ann.created_at)}
                                            </div>
                                            {ann.ends_at && (
                                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    Expires: {formatDateTime(ann.ends_at)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeactivate(ann.id)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                        title="Deactivate Announcement"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Create Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">New Announcement</h3>
                                    <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                        <X className="w-6 h-6 text-gray-400" />
                                    </button>
                                </div>

                                <form onSubmit={handleCreateAnnouncement} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                            <Type className="w-4 h-4 text-primary-500" />
                                            Title
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="System Update, Holiday Notice, etc."
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                <Info className="w-4 h-4 text-primary-500" />
                                                Type
                                            </label>
                                            <select
                                                value={formData.type}
                                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none"
                                            >
                                                <option value="info">Information</option>
                                                <option value="warning">Warning</option>
                                                <option value="error">Critical / Error</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                <Target className="w-4 h-4 text-primary-500" />
                                                Audience
                                            </label>
                                            <select
                                                value={formData.target_audience}
                                                onChange={e => setFormData({ ...formData, target_audience: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none"
                                            >
                                                <option value="all">Everyone</option>
                                                <option value="end_user">Customers Only</option>
                                                <option value="admin">Staff Only</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4 text-primary-500" />
                                            Message
                                        </label>
                                        <textarea
                                            required
                                            value={formData.message}
                                            onChange={e => setFormData({ ...formData, message: e.target.value })}
                                            placeholder="Details of the announcement..."
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none h-32 resize-none"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-primary-500" />
                                            Expiry Date (Optional)
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={formData.ends_at}
                                            onChange={e => setFormData({ ...formData, ends_at: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none"
                                        />
                                    </div>

                                    <div className="flex gap-4 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateModal(false)}
                                            className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-200 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="flex-1 py-4 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50"
                                        >
                                            {isSubmitting ? 'Creating...' : 'Post Announcement'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AnnouncementManagement;
