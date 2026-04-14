import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import '@smile_identity/smart-camera-web';
import {
    Shield, Upload, Check, X, AlertTriangle, Clock,
    FileText, Camera, CreditCard, Info, Home,
    User, ChevronRight, ChevronLeft, Lock, Unlock, CheckCircle2,
    Fingerprint, ScanFace, MapPin, ArrowRight, Globe, Calendar
} from 'lucide-react';
import kycService from '../../services/kycService';
import { SMILE_ISO2_COUNTRIES, getSmileIdTypeOptions } from '../../constants/smileKycOptions';

// ── Step definitions ──────────────────────────────────────────────────
const STEPS = [
    { id: 1, label: 'Personal Info', icon: User, description: 'Basic personal details' },
    { id: 2, label: 'ID Document', icon: FileText, description: 'Government-issued identification' },
    { id: 3, label: 'Selfie Verification', icon: Camera, description: 'Photo verification' },
    { id: 4, label: 'Address Proof', icon: MapPin, description: 'Proof of residence' },
];

const ID_DOCUMENT_TYPES = [
    { id: 'passport', name: 'Passport', icon: Globe },
    { id: 'national_id', name: 'National ID', icon: CreditCard },
    { id: 'drivers_license', name: "Driver's License", icon: CreditCard },
];

const ADDRESS_DOCUMENT_TYPES = [
    'Utility bill (electricity, water, gas)',
    'Bank statement (within last 3 months)',
    'Government-issued letter',
    'Tax document or assessment',
];

const KYC_DOC_NUMBER_STORAGE_KEY = 'jaxopay-kyc-doc-numbers';
const KYC_DOC_NUMBER_HISTORY_MAX = 15;

