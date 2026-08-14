import { Fragment, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail,
    Search,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Phone,
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatDateTime } from '../../utils/formatters';

const STATUS_COLORS = {
    new: 'bg-blue-100 text-blue-700',
    read: 'bg-gray-100 text-gray-700',
    responded: 'bg-primary-100 text-primary-700',
    archived: 'bg-gray-200 text-gray-500',
};

const PublicFormSubmissions = () => {
    const [submissions, setSubmissions] = useState([]);
    const [newCount, setNewCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [filters, setFilters] = useState({ search: '', status: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0 });

    const fetchSubmissions = async () => {
        setLoading(true);
        const result = await adminService.getPublicFormSubmissions({
            page: pagination.page,
            limit: pagination.limit,
            status: filters.status || undefined,
        });
        if (result.success) {
            setSubmissions(result.data.submissions);
            setNewCount(result.data.new_count);
            setPagination((prev) => ({ ...prev, total: result.data.pagination.total }));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSubmissions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagination.page, filters.status]);

    const visibleSubmissions = submissions.filter((s) => {
        if (!filters.search) return true;
        const q = filters.search.toLowerCase();
        return (
            s.name.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q) ||
            (s.subject || '').toLowerCase().includes(q)
        );
    });

    const toggleExpand = async (submission) => {
        const isOpening = expandedId !== submission.id;
        setExpandedId(isOpening ? submission.id : null);
        setNoteDraft(submission.admin_note || '');
        if (isOpening && submission.status === 'new') {
            const result = await adminService.updatePublicFormSubmission(submission.id, { status: 'read' });
            if (result.success) {
                setSubmissions((prev) => prev.map((s) => (s.id === submission.id ? { ...s, status: 'read' } : s)));
                setNewCount((prev) => Math.max(0, prev - 1));
            }
        }
    };

    const setStatus = async (id, status) => {
        const result = await adminService.updatePublicFormSubmission(id, { status });
        if (result.success) {
            setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
        }
    };

    const saveNote = async (id) => {
        const result = await adminService.updatePublicFormSubmission(id, { admin_note: noteDraft });
        if (result.success) {
            setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, admin_note: noteDraft } : s)));
        }
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        Contact Messages
                        {newCount > 0 && (
                            <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">{newCount} new</span>
                        )}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">Submissions from public-page forms (Contact, etc.)</p>
                </div>
                <button
                    onClick={fetchSubmissions}
                    className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-colors self-start sm:self-auto"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by name, email or subject..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                        value={filters.search}
                        onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                    />
                </div>
                <select
                    className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-sm"
                    value={filters.status}
                    onChange={(e) => {
                        setFilters((prev) => ({ ...prev, status: e.target.value }));
                        setPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                >
                    <option value="">All Statuses</option>
                    <option value="new">New</option>
                    <option value="read">Read</option>
                    <option value="responded">Responded</option>
                    <option value="archived">Archived</option>
                </select>
            </div>

            {/* List */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm divide-y divide-gray-200 dark:divide-gray-700">
                {!loading && visibleSubmissions.length === 0 && (
                    <div className="px-6 py-10 text-center text-gray-400 text-sm">No messages match these filters.</div>
                )}
                {visibleSubmissions.map((s) => {
                    const isExpanded = expandedId === s.id;
                    return (
                        <Fragment key={s.id}>
                            <div
                                onClick={() => toggleExpand(s)}
                                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center text-accent-600 shrink-0">
                                        <Mail className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-900 dark:text-white truncate">
                                            {s.name} <span className="text-gray-400 font-normal">— {s.email}</span>
                                        </p>
                                        <p className="text-sm text-gray-500 truncate">{s.subject || '(no subject)'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                                    <span className="hidden sm:inline text-xs text-gray-400">{formatDateTime(s.created_at)}</span>
                                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full capitalize ${STATUS_COLORS[s.status] || STATUS_COLORS.new}`}>
                                        {s.status}
                                    </span>
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                </div>
                            </div>
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden bg-gray-50 dark:bg-gray-900/40"
                                    >
                                        <div className="px-6 py-5 space-y-4">
                                            {s.phone && (
                                                <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                                                    <Phone className="w-3.5 h-3.5" /> {s.phone}
                                                </p>
                                            )}
                                            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                                                {s.message}
                                            </p>

                                            <div className="flex flex-wrap gap-2">
                                                {['new', 'read', 'responded', 'archived'].map((st) => (
                                                    <button
                                                        key={st}
                                                        onClick={(e) => { e.stopPropagation(); setStatus(s.id, st); }}
                                                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border capitalize transition-colors ${s.status === st
                                                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                                                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                            }`}
                                                    >
                                                        Mark {st}
                                                    </button>
                                                ))}
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Internal note</label>
                                                <textarea
                                                    value={noteDraft}
                                                    onChange={(e) => setNoteDraft(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    rows={2}
                                                    placeholder="Not visible to the sender — for admin/support reference only"
                                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                                                />
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); saveNote(s.id); }}
                                                    className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-600 text-white"
                                                >
                                                    Save Note
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Fragment>
                    );
                })}

                {/* Pagination */}
                <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-gray-700/30 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-500">
                        Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} messages
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page === 1}
                            className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page >= totalPages}
                            className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicFormSubmissions;
