import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Shield,
    Upload,
    Check,
    X,
    AlertTriangle,
    Clock,
    FileText,
    Camera,
    User,
    CreditCard,
    ChevronRight,
    Info,
} from 'lucide-react';
import kycService from '../../services/kycService';
import { formatCurrency } from '../../utils/formatters';

const TIER_INFO = {
    tier_0: {
        name: 'Unverified',
        color: 'bg-gray-100 text-gray-700',
        limits: { daily: 100, monthly: 500, card: false, crypto: false },
    },
    tier_1: {
        name: 'Basic',
        color: 'bg-blue-100 text-blue-700',
        limits: { daily: 1000, monthly: 5000, card: false, crypto: true },
    },
    tier_2: {
        name: 'Verified',
        color: 'bg-green-100 text-green-700',
        limits: { daily: 10000, monthly: 50000, card: true, crypto: true },
    },
};

const DOCUMENT_TYPES = [
    { id: 'passport', name: 'Passport', icon: FileText },
    { id: 'national_id', name: 'National ID', icon: CreditCard },
    { id: 'drivers_license', name: "Driver's License", icon: CreditCard },
];

const KYC = () => {
    const [kycStatus, setKycStatus] = useState(null);
    const [tierLimits, setTierLimits] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Upload form state
    const [documentType, setDocumentType] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [documentFront, setDocumentFront] = useState(null);
    const [documentBack, setDocumentBack] = useState(null);
    const [selfie, setSelfie] = useState(null);

    const frontInputRef = useRef(null);
    const backInputRef = useRef(null);
    const selfieInputRef = useRef(null);

    useEffect(() => {
        fetchKYCData();
    }, []);

    const fetchKYCData = async () => {
        setLoading(true);
        const [statusResult, limitsResult, docsResult] = await Promise.all([
            kycService.getKYCStatus(),
            kycService.getTierLimits(),
            kycService.getDocuments(),
        ]);

        if (statusResult.success) {
            setKycStatus(statusResult.data);
        }
        if (limitsResult.success) {
            setTierLimits(limitsResult.data);
        }
        if (docsResult.success) {
            setDocuments(docsResult.data.documents || []);
        }
        setLoading(false);
    };

    const handleFileChange = (e, setter) => {
        const file = e.target.files[0];
        if (file) {
            setter(file);
        }
    };

    const handleSubmitKYC = async () => {
        if (!documentType || !documentNumber || !documentFront) {
            setError('Please fill in all required fields');
            return;
        }

        setSubmitting(true);
        setError(null);
        const result = await kycService.submitDocument({
            document_type: documentType,
            document_number: documentNumber,
            document_front: documentFront,
            document_back: documentBack,
            selfie: selfie,
        });

        if (result.success) {
            setSuccess('Documents submitted successfully! Verification usually takes 24-48 hours.');
            setShowUploadForm(false);
            resetForm();
            fetchKYCData();
        } else {
            setError(result.error);
        }
        setSubmitting(false);
    };

    const resetForm = () => {
        setDocumentType('');
        setDocumentNumber('');
        setDocumentFront(null);
        setDocumentBack(null);
        setSelfie(null);
    };

    const currentTier = kycStatus?.kyc_tier || 'tier_0';
    const tierData = TIER_INFO[currentTier];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KYC Verification</h1>
                <p className="text-gray-600 dark:text-gray-400">Verify your identity to unlock higher limits</p>
            </div>

            {/* Alerts */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}
            {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-green-700 dark:text-green-300">{success}</p>
                    <button onClick={() => setSuccess(null)} className="text-green-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}

            {/* Current Status Card */}
            <div className="card bg-gradient-to-br from-primary-500 to-primary-700 text-white">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-primary-100 text-sm mb-1">Current Verification Level</p>
                        <div className="flex items-center gap-3 mb-4">
                            <h2 className="text-2xl font-bold">{tierData.name}</h2>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${tierData.color}`}>
                                {currentTier.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>
                        {kycStatus?.verification_status === 'pending' && (
                            <div className="flex items-center gap-2 text-yellow-300">
                                <Clock className="w-5 h-5" />
                                <span>Verification in progress</span>
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-white/10 rounded-2xl">
                        <Shield className="w-12 h-12" />
                    </div>
                </div>
            </div>

            {/* Tier Comparison */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Verification Tiers</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(TIER_INFO).map(([tier, info]) => (
                        <div
                            key={tier}
                            className={`p-4 rounded-xl border-2 ${currentTier === tier
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${info.color}`}>
                                    {info.name}
                                </span>
                                {currentTier === tier && <Check className="w-5 h-5 text-primary-600" />}
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Daily Limit</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(info.limits.daily, 'USD')}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Monthly Limit</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(info.limits.monthly, 'USD')}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Virtual Cards</span>
                                    <span className={info.limits.card ? 'text-green-600' : 'text-red-600'}>
                                        {info.limits.card ? '✓' : '✗'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Crypto Trading</span>
                                    <span className={info.limits.crypto ? 'text-green-600' : 'text-red-600'}>
                                        {info.limits.crypto ? '✓' : '✗'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Upgrade Section */}
            {currentTier !== 'tier_2' && !showUploadForm && (
                <div className="card">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                                Upgrade to {currentTier === 'tier_0' ? 'Basic' : 'Verified'}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {currentTier === 'tier_0'
                                    ? 'Submit your ID to unlock crypto trading and higher limits'
                                    : 'Complete full verification for virtual cards and maximum limits'}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowUploadForm(true)}
                            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                        >
                            Start Verification
                        </button>
                    </div>
                </div>
            )}

            {/* Document Upload Form */}
            {showUploadForm && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Submit Documents</h3>
                        <button
                            onClick={() => {
                                setShowUploadForm(false);
                                resetForm();
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* Document Type Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Document Type
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                {DOCUMENT_TYPES.map((doc) => (
                                    <button
                                        key={doc.id}
                                        onClick={() => setDocumentType(doc.id)}
                                        className={`p-4 rounded-xl border-2 text-center transition-colors ${documentType === doc.id
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                : 'border-gray-200 dark:border-gray-700'
                                            }`}
                                    >
                                        <doc.icon className={`w-6 h-6 mx-auto mb-2 ${documentType === doc.id ? 'text-primary-600' : 'text-gray-400'
                                            }`} />
                                        <p className="text-sm font-medium">{doc.name}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Document Number */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Document Number
                            </label>
                            <input
                                type="text"
                                value={documentNumber}
                                onChange={(e) => setDocumentNumber(e.target.value)}
                                placeholder="Enter document number"
                                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                            />
                        </div>

                        {/* File Uploads */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Front of Document */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Front of Document *
                                </label>
                                <div
                                    onClick={() => frontInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${documentFront ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 hover:border-primary-500'
                                        }`}
                                >
                                    {documentFront ? (
                                        <div className="text-green-600">
                                            <Check className="w-8 h-8 mx-auto mb-2" />
                                            <p className="text-sm">{documentFront.name}</p>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-sm text-gray-500">Click to upload</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    ref={frontInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleFileChange(e, setDocumentFront)}
                                    className="hidden"
                                />
                            </div>

                            {/* Back of Document */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Back of Document
                                </label>
                                <div
                                    onClick={() => backInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${documentBack ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 hover:border-primary-500'
                                        }`}
                                >
                                    {documentBack ? (
                                        <div className="text-green-600">
                                            <Check className="w-8 h-8 mx-auto mb-2" />
                                            <p className="text-sm">{documentBack.name}</p>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-sm text-gray-500">Click to upload</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    ref={backInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleFileChange(e, setDocumentBack)}
                                    className="hidden"
                                />
                            </div>

                            {/* Selfie */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Selfie with Document
                                </label>
                                <div
                                    onClick={() => selfieInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${selfie ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 hover:border-primary-500'
                                        }`}
                                >
                                    {selfie ? (
                                        <div className="text-green-600">
                                            <Check className="w-8 h-8 mx-auto mb-2" />
                                            <p className="text-sm">{selfie.name}</p>
                                        </div>
                                    ) : (
                                        <>
                                            <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                            <p className="text-sm text-gray-500">Click to upload</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    ref={selfieInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleFileChange(e, setSelfie)}
                                    className="hidden"
                                />
                            </div>
                        </div>

                        {/* Info */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 flex gap-3">
                            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-700 dark:text-blue-300">
                                <p className="font-medium mb-1">Tips for quick approval:</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-600 dark:text-blue-400">
                                    <li>Ensure all document details are clearly visible</li>
                                    <li>Photos should be well-lit and in focus</li>
                                    <li>Document should not be expired</li>
                                </ul>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmitKYC}
                            disabled={!documentType || !documentNumber || !documentFront || submitting}
                            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
                        >
                            {submitting ? 'Submitting...' : 'Submit for Verification'}
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Previous Submissions */}
            {documents.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Submitted Documents</h3>
                    <div className="space-y-3">
                        {documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {doc.document_type?.replace('_', ' ').toUpperCase()}
                                        </p>
                                        <p className="text-sm text-gray-500">{doc.document_number}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${doc.status === 'approved' ? 'bg-green-100 text-green-700' :
                                        doc.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                            'bg-yellow-100 text-yellow-700'
                                    }`}>
                                    {doc.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default KYC;