function loadKycDocNumberHistory() {
    try {
        const raw = localStorage.getItem(KYC_DOC_NUMBER_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
}

function rememberKycDocNumber(documentType, rawValue) {
    const trimmed = String(rawValue ?? '').trim();
    if (!trimmed || !documentType) return;
    const hist = loadKycDocNumberHistory();
    const prev = Array.isArray(hist[documentType]) ? hist[documentType] : [];
    const next = [trimmed, ...prev.filter(x => x !== trimmed)].slice(0, KYC_DOC_NUMBER_HISTORY_MAX);
    hist[documentType] = next;
    try { localStorage.setItem(KYC_DOC_NUMBER_STORAGE_KEY, JSON.stringify(hist)); } catch {}
}

// ── Main Component ────────────────────────────────────────────────────
const KYC = () => {
    const refreshSession = useAuthStore(s => s.refreshSession);
    const [kycStatus, setKycStatus] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Form state across steps
    const [formData, setFormData] = useState({
        // Step 1: Personal Info
        fullName: '',
        dateOfBirth: '',
        nationality: 'NG',
        address: '',
        // Step 2: ID Document
        documentType: '',
        documentNumber: '',
        documentFront: null,
        documentBack: null,
        // Step 3: Selfie
        selfie: null,
        // Step 4: Address Proof
        addressDocument: null,
    });

    // SmileID state
    const smileCameraHostRef = useRef(null);
    const smileSubmittingRef = useRef(false);
    const manualSelfieVideoRef = useRef(null);
    const manualSelfieStreamRef = useRef(null);
    const frontInputRef = useRef(null);
    const backInputRef = useRef(null);
    const selfieInputRef = useRef(null);
    const addressDocInputRef = useRef(null);

    const [smileConfigured, setSmileConfigured] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [showManualSelfieCamera, setShowManualSelfieCamera] = useState(false);
    const [docNumberHistoryTick, setDocNumberHistoryTick] = useState(0);

    // SmileID form ref for camera callback
    const smileFormRef = useRef({ first_name: '', last_name: '', country: 'NG', id_type: 'NIN_V2', id_number: '', dob: '' });

    useEffect(() => {
        const [first, ...rest] = formData.fullName.trim().split(/\s+/);
        smileFormRef.current = {
            first_name: first || '',
            last_name: rest.join(' ') || '',
            country: formData.nationality,
            id_type: formData.documentType === 'passport' ? 'PASSPORT'
                : formData.documentType === 'drivers_license' ? 'DRIVERS_LICENSE'
                : 'NIN_V2',
            id_number: formData.documentNumber || '',
            dob: formData.dateOfBirth || '',
        };
    }, [formData.fullName, formData.nationality, formData.documentType, formData.documentNumber, formData.dateOfBirth]);

    // ── Data fetching ────────────────────────────────────────────────
    const fetchKYCData = useCallback(async () => {
        setLoading(true);
        const [statusResult, docsResult, smileCfg] = await Promise.all([
            kycService.getKYCStatus(),
            kycService.getDocuments(),
            kycService.getSmileConfig(),
        ]);
        if (statusResult.success) setKycStatus(statusResult.data);
        if (docsResult.success) setDocuments(docsResult.data.documents || []);
        if (smileCfg.success && smileCfg.data?.configured) setSmileConfigured(true);
        else setSmileConfigured(false);
        setLoading(false);
    }, []);

    useEffect(() => { fetchKYCData(); }, [fetchKYCData]);

    useEffect(() => {
        const sync = () => {
            if (document.visibilityState !== 'visible') return;
            fetchKYCData(); refreshSession();
        };
        document.addEventListener('visibilitychange', sync);
        window.addEventListener('focus', sync);
        return () => {
            document.removeEventListener('visibilitychange', sync);
            window.removeEventListener('focus', sync);
        };
    }, [fetchKYCData, refreshSession]);

    // ── SmileID Camera ───────────────────────────────────────────────
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
            setSubmitting(true); setError(null);
            const f = smileFormRef.current;
            try {
                const result = await kycService.submitSmileBiometric({
                    first_name: f.first_name.trim(), last_name: f.last_name.trim(),
                    country: f.country.trim().toUpperCase(), id_type: f.id_type.trim(),
                    id_number: f.id_number.trim(), dob: f.dob?.trim() || undefined, images,
                });
                if (result.success) {
                    setSuccess(result.message || result.data?.message || 'Verification submitted! We will update you when processing completes.');
                    fetchKYCData();
                } else { setError(result.error || 'Submission failed'); }
            } finally {
                smileSubmittingRef.current = false;
                setSubmitting(false); setShowCameraModal(false);
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
            el.remove(); host.innerHTML = '';
        };
    }, [showCameraModal]);

    // ── Manual selfie camera ─────────────────────────────────────────
    useEffect(() => {
        if (!showManualSelfieCamera) return undefined;
        let cancelled = false;
        let stream;
        (async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    setError('This browser does not support camera access.');
                    setShowManualSelfieCamera(false);
                    return;
                }
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                manualSelfieStreamRef.current = stream;
                const el = manualSelfieVideoRef.current;
                if (el) { el.srcObject = stream; await el.play().catch(() => {}); }
            } catch {
                if (!cancelled) {
                    setError('Could not open camera. Check permissions.');
                    setShowManualSelfieCamera(false);
                }
            }
        })();
        return () => {
            cancelled = true;
            if (manualSelfieStreamRef.current) {
                manualSelfieStreamRef.current.getTracks().forEach(t => t.stop());
                manualSelfieStreamRef.current = null;
            }
            const el = manualSelfieVideoRef.current;
            if (el) el.srcObject = null;
        };
    }, [showManualSelfieCamera]);

    const captureManualSelfie = () => {
        const video = manualSelfieVideoRef.current;
        if (!video || video.readyState < 2) return;
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        canvas.toBlob(blob => {
            if (!blob) return;
            const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setFormData(prev => ({ ...prev, selfie: file }));
            setShowManualSelfieCamera(false);
        }, 'image/jpeg', 0.92);
    };

    const handleFileChange = (e, field) => {
        if (e.target.files[0]) {
            setFormData(prev => ({ ...prev, [field]: e.target.files[0] }));
        }
    };

    // ── Submit all KYC data ──────────────────────────────────────────
    const handleSubmitKYC = async () => {
        if (!formData.documentType || !formData.documentFront) {
            setError('Please complete all required fields'); return;
        }
        setSubmitting(true); setError(null);
        try {
            // Submit ID document
            const idResult = await kycService.submitDocument({
                document_type: formData.documentType,
                document_number: formData.documentNumber.trim(),
                document_front: formData.documentFront,
                document_back: formData.documentBack,
                selfie: formData.selfie,
            });

            if (!idResult.success) {
                setError(idResult.error || 'ID submission failed');
                setSubmitting(false);
                return;
            }

            if (formData.documentNumber.trim()) {
                rememberKycDocNumber(formData.documentType, formData.documentNumber.trim());
                setDocNumberHistoryTick(t => t + 1);
            }

            // Submit address proof if provided
            if (formData.addressDocument) {
                const addrResult = await kycService.submitDocument({
                    document_type: 'proof_of_address',
                    document_number: '',
                    document_front: formData.addressDocument,
                });
                if (!addrResult.success) {
                    setError(addrResult.error || 'Address proof submission failed');
                    setSubmitting(false);
                    return;
                }
            }

            setSuccess('All documents submitted! Verification usually takes 24-48 hours.');
            fetchKYCData();
        } catch (e) {
            setError(e?.message || 'Submission failed.');
        } finally {
            setSubmitting(false);
        }
    };

    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const docNumberSuggestions = useMemo(() => {
        if (!formData.documentType) return [];
        const all = loadKycDocNumberHistory()[formData.documentType];
        return Array.isArray(all) ? all : [];
    }, [formData.documentType, docNumberHistoryTick]);

    // ── Step validation ──────────────────────────────────────────────
    const isStepValid = (step) => {
        switch (step) {
            case 1: return formData.fullName.trim().length >= 2 && formData.dateOfBirth && formData.nationality;
            case 2: return formData.documentType && formData.documentFront && formData.documentNumber.trim();
            case 3: return !!formData.selfie;
            case 4: return true; // Address proof is optional for basic verification
            default: return false;
        }
    };

    const handleNext = () => {
        if (currentStep < 4) setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const rawTier = kycStatus?.kyc_tier;
    const currentTier = typeof rawTier === 'string' && rawTier.startsWith('tier_') ? rawTier : `tier_${Number(rawTier) || 0}`;
    const tierNum = parseInt(currentTier.replace('tier_', '')) || 0;

    // Already fully verified
    if (!loading && tierNum >= 2) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4">
                <div className="bg-card border-2 border-success/30 rounded-2xl p-8 text-center">
                    <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-5">
                        <CheckCircle2 className="w-10 h-10 text-success" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">Fully Verified</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        Your identity has been verified. You have full access to all Jaxopay features including crypto trading, virtual cards, and maximum transaction limits.
                    </p>
                </div>

                {/* Previous Submissions */}
                {documents.length > 0 && <SubmittedDocuments documents={documents} />}
            </div>
        );
    }

    // Pending review
    if (!loading && kycStatus?.kyc_status === 'pending') {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4">
                <div className="bg-card border-2 border-warning/30 rounded-2xl p-8 text-center">
                    <div className="w-20 h-20 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-5">
                        <Clock className="w-10 h-10 text-warning" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">Verification Under Review</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        Your documents are being reviewed. This typically takes 24-48 hours. We'll notify you once verification is complete.
                    </p>
                </div>

                {documents.length > 0 && <SubmittedDocuments documents={documents} />}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-4 sm:py-8 px-4">
            {/* Alerts */}
            <AnimatePresence>
                {error && (
                    <Motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="bg-danger/10 border border-danger/20 rounded-xl p-4 flex items-start gap-3 mb-6">
                        <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                        <p className="text-danger text-sm font-medium flex-1">{error}</p>
                        <button onClick={() => setError(null)} className="text-danger/60 hover:text-danger"><X className="w-4 h-4" /></button>
                    </Motion.div>
                )}
                {success && (
                    <Motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="bg-success/10 border border-success/20 rounded-xl p-4 flex items-start gap-3 mb-6">
                        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                        <p className="text-success text-sm font-medium flex-1">{success}</p>
                        <button onClick={() => setSuccess(null)} className="text-success/60 hover:text-success"><X className="w-4 h-4" /></button>
                    </Motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Identity Verification</h1>
                <p className="text-muted-foreground">Complete verification to unlock all features and higher limits</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-foreground">Step {currentStep} of 4</span>
                    <span className="text-sm text-muted-foreground">{STEPS[currentStep - 1].label}</span>
                </div>
                <div className="flex gap-2">
                    {STEPS.map((step) => {
                        const StepIcon = step.icon;
                        const isCompleted = currentStep > step.id;
                        const isCurrent = currentStep === step.id;
                        return (
                            <div key={step.id} className="flex-1 flex flex-col items-center gap-2">
                                <div className={`w-full h-2 rounded-full transition-all duration-500 ${
                                    isCompleted ? 'bg-primary' : isCurrent ? 'bg-primary/60' : 'bg-muted'
                                }`} />
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                    isCompleted ? 'bg-primary text-white' : isCurrent ? 'bg-primary/10 text-primary border-2 border-primary' : 'bg-muted text-muted-foreground'
                                }`}>
                                    {isCompleted ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                                </div>
                                <span className={`text-[10px] font-medium text-center hidden sm:block ${
                                    isCompleted || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                                }`}>{step.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Step Content Card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <AnimatePresence mode="wait">
                    <Motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}>

                        {/* Step 1: Personal Information */}
                        {currentStep === 1 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-foreground mb-1">Personal Information</h2>
                                    <p className="text-sm text-muted-foreground">Enter your personal details as they appear on your official documents</p>
                                </div>

                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Full Legal Name</label>
                                        <input value={formData.fullName}
                                            onChange={e => updateField('fullName', e.target.value)}
                                            placeholder="Enter your full name as it appears on your ID"
                                            className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Date of Birth</label>
                                        <div className="relative">
                                            <input type="date" value={formData.dateOfBirth}
                                                onChange={e => updateField('dateOfBirth', e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Nationality</label>
                                        <select value={formData.nationality}
                                            onChange={e => updateField('nationality', e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none">
                                            {SMILE_ISO2_COUNTRIES.map(c => (
                                                <option key={c.code} value={c.code} className="bg-card text-foreground">{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Residential Address</label>
                                        <input value={formData.address}
                                            onChange={e => updateField('address', e.target.value)}
                                            placeholder="Enter your current residential address"
                                            className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: ID Document */}
                        {currentStep === 2 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-foreground mb-1">Identity Document</h2>
                                    <p className="text-sm text-muted-foreground">Upload a clear photo of your government-issued ID document</p>
                                </div>

                                {/* Document Type Selector */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-3">Document Type</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {ID_DOCUMENT_TYPES.map(doc => (
                                            <button key={doc.id} onClick={() => updateField('documentType', doc.id)}
                                                className={`p-4 rounded-xl border-2 text-center transition-all ${
                                                    formData.documentType === doc.id
                                                        ? 'border-primary bg-primary/10'
                                                        : 'border-border hover:border-primary/30'
                                                }`}>
                                                <doc.icon className={`w-6 h-6 mx-auto mb-2 ${
                                                    formData.documentType === doc.id ? 'text-primary' : 'text-muted-foreground'
                                                }`} />
                                                <p className="text-xs sm:text-sm font-medium text-foreground">{doc.name}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Document Number */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">Document Number</label>
                                    <input type="text" value={formData.documentNumber}
                                        onChange={e => updateField('documentNumber', e.target.value)}
                                        list={formData.documentType && docNumberSuggestions.length > 0 ? 'kyc-doc-suggestions' : undefined}
                                        autoComplete="off"
                                        placeholder="Enter your document number"
                                        className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                                    {formData.documentType && docNumberSuggestions.length > 0 && (
                                        <datalist id="kyc-doc-suggestions">
                                            {docNumberSuggestions.map(v => <option key={v} value={v} />)}
                                        </datalist>
                                    )}
                                </div>

                                {/* Upload Areas */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Front Side *</label>
                                        <div onClick={() => frontInputRef.current?.click()}
                                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-primary/50 ${
                                                formData.documentFront ? 'border-primary bg-primary/5' : 'border-border'
                                            }`}>
                                            {formData.documentFront ? (
                                                <div className="text-primary">
                                                    <Check className="w-8 h-8 mx-auto mb-2" />
                                                    <p className="text-sm font-medium truncate">{formData.documentFront.name}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">Click to replace</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                                    <p className="text-sm font-medium text-foreground">Upload front</p>
                                                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG or PDF up to 5MB</p>
                                                </>
                                            )}
                                        </div>
                                        <input ref={frontInputRef} type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'documentFront')} className="hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Back Side</label>
                                        <div onClick={() => backInputRef.current?.click()}
                                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-primary/50 ${
                                                formData.documentBack ? 'border-primary bg-primary/5' : 'border-border'
                                            }`}>
                                            {formData.documentBack ? (
                                                <div className="text-primary">
                                                    <Check className="w-8 h-8 mx-auto mb-2" />
                                                    <p className="text-sm font-medium truncate">{formData.documentBack.name}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">Click to replace</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                                    <p className="text-sm font-medium text-foreground">Upload back</p>
                                                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG or PDF up to 5MB</p>
                                                </>
                                            )}
                                        </div>
                                        <input ref={backInputRef} type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'documentBack')} className="hidden" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Selfie Verification */}
                        {currentStep === 3 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-foreground mb-1">Selfie Verification</h2>
                                    <p className="text-sm text-muted-foreground">Take or upload a clear selfie for identity verification</p>
                                </div>

                                {/* SmileID Liveness option */}
                                {smileConfigured && (
                                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
                                        <div className="flex items-start gap-3 mb-4">
                                            <ScanFace className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                                            <div>
                                                <h3 className="font-semibold text-foreground mb-1">Liveness Verification (Recommended)</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    Use our guided camera to verify your identity in real-time. Results in minutes.
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={() => setShowCameraModal(true)}
                                            disabled={submitting || !formData.fullName.trim() || !formData.documentNumber.trim()}
                                            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                            <Camera className="w-5 h-5" />
                                            Open Camera - Liveness Capture
                                        </button>
                                        {(!formData.fullName.trim() || !formData.documentNumber.trim()) && (
                                            <p className="text-xs text-muted-foreground mt-2 text-center">Complete Steps 1 & 2 first to enable liveness verification</p>
                                        )}
                                    </div>
                                )}

                                <div className="relative flex items-center gap-3 text-muted-foreground">
                                    <div className="flex-1 h-px bg-border" />
                                    <span className="text-xs font-medium">OR upload manually</span>
                                    <div className="flex-1 h-px bg-border" />
                                </div>

                                {/* Manual selfie upload */}
                                <div className="space-y-4">
                                    <div className="flex gap-3">
                                        <button type="button" onClick={() => { setError(null); setShowManualSelfieCamera(true); }}
                                            className="flex-1 py-3 bg-muted hover:bg-muted/80 border border-border rounded-xl font-medium text-foreground text-sm flex items-center justify-center gap-2 transition-colors">
                                            <Camera className="w-4 h-4" /> Take Photo
                                        </button>
                                        <button type="button" onClick={() => selfieInputRef.current?.click()}
                                            className="flex-1 py-3 bg-muted hover:bg-muted/80 border border-border rounded-xl font-medium text-foreground text-sm flex items-center justify-center gap-2 transition-colors">
                                            <Upload className="w-4 h-4" /> Upload Photo
                                        </button>
                                    </div>

                                    <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                                        formData.selfie ? 'border-primary bg-primary/5' : 'border-border'
                                    }`}>
                                        {formData.selfie ? (
                                            <div className="text-primary">
                                                <Check className="w-8 h-8 mx-auto mb-2" />
                                                <p className="text-sm font-medium">{formData.selfie.name}</p>
                                                <button type="button" onClick={() => updateField('selfie', null)}
                                                    className="text-xs text-danger underline mt-2">Remove</button>
                                            </div>
                                        ) : (
                                            <>
                                                <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                                <p className="text-sm font-medium text-foreground">No selfie captured yet</p>
                                                <p className="text-xs text-muted-foreground mt-1">Take a photo or upload one above</p>
                                            </>
                                        )}
                                    </div>
                                    <input ref={selfieInputRef} type="file" accept="image/*" capture="user"
                                        onChange={e => handleFileChange(e, 'selfie')} className="hidden" />

                                    {/* Tips */}
                                    <div className="bg-muted/50 rounded-xl p-4">
                                        <p className="text-sm font-medium text-foreground mb-2">Tips for a good selfie:</p>
                                        <ul className="space-y-1.5 text-xs text-muted-foreground">
                                            <li className="flex items-start gap-2">
                                                <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                                Ensure your face is clearly visible and well-lit
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                                Remove sunglasses, hats, or face coverings
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                                Look directly at the camera
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                                Use a plain background if possible
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Address Proof */}
                        {currentStep === 4 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <h2 className="text-xl font-bold text-foreground mb-1">Address Proof</h2>
                                    <p className="text-sm text-muted-foreground">Upload a document that confirms your residential address</p>
                                </div>

                                {/* Upload area */}
                                <div>
                                    <div onClick={() => addressDocInputRef.current?.click()}
                                        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all hover:border-primary/50 ${
                                            formData.addressDocument ? 'border-primary bg-primary/5' : 'border-border'
                                        }`}>
                                        {formData.addressDocument ? (
                                            <div className="text-primary">
                                                <Check className="w-10 h-10 mx-auto mb-3" />
                                                <p className="text-sm font-medium">{formData.addressDocument.name}</p>
                                                <p className="text-xs text-muted-foreground mt-1">Click to replace</p>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                                                <p className="text-sm font-medium text-foreground mb-1">Upload address proof</p>
                                                <p className="text-xs text-muted-foreground">PNG, JPG or PDF up to 5MB</p>
                                            </>
                                        )}
                                    </div>
                                    <input ref={addressDocInputRef} type="file" accept="image/*,.pdf"
                                        onChange={e => handleFileChange(e, 'addressDocument')} className="hidden" />
                                </div>

                                {/* Accepted documents list */}
                                <div className="bg-muted/50 rounded-xl p-4">
                                    <p className="text-sm font-medium text-foreground mb-3">Accepted documents:</p>
                                    <ul className="space-y-2">
                                        {ADDRESS_DOCUMENT_TYPES.map((doc, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                                {doc}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </Motion.div>
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="px-6 sm:px-8 py-5 border-t border-border flex items-center justify-between gap-4">
                    {currentStep > 1 ? (
                        <button onClick={handleBack}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors">
                            <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                    ) : (
                        <div />
                    )}

                    {currentStep < 4 ? (
                        <button onClick={handleNext}
                            disabled={!isStepValid(currentStep)}
                            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            Continue <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button onClick={handleSubmitKYC}
                            disabled={submitting || !isStepValid(2)}
                            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            {submitting ? (
                                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                            ) : (
                                <>Submit Verification <ArrowRight className="w-4 h-4" /></>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Why Verify section */}
            <div className="mt-8 bg-card border border-border rounded-2xl p-6 sm:p-8">
                <div className="flex items-start gap-3 mb-4">
                    <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <h3 className="text-lg font-bold text-foreground">Why verify your identity?</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                            <Shield className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Account Security</p>
                            <p className="text-xs text-muted-foreground">Protect your account from unauthorized access</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                            <Unlock className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Higher Limits</p>
                            <p className="text-xs text-muted-foreground">Unlock higher transaction and withdrawal limits</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                            <CreditCard className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Full Features</p>
                            <p className="text-xs text-muted-foreground">Access virtual cards, crypto trading, and more</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                            <Globe className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Regulatory Compliance</p>
                            <p className="text-xs text-muted-foreground">Meet KYC/AML requirements for financial services</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Previous Submissions */}
            {documents.length > 0 && <SubmittedDocuments documents={documents} />}

            {/* Camera Modal (SmileID) */}
            {showCameraModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 relative">
                        <button type="button"
                            className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-muted hover:bg-muted/80"
                            onClick={() => { if (!smileSubmittingRef.current) setShowCameraModal(false); }}>
                            <X className="w-5 h-5 text-foreground" />
                        </button>
                        <p className="text-sm text-muted-foreground mb-3 pr-10">
                            Allow camera access, then follow on-screen steps: liveness capture, selfie review, then ID front (and back if prompted).
                        </p>
                        <div ref={smileCameraHostRef} className="min-h-[320px] w-full relative" />
                        {submitting && (
                            <div className="mt-3 text-center text-sm font-medium text-primary">
                                Uploading images — please keep this page open...
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Manual Selfie Camera Modal */}
            {showManualSelfieCamera && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-5 relative max-h-[90vh] overflow-y-auto">
                        <button type="button"
                            className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-muted"
                            onClick={() => setShowManualSelfieCamera(false)}>
                            <X className="w-5 h-5 text-foreground" />
                        </button>
                        <h3 className="text-lg font-bold text-foreground pr-10 mb-2">Take Selfie</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                            Position your face in the frame, then capture.
                        </p>
                        <video ref={manualSelfieVideoRef} autoPlay playsInline muted
                            className="w-full rounded-xl bg-black aspect-video object-cover" />
                        <div className="mt-4 flex gap-2">
                            <button type="button" onClick={captureManualSelfie}
                                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl">
                                Capture Photo
                            </button>
                            <button type="button" onClick={() => setShowManualSelfieCamera(false)}
                                className="flex-1 py-3 bg-muted text-foreground font-medium rounded-xl">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Submitted Documents List ──────────────────────────────────────────
const SubmittedDocuments = ({ documents }) => (
    <div className="mt-6 bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
            <h3 className="font-bold text-foreground">Submitted Documents</h3>
        </div>
        <div className="divide-y divide-border">
            {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-lg">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="font-medium text-foreground text-sm">
                                {doc.document_type === 'smile_biometric_kyc' ? 'Biometric (liveness)'
                                    : doc.document_type === 'smile_basic_kyc' ? 'Identity check'
                                    : doc.document_type === 'nin' ? 'NIN'
                                    : doc.document_type === 'bvn' ? 'BVN'
                                    : doc.document_type === 'proof_of_address' ? 'Proof of address'
                                    : doc.document_type?.replace(/_/g, ' ').toUpperCase()}
                            </p>
                            {doc.document_number && <p className="text-xs text-muted-foreground">{doc.document_number}</p>}
                        </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        doc.status === 'approved' ? 'bg-success/10 text-success'
                        : doc.status === 'rejected' ? 'bg-danger/10 text-danger'
                        : 'bg-warning/10 text-warning'
                    }`}>
                        {doc.status}
                    </span>
                </div>
            ))}
        </div>
    </div>
);

export default KYC;
