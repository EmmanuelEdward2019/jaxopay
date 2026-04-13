import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check, Trash2, Info, AlertTriangle, CheckCircle2, MessageSquare } from 'lucide-react';
import notificationService from '../../services/notificationService';
import { formatDateTime } from '../../utils/formatters';

const NotificationDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const pollMs = 180000; // 3 min — reduces load on remote DB (e.g. Supabase pooler)

        const tick = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            fetchUnreadCount();
        };

        tick();
        const interval = setInterval(tick, pollMs);

        const onVis = () => {
            if (document.visibilityState === 'visible') fetchUnreadCount();
        };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchUnreadCount = async () => {
        const result = await notificationService.getUnreadCount();
        if (result.success) {
            setUnreadCount(result.count);
        }
    };

    const fetchNotifications = async () => {
        setLoading(true);
        const result = await notificationService.getNotifications({ limit: 10 });
        if (result.success) {
            setNotifications(result.data.notifications);
        }
        setLoading(false);
    };

    const handleMarkAsRead = async (id) => {
        const result = await notificationService.markAsRead(id);
        if (result.success) {
            setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    };

    const handleMarkAllAsRead = async () => {
        const result = await notificationService.markAllAsRead();
        if (result.success) {
            setNotifications(notifications.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        const result = await notificationService.deleteNotification(id);
        if (result.success) {
            setNotifications(notifications.filter(n => n.id !== id));
            if (!notifications.find(n => n.id === id).is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        }
    };

    const handleNotificationClick = (notification) => {
        setSelectedNotification(notification);
        if (!notification.is_read) {
            handleMarkAsRead(notification.id);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'error': return <X className="w-5 h-5 text-danger" />;
            case 'announcement': return <Bell className="w-5 h-5 text-purple-500" />;
            default: return <Info className="w-5 h-5 text-primary" />;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-lg text-muted-foreground hover:bg-muted relative transition-colors"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 bg-card rounded-2xl shadow-2xl border border-border z-50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <h3 className="font-bold text-foreground">Notifications</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllAsRead}
                                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                                >
                                    Mark all as read
                                </button>
                            )}
                        </div>

                        {/* List */}
                        <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
                            {loading && notifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Bell className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <p className="text-muted-foreground font-medium">No notifications yet</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            onClick={() => handleNotificationClick(notification)}
                                            className={`p-4 flex gap-4 cursor-pointer hover:bg-muted/30 transition-colors group relative ${!notification.is_read ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''
                                                }`}
                                        >
                                            <div className="shrink-0 mt-0.5">
                                                {getIcon(notification.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <p className={`text-sm font-bold truncate ${notification.is_read ? 'text-foreground' : 'text-foreground'
                                                        }`}>
                                                        {notification.title}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground shrink-0">
                                                        {formatDateTime(notification.created_at)}
                                                    </p>
                                                </div>
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {notification.message}
                                                </p>
                                            </div>
                                            {!notification.is_read && (
                                                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3/4 bg-primary-600 rounded-full"></div>
                                            )}
                                            <button
                                                onClick={(e) => handleDelete(e, notification.id)}
                                                className="absolute right-4 bottom-4 p-1 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 bg-muted/50 border-t border-border text-center">
                            <button className="text-xs font-bold text-muted-foreground hover:text-foreground">
                                View all notifications
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Notification Detail Modal */}
            <AnimatePresence>
                {selectedNotification && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedNotification(null)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-border"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className={`h-2 bg-gradient-to-r ${selectedNotification.type === 'error' ? 'from-red-500 to-red-600' :
                                selectedNotification.type === 'warning' ? 'from-amber-500 to-amber-600' :
                                    selectedNotification.type === 'success' ? 'from-green-500 to-green-600' :
                                        'from-primary-500 to-primary-600'
                                }`}></div>

                            <div className="p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-3 rounded-2xl ${selectedNotification.type === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                                            selectedNotification.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20' :
                                                selectedNotification.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
                                                    'bg-primary-50 dark:bg-primary-900/20'
                                            }`}>
                                            {getIcon(selectedNotification.type)}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-foreground">{selectedNotification.title}</h3>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(selectedNotification.created_at)}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedNotification(null)}
                                        className="p-2 hover:bg-muted rounded-full transition-colors"
                                    >
                                        <X className="w-6 h-6 text-muted-foreground" />
                                    </button>
                                </div>

                                <div className="prose dark:prose-invert max-w-none">
                                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                        {selectedNotification.message}
                                    </p>
                                </div>

                                {selectedNotification.metadata && Object.keys(selectedNotification.metadata).length > 0 && (
                                    <div className="mt-8 p-4 bg-muted/30 rounded-2xl border border-border">
                                        <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Additional Information</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            {Object.entries(selectedNotification.metadata).map(([key, value]) => (
                                                <div key={key}>
                                                    <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                                                    <p className="text-sm font-semibold text-foreground">{String(value)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-8">
                                    <button
                                        onClick={() => setSelectedNotification(null)}
                                        className="w-full py-4 bg-background dark:bg-card text-white font-bold rounded-2xl hover:opacity-90 transition-all shadow-lg"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationDropdown;
