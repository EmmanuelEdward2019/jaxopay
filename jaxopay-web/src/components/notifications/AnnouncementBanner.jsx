import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Megaphone, ArrowRight, Info, AlertTriangle } from 'lucide-react';
import announcementService from '../../services/announcementService';

const AnnouncementBanner = () => {
    const [announcements, setAnnouncements] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        fetchActiveAnnouncements();
    }, []);

    const fetchActiveAnnouncements = async () => {
        const result = await announcementService.getActiveAnnouncements();
        if (result.success && result.data.length > 0) {
            setAnnouncements(result.data);
        } else {
            setIsVisible(false);
        }
    };

    const handleNext = () => {
        if (currentIndex < announcements.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            setCurrentIndex(0);
        }
    };

    const currentAnnouncement = announcements[currentIndex];

    if (!isVisible || announcements.length === 0) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className={`relative w-full z-40 bg-gradient-to-r ${currentAnnouncement.type === 'error' ? 'from-red-600 to-red-500' :
                            currentAnnouncement.type === 'warning' ? 'from-amber-500 to-amber-400' :
                                'from-primary-600 to-primary-500'
                        } text-white shadow-lg overflow-hidden`}
                >
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="shrink-0 p-1.5 bg-white/20 rounded-lg">
                                {currentAnnouncement.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> :
                                    currentAnnouncement.type === 'error' ? <X className="w-4 h-4" /> :
                                        <Megaphone className="w-4 h-4" />}
                            </div>
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="hidden sm:inline-block font-bold text-xs uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                                    {currentAnnouncement.type || 'Update'}
                                </span>
                                <p className="text-sm font-medium truncate">
                                    <span className="font-bold mr-1">{currentAnnouncement.title}:</span>
                                    {currentAnnouncement.message}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {announcements.length > 1 && (
                                <button
                                    onClick={handleNext}
                                    className="p-1 hover:bg-white/20 rounded transition-colors"
                                    title="Next Announcement"
                                >
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            )}
                            <button
                                onClick={() => setIsVisible(false)}
                                className="p-1 hover:bg-white/20 rounded transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Progress bar if multiple */}
                    {announcements.length > 1 && (
                        <div className="absolute bottom-0 left-0 h-1 bg-black/10 w-full">
                            <motion.div
                                className="h-full bg-white/40"
                                initial={{ width: "0%" }}
                                animate={{ width: `${((currentIndex + 1) / announcements.length) * 100}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AnnouncementBanner;
