import { useState, useEffect, useRef } from 'react';
import { motion as Motion } from 'framer-motion';
import '@smile_identity/smart-camera-web';
import {
    Shield,
    Upload,
    Check,
    X,
    AlertTriangle,
    Clock,
    FileText,
    Camera,
    CreditCard,
    Info,
    Home,
} from 'lucide-react';
import kycService from '../../services/kycService';
import { SMILE_ISO2_COUNTRIES, getSmileIdTypeOptions } from '../../constants/smileKycOptions';
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
        color: 'bg-accent-100 text-accent-700',
        limits: { daily: 10000, monthly: 50000, card: true, crypto: true },
    },
};

/** Tier 1 (basic): government ID */
const TIER1_DOCUMENT_TYPES = [
    { id: 'passport', name: 'Passport', icon: FileText },
    { id: 'national_id', name: 'National ID', icon: CreditCard },
    { id: 'drivers_license', name: "Driver's License", icon: CreditCard },
];

/** Tier 2: Nigeria-focused + proof of address */
const TIER2_DOCUMENT_TYPES = [
    { id: 'nin', name: 'NIN', icon: CreditCard },
    { id: 'bvn', name: 'BVN', icon: CreditCard },
    { id: 'proof_of_address', name: 'Proof of address', icon: Home },
];

