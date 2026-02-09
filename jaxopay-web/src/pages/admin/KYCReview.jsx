import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Shield,
    Check,
    X,
    Eye,
    FileText,
    User,
    Calendar,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    Download,
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatDateTime } from '../../utils/formatters';

const DOC_TYPES = {
    passport: { label: 'Passport', icon: FileText },
    national_id: { label: 'National ID', icon: FileText },
    drivers_license: { label: "Driver's License", icon: FileText },
};

const KYCReview = () => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchPendingKYC();
    }, [pagination.page]);

    const fetchPendingKYC = async () => {
        setLoading(true);
        const result = await adminService.getPendingKYC({
            page: pagination.page,
            limit: pagination.limit,
        });
        if (result.success) {
            setDocuments(result.data.documents || []);
            setPagination(prev => ({
                ...prev,
                total: result.data.pagination?.total || 0
            }));
        }
        setLoading(false);
    };

    const handleReviewDoc = (doc) => {
        setSelectedDoc(doc);
        setShowReviewModal(true);
    };

    const handleVerify = async (documentId, status, rejectionReason) => {
        setActionLoading(true);
        const result = await adminService.verifyKYCDocument(documentId, status, rejectionReason);
        if (result.success) {
            fetchPendingKYC();
            setShowReviewModal(false);
        }
        setActionLoading(false);
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KYC Review</h1>
                    <p className="text-gray-600 dark:text-gray-400">{pagination.total} pending documents</p>
                </div>
                <button
                    onClick={fetchPendingKYC}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Pending Documents */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                    </div>
                ) : documents.length === 0 ? (
                    <div className="text-center py-12">
                        <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No pending documents</h3>
                        <p className="text-gray-500">All KYC submissions have been reviewed</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {documents.map((doc) => (
                            <div
                                key={doc.id}
                                className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                                            <FileText className="w-6 h-6 text-yellow-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                                    {DOC_TYPES[doc.document_type]?.label || doc.document_type}
                                                </h3>
                                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                                                    Pending
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <User className="w-4 h-4" />
                                                    {doc.user?.email || 'Unknown user'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4" />
                                                    {formatDateTime(doc.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                Document #: {doc.document_number}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleReviewDoc(doc)}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                                    >
                                        <Eye className="w-4 h-4" />
                                        Review
                                    </button>
                                </div>
                            </div>
                        ))}
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

            {/* Review Modal */}
            <AnimatePresence>
                {showReviewModal && selectedDoc && (
                    <KYCReviewModal
                        document={selectedDoc}
                        onClose={() => setShowReviewModal(false)}
                        onVerify={handleVerify}
                        loading={actionLoading}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// KYC Review Modal
const KYCReviewModal = ({ document, onClose, onVerify, loading }) => {
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectForm, setShowRejectForm] = useState(false);

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
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Review KYC Document</h2>
                        <p className="text-gray-500">
                            {DOC_TYPES[document.document_type]?.label || document.document_type}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* User Info */}
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-3">User Information</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-gray-500">Email:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">{document.user?.email}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Name:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">
                                    {document.user?.first_name} {document.user?.last_name}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500">Document Number:</span>
                                <span className="ml-2 text-gray-900 dark:text-white font-mono">{document.document_number}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Submitted:</span>
                                <span className="ml-2 text-gray-900 dark:text-white">{formatDateTime(document.created_at)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Document Images */}
                    <div className="mb-6">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-3">Document Images</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {document.document_front_url && (
                                <div className="relative group">
                                    <img
                                        src={document.document_front_url}
                                        alt="Document Front"
                                        className="w-full h-48 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                        <a
                                            href={document.document_front_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-white text-gray-900 font-medium rounded-lg"
                                        >
                                            View Full
                                        </a>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2 text-center">Front</p>
                                </div>
                            )}
                            {document.document_back_url && (
                                <div className="relative group">
                                    <img
                                        src={document.document_back_url}
                                        alt="Document Back"
                                        className="w-full h-48 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                        <a
                                            href={document.document_back_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-white text-gray-900 font-medium rounded-lg"
                                        >
                                            View Full
                                        </a>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2 text-center">Back</p>
                                </div>
                            )}
                            {document.selfie_url && (
                                <div className="relative group">
                                    <img
                                        src={document.selfie_url}
                                        alt="Selfie"
                                        className="w-full h-48 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                        <a
                                            href={document.selfie_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-white text-gray-900 font-medium rounded-lg"
                                        >
                                            View Full
                                        </a>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2 text-center">Selfie</p>
                                </div>
                            )}
                        </div>

                        {!document.document_front_url && !document.document_back_url && !document.selfie_url && (
                            <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                                <p className="text-gray-500">No document images available</p>
                            </div>
                        )}
                    </div>

                    {/* Rejection Reason */}
                    {showRejectForm && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Rejection Reason
                            </label>
                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Enter reason for rejection..."
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                                rows={3}
                            />
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-4">
                        {!showRejectForm ? (
                            <>
                                <button
                                    onClick={() => setShowRejectForm(true)}
                                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-xl"
                                >
                                    <X className="w-5 h-5" />
                                    Reject
                                </button>
                                <button
                                    onClick={() => onVerify(document.id, 'approved')}
                                    disabled={loading}
                                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl disabled:opacity-50"
                                >
                                    <Check className="w-5 h-5" />
                                    {loading ? 'Approving...' : 'Approve'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setShowRejectForm(false)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => onVerify(document.id, 'rejected', rejectionReason)}
                                    disabled={!rejectionReason || loading}
                                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl disabled:opacity-50"
                                >
                                    <AlertTriangle className="w-5 h-5" />
                                    {loading ? 'Rejecting...' : 'Confirm Rejection'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default KYCReview;