const KYC = () => {
    const [kycStatus, setKycStatus] = useState(null);
    const [, setTierLimits] = useState(null);
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
    const smileCameraHostRef = useRef(null);
    const smileSubmittingRef = useRef(false);
    const smileFormRef = useRef({
        first_name: '',
        last_name: '',
        country: 'NG',
        id_type: 'NIN_V2',
        id_number: '',
        dob: '',
    });

    const [smileConfigured, setSmileConfigured] = useState(false);
    const [showSmileWizard, setShowSmileWizard] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [smileForm, setSmileForm] = useState({
        first_name: '',
        last_name: '',
        country: 'NG',
        id_type: 'NIN_V2',
        id_number: '',
        dob: '',
    });

    useEffect(() => {
        smileFormRef.current = smileForm;
    }, [smileForm]);

    useEffect(() => {
        setSmileForm((s) => {
            const opts = getSmileIdTypeOptions(s.country);
            if (opts.some((o) => o.value === s.id_type)) return s;
            return { ...s, id_type: opts[0]?.value || '' };
        });
    }, [smileForm.country]);

    useEffect(() => {
        fetchKYCData();
    }, []);

    const fetchKYCData = async () => {
        setLoading(true);
        const [statusResult, limitsResult, docsResult, smileCfg] = await Promise.all([
            kycService.getKYCStatus(),
            kycService.getTierLimits(),
            kycService.getDocuments(),
            kycService.getSmileConfig(),
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
        if (smileCfg.success && smileCfg.data?.configured) {
            setSmileConfigured(true);
        } else {
            setSmileConfigured(false);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!showCameraModal || !smileCameraHostRef.current) return undefined;

        const host = smileCameraHostRef.current;
        host.innerHTML = '';
        const el = document.createElement('smart-camera-web');
        el.setAttribute('capture-id', '');

        const onImages = async (e) => {
            const { images } = e.detail || {};
            if (!images?.length) {
                setError('No images captured. Please try again.');
                setShowCameraModal(false);
                return;
            }
            smileSubmittingRef.current = true;
            setSubmitting(true);
            setError(null);
            const f = smileFormRef.current;
            try {
                const result = await kycService.submitSmileBiometric({
                    first_name: f.first_name.trim(),
                    last_name: f.last_name.trim(),
                    country: f.country.trim().toUpperCase(),
                    id_type: f.id_type.trim(),
                    id_number: f.id_number.trim(),
                    dob: f.dob?.trim() || undefined,
                    images,
                });
                if (result.success) {
                    setSuccess(
                        result.message ||
                            result.data?.message ||
                            'Verification submitted. We will update you when processing completes.'
                    );
                    fetchKYCData();
                } else {
                    setError(result.error || 'Submission failed');
                }
            } finally {
                smileSubmittingRef.current = false;
                setSubmitting(false);
                setShowCameraModal(false);
                setShowSmileWizard(false);
            }
        };

        const onClose = () => {
            if (smileSubmittingRef.current) return;
            setShowCameraModal(false);
        };

        el.addEventListener('imagesComputed', onImages);
        el.addEventListener('close', onClose);
        el.addEventListener('backExit', onClose);
        host.appendChild(el);

        return () => {
            el.removeEventListener('imagesComputed', onImages);
            el.removeEventListener('close', onClose);
            el.removeEventListener('backExit', onClose);
            el.remove();
            host.innerHTML = '';
        };
    }, [showCameraModal]);

    const handleFileChange = (e, setter) => {
        const file = e.target.files[0];
        if (file) {
            setter(file);
        }
    };

    const handleSubmitKYC = async () => {
        const needsDocNumber =
            documentType !== 'proof_of_address' && documentType !== 'utility_bill';
        if (!documentType || !documentFront || (needsDocNumber && !documentNumber.trim())) {
            setError('Please fill in all required fields');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const result = await kycService.submitDocument({
                document_type: documentType,
                document_number: documentNumber.trim(),
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
        } catch (e) {
            setError(e?.message || 'Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setDocumentType('');
        setDocumentNumber('');
        setDocumentFront(null);
        setDocumentBack(null);
        setSelfie(null);
    };

    const rawTier = kycStatus?.kyc_tier;
    const currentTier =
        typeof rawTier === 'string' && rawTier.startsWith('tier_')
            ? rawTier
            : `tier_${Number(rawTier) || 0}`;
    const tierData = TIER_INFO[currentTier] || TIER_INFO.tier_0;

    const uploadDocOptions =
        currentTier === 'tier_0' ? TIER1_DOCUMENT_TYPES : TIER2_DOCUMENT_TYPES;
    const smileIdTypeOptions = getSmileIdTypeOptions(smileForm.country);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-600"></div>
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
                <div className="bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 rounded-lg p-4">
                    <p className="text-accent-700 dark:text-accent-300">{success}</p>
                    <button onClick={() => setSuccess(null)} className="text-accent-500 underline text-sm mt-1">Dismiss</button>
                </div>
            )}

            {/* Current Status Card */}
            <div className="card bg-gradient-to-br from-accent-600 to-emerald-700 text-white shadow-lg shadow-accent-500/20">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-primary-100 text-sm mb-1">Current Verification Level</p>
                        <div className="flex items-center gap-3 mb-4">
                            <h2 className="text-2xl font-bold">{tierData.name}</h2>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${tierData.color}`}>
                                {currentTier.replace('_', ' ').toUpperCase()}
                            </span>
                        </div>
                        {kycStatus?.kyc_status === 'pending' && (
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
                                ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                                : 'border-gray-200 dark:border-gray-700'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${info.color}`}>
                                    {info.name}
                                </span>
                                {currentTier === tier && <Check className="w-5 h-5 text-accent-600" />}
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
                                    <span className={info.limits.crypto ? 'text-accent-600' : 'text-red-600'}>
                                        {info.limits.card ? '✓' : '✗'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Crypto Trading</span>
                                    <span className={info.limits.crypto ? 'text-primary-600' : 'text-red-600'}>
                                        {info.limits.crypto ? '✓' : '✗'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Smile ID — liveness + ID capture (primary when configured) */}
            {smileConfigured && currentTier !== 'tier_2' && !showSmileWizard && !showUploadForm && (
                <div className="card border-2 border-accent-200 dark:border-accent-800">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                                Verify with live face check
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Complete guided camera capture: liveness photos, selfie, and ID images. Your details are
                                checked against official records. Use Chrome, Safari, or Edge on HTTPS (or localhost).
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setShowSmileWizard(true);
                                setError(null);
                            }}
                            className="shrink-0 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white font-medium rounded-lg shadow-lg shadow-accent-500/20"
                        >
                            Start liveness verification
                        </button>
                    </div>
                </div>
            )}

            {smileConfigured && showSmileWizard && (
                <Motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Identity details</h3>
                        <button
                            type="button"
                            onClick={() => {
                                setShowSmileWizard(false);
                                setError(null);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Choose your country and ID type — values match what your verification provider expects for
                        that country.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                First name
                            </label>
                            <input
                                value={smileForm.first_name}
                                onChange={(e) => setSmileForm((s) => ({ ...s, first_name: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Last name
                            </label>
                            <input
                                value={smileForm.last_name}
                                onChange={(e) => setSmileForm((s) => ({ ...s, last_name: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Country
                            </label>
                            <select
                                value={smileForm.country}
                                onChange={(e) =>
                                    setSmileForm((s) => ({ ...s, country: e.target.value.toUpperCase() }))
                                }
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                            >
                                {SMILE_ISO2_COUNTRIES.map((c) => (
                                    <option key={c.code} value={c.code}>
                                        {c.name} ({c.code})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ID type
                            </label>
                            <select
                                value={smileForm.id_type}
                                onChange={(e) => setSmileForm((s) => ({ ...s, id_type: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                            >
                                {smileIdTypeOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ID number
                            </label>
                            <input
                                value={smileForm.id_number}
                                onChange={(e) => setSmileForm((s) => ({ ...s, id_number: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Date of birth (optional)
                            </label>
                            <input
                                type="date"
                                value={smileForm.dob}
                                onChange={(e) => setSmileForm((s) => ({ ...s, dob: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={
                            submitting ||
                            !smileForm.first_name.trim() ||
                            !smileForm.last_name.trim() ||
                            smileForm.country.trim().length !== 2 ||
                            !smileForm.id_type.trim() ||
                            !smileForm.id_number.trim()
                        }
                        onClick={() => setShowCameraModal(true)}
                        className="mt-6 w-full md:w-auto px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        Open camera — liveness &amp; ID
                    </button>
                </Motion.div>
            )}

            {showCameraModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 relative">
                        <button
                            type="button"
                            className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-gray-100 dark:bg-gray-800"
                            onClick={() => {
                                if (smileSubmittingRef.current) return;
                                setShowCameraModal(false);
                            }}
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 pr-10">
                            Allow camera access, then follow on-screen steps: liveness capture, selfie review, then ID
                            front (and back if prompted).
                        </p>
                        <div ref={smileCameraHostRef} className="min-h-[320px] w-full relative" />
                        {submitting && (
                            <div className="mt-3 text-center text-sm font-medium text-accent-700 dark:text-accent-300">
                                Uploading images — please keep this page open…
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Upgrade Section — manual fallback */}
            {currentTier !== 'tier_2' && !showUploadForm && !showSmileWizard && (
                <div className="card">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                                {smileConfigured ? 'Other option: manual upload' : `Upgrade to ${currentTier === 'tier_0' ? 'Basic' : 'Verified'}`}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {smileConfigured
                                    ? 'Upload documents for manual review if you cannot use the camera flow.'
                                    : currentTier === 'tier_0'
                                      ? 'Submit your ID to unlock crypto trading and higher limits'
                                      : 'Complete full verification for virtual cards and maximum limits'}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowUploadForm(true)}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white font-medium rounded-lg"
                        >
                            {smileConfigured ? 'Manual upload' : 'Start Verification'}
                        </button>
                    </div>
                </div>
            )}

            {/* Document Upload Form */}
            {showUploadForm && (
                <Motion.div
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
                        {currentTier === 'tier_1' && (
                            <div className="rounded-lg border border-accent-200 dark:border-accent-800 bg-accent-50/50 dark:bg-accent-900/10 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                <strong className="text-gray-900 dark:text-white">Tier 2 (verified):</strong> submit
                                your NIN, BVN, and proof of address (utility bill or bank statement dated within 3
                                months). You can upload each as a separate submission.
                            </div>
                        )}
                        {/* Document Type Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Document Type
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {uploadDocOptions.map((doc) => (
                                    <button
                                        key={doc.id}
                                        onClick={() => setDocumentType(doc.id)}
                                        className={`p-4 rounded-xl border-2 text-center transition-colors ${documentType === doc.id
                                            ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                                            : 'border-gray-200 dark:border-gray-700'
                                            }`}
                                    >
                                        <doc.icon className={`w-6 h-6 mx-auto mb-2 ${documentType === doc.id ? 'text-accent-600' : 'text-gray-400'
                                            }`} />
                                        <p className="text-sm font-medium">{doc.name}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Document Number */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Document number{' '}
                                {documentType === 'proof_of_address' || documentType === 'utility_bill'
                                    ? '(optional)'
                                    : '*'}
                            </label>
                            <input
                                type="text"
                                value={documentNumber}
                                onChange={(e) => setDocumentNumber(e.target.value)}
                                placeholder={
                                    documentType === 'proof_of_address' || documentType === 'utility_bill'
                                        ? 'e.g. account or reference (optional)'
                                        : 'Enter document number'
                                }
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
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${documentFront ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-gray-300 hover:border-accent-500'
                                        }`}
                                >
                                    {documentFront ? (
                                        <div className="text-accent-600">
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
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${documentBack ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 hover:border-primary-500'
                                        }`}
                                >
                                    {documentBack ? (
                                        <div className="text-primary-600">
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
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${selfie ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 hover:border-primary-500'
                                        }`}
                                >
                                    {selfie ? (
                                        <div className="text-primary-600">
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
                            disabled={
                                !documentType ||
                                !documentFront ||
                                submitting ||
                                (documentType !== 'proof_of_address' &&
                                    documentType !== 'utility_bill' &&
                                    !documentNumber.trim())
                            }
                            className="w-full py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg disabled:opacity-50 shadow-lg shadow-accent-500/20"
                        >
                            {submitting ? 'Submitting...' : 'Submit for Verification'}
                        </button>
                    </div>
                </Motion.div>
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
                                            {doc.document_type === 'smile_biometric_kyc'
                                                ? 'Biometric (liveness)'
                                                : doc.document_type === 'smile_basic_kyc'
                                                  ? 'Identity check'
                                                  : doc.document_type === 'nin'
                                                    ? 'NIN'
                                                    : doc.document_type === 'bvn'
                                                      ? 'BVN'
                                                      : doc.document_type === 'proof_of_address'
                                                        ? 'Proof of address'
                                                        : doc.document_type?.replace(/_/g, ' ').toUpperCase()}
                                        </p>
                                        <p className="text-sm text-gray-500">{doc.document_number}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${doc.status === 'approved' ? 'bg-accent-100 text-accent-700' :
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
