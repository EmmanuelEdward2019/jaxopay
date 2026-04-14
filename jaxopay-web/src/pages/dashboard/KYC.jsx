import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { motion as Motion } from 'framer-motion';
import '@smile_identity/smart-camera-web';
import {
    Shield, Upload, Check, X, AlertTriangle, Clock,
    FileText, Camera, CreditCard, Info, Home,
    User, ChevronRight, Lock, Unlock, CheckCircle2,
    Fingerprint, ScanFace, MapPin, ArrowRight
} from 'lucide-react';
import kycService from '../../services/kycService';
import { SMILE_ISO2_COUNTRIES, getSmileIdTypeOptions } from '../../constants/smileKycOptions';
import { formatCurrency } from '../../utils/formatters';

const TIER_INFO = {
    tier_0: {
        name: 'Unverified',
        badge: 'bg-muted text-muted-foreground',
        icon: Lock,
        limits: { daily: 100, monthly: 500, card: false, crypto: false },
        description: 'Limited access. Verify to unlock features.',
    },
    tier_1: {
        name: 'Basic',
        badge: 'bg-primary/10 text-primary',
        icon: Shield,
        limits: { daily: 1000, monthly: 5000, card: false, crypto: true },
        description: 'Crypto trading enabled. Submit ID to upgrade.',
    },
    tier_2: {
        name: 'Verified',
        badge: 'bg-success/10 text-success',
        icon: CheckCircle2,
        limits: { daily: 10000, monthly: 50000, card: true, crypto: true },
        description: 'Full access. All features unlocked.',
    },
};

const TIER1_DOCUMENT_TYPES = [
    { id: 'passport', name: 'Passport', icon: FileText },
    { id: 'national_id', name: 'National ID', icon: CreditCard },
    { id: 'drivers_license', name: "Driver's License", icon: CreditCard },
];

const TIER2_DOCUMENT_TYPES = [
    { id: 'nin', name: 'NIN', icon: CreditCard },
    { id: 'bvn', name: 'BVN', icon: CreditCard },
    { id: 'proof_of_address', name: 'Proof of address', icon: Home },
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

// ── Verification Steps ────────────────────────────────────────────────
const STEPS = [
    { id: 'personal', label: 'Personal Info', icon: User, tier: 'tier_1' },
    { id: 'identity', label: 'Identity', icon: Fingerprint, tier: 'tier_1' },
    { id: 'liveness', label: 'Liveness', icon: ScanFace, tier: 'tier_1' },
    { id: 'address', label: 'Address', icon: MapPin, tier: 'tier_2' },
];

const KYC = () => {
    const refreshSession = useAuthStore(s => s.refreshSession);
    const [kycStatus, setKycStatus] = useState(null);
    const [, setTierLimits] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [activeStep, setActiveStep] = useState(null); // null = overview, or step id
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
    const manualSelfieVideoRef = useRef(null);
    const manualSelfieStreamRef = useRef(null);
    const smileCameraHostRef = useRef(null);
    const smileSubmittingRef = useRef(false);
    const smileFormRef = useRef({
        first_name: '', last_name: '', country: 'NG', id_type: 'NIN_V2', id_number: '', dob: '',
    });

    const [smileConfigured, setSmileConfigured] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [showManualSelfieCamera, setShowManualSelfieCamera] = useState(false);
    const [docNumberHistoryTick, setDocNumberHistoryTick] = useState(0);
    const [smileForm, setSmileForm] = useState({
        first_name: '', last_name: '', country: 'NG', id_type: 'NIN_V2', id_number: '', dob: '',
    });

    useEffect(() => { smileFormRef.current = smileForm; }, [smileForm]);

    useEffect(() => {
        setSmileForm(s => {
            const opts = getSmileIdTypeOptions(s.country);
            if (opts.some(o => o.value === s.id_type)) return s;
            return { ...s, id_type: opts[0]?.value || '' };
        });
    }, [smileForm.country]);

    const fetchKYCData = useCallback(async () => {
        setLoading(true);
        const [statusResult, limitsResult, docsResult, smileCfg] = await Promise.all([
            kycService.getKYCStatus(), kycService.getTierLimits(),
            kycService.getDocuments(), kycService.getSmileConfig(),
        ]);
        if (statusResult.success) setKycStatus(statusResult.data);
        if (limitsResult.success) setTierLimits(limitsResult.data);
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

    // SmileID camera integration
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
                    setSuccess(result.message || result.data?.message || 'Verification submitted. We will update you when processing completes.');
                    fetchKYCData();
                } else { setError(result.error || 'Submission failed'); }
            } finally {
                smileSubmittingRef.current = false;
                setSubmitting(false); setShowCameraModal(false);
                setActiveStep(null);
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

    // Manual selfie camera
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
            setSelfie(new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' }));
            setShowManualSelfieCamera(false);
        }, 'image/jpeg', 0.92);
    };

    const handleFileChange = (e, setter) => { if (e.target.files[0]) setter(e.target.files[0]); };

    const handleSubmitKYC = async () => {
        const needsDocNumber = documentType !== 'proof_of_address' && documentType !== 'utility_bill';
        if (!documentType || !documentFront || (needsDocNumber && !documentNumber.trim())) {
            setError('Please fill in all required fields'); return;
        }
        setSubmitting(true); setError(null);
        try {
            const result = await kycService.submitDocument({
                document_type: documentType, document_number: documentNumber.trim(),
                document_front: documentFront, document_back: documentBack, selfie,
            });
            if (result.success) {
                if (documentNumber.trim()) {
                    rememberKycDocNumber(documentType, documentNumber.trim());
                    setDocNumberHistoryTick(t => t + 1);
                }
                setSuccess('Documents submitted! Verification usually takes 24-48 hours.');
                setActiveStep(null); resetForm(); fetchKYCData();
            } else { setError(result.error); }
        } catch (e) { setError(e?.message || 'Submission failed.'); }
        finally { setSubmitting(false); }
    };

    const resetForm = () => {
        setDocumentType(''); setDocumentNumber('');
        setDocumentFront(null); setDocumentBack(null); setSelfie(null);
    };

    const rawTier = kycStatus?.kyc_tier;
    const currentTier = typeof rawTier === 'string' && rawTier.startsWith('tier_') ? rawTier : `tier_${Number(rawTier) || 0}`;
    const tierData = TIER_INFO[currentTier] || TIER_INFO.tier_0;
    const tierNum = parseInt(currentTier.replace('tier_', '')) || 0;

    const uploadDocOptions = currentTier === 'tier_0' ? TIER1_DOCUMENT_TYPES : TIER2_DOCUMENT_TYPES;
    const smileIdTypeOptions = getSmileIdTypeOptions(smileForm.country);

    const docNumberSuggestions = useMemo(() => {
        if (!documentType) return [];
        const all = loadKycDocNumberHistory()[documentType];
        return Array.isArray(all) ? all : [];
    }, [documentType, docNumberHistoryTick]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Alerts */}
            {error && (
                <Motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-danger/10 border border-danger/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-danger text-sm font-medium">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="text-danger/60 hover:text-danger"><X className="w-4 h-4" /></button>
                </Motion.div>
            )}
            {success && (
                <Motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-success/10 border border-success/20 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                    <p className="text-success text-sm font-medium flex-1">{success}</p>
                    <button onClick={() => setSuccess(null)} className="text-success/60 hover:text-success"><X className="w-4 h-4" /></button>
                </Motion.div>
            )}

            {/* Header Card */}
            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground mb-1">Identity Verification</h1>
                        <p className="text-muted-foreground text-sm">Complete verification to unlock all features and higher limits</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`px-4 py-2 rounded-full text-sm font-bold ${tierData.badge}`}>
                            {tierData.name}
                        </div>
                        {kycStatus?.kyc_status === 'pending' && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 rounded-full">
                                <Clock className="w-3.5 h-3.5 text-warning" />
                                <span className="text-xs font-bold text-warning">Under Review</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="relative">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-700"
                            style={{ width: `${tierNum === 2 ? 100 : tierNum === 1 ? 66 : tierNum === 0 && kycStatus?.kyc_status === 'pending' ? 33 : 0}%` }} />
                    </div>
                    <div className="flex justify-between mt-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Unverified</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Basic</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Verified</span>
                    </div>
                </div>
            </div>

            {/* Tier Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(TIER_INFO).map(([tier, info]) => {
                    const TierIcon = info.icon;
                    const isActive = currentTier === tier;
                    const tierLevel = parseInt(tier.replace('tier_', ''));
                    const isCompleted = tierNum >= tierLevel;
                    return (
                        <div key={tier}
                            className={`bg-card border-2 rounded-xl p-5 transition-all ${isActive ? 'border-primary shadow-lg shadow-primary/10' : isCompleted ? 'border-success/30' : 'border-border'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className={`p-2 rounded-lg ${isActive ? 'bg-primary/10' : isCompleted ? 'bg-success/10' : 'bg-muted'}`}>
                                    <TierIcon className={`w-5 h-5 ${isActive ? 'text-primary' : isCompleted ? 'text-success' : 'text-muted-foreground'}`} />
                                </div>
                                {isCompleted && <Check className="w-5 h-5 text-success" />}
                            </div>
                            <h3 className="font-bold text-foreground mb-1">{info.name}</h3>
                            <p className="text-xs text-muted-foreground mb-3">{info.description}</p>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Daily Limit</span>
                                    <span className="font-medium text-foreground">{formatCurrency(info.limits.daily, 'USD')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Monthly</span>
                                    <span className="font-medium text-foreground">{formatCurrency(info.limits.monthly, 'USD')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Cards</span>
                                    <span className={info.limits.card ? 'text-success font-bold' : 'text-muted-foreground'}>
                                        {info.limits.card ? 'Yes' : 'No'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Crypto</span>
                                    <span className={info.limits.crypto ? 'text-success font-bold' : 'text-muted-foreground'}>
                                        {info.limits.crypto ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Verification Actions */}
            {currentTier !== 'tier_2' && !activeStep && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border">
                        <h2 className="text-lg font-bold text-foreground">Complete Verification</h2>
                        <p className="text-sm text-muted-foreground">Choose a verification method to upgrade your account</p>
                    </div>

                    <div className="divide-y divide-border">
                        {/* SmileID Liveness Verification (primary) */}
                        {smileConfigured && (
                            <button onClick={() => setActiveStep('liveness')}
                                className="w-full flex items-center gap-4 p-5 hover:bg-muted/30 transition-colors text-left">
                                <div className="p-3 bg-primary/10 rounded-xl shrink-0">
                                    <ScanFace className="w-6 h-6 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-foreground mb-0.5">Liveness Verification</h3>
                                    <p className="text-sm text-muted-foreground">Face scan + ID capture. Fastest method - results in minutes.</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="hidden sm:inline-block px-2 py-1 bg-primary/10 rounded-md text-xs font-bold text-primary">Recommended</span>
                                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                </div>
                            </button>
                        )}

                        {/* Identity Document Upload */}
                        <button onClick={() => setActiveStep('identity')}
                            className="w-full flex items-center gap-4 p-5 hover:bg-muted/30 transition-colors text-left">
                            <div className="p-3 bg-muted rounded-xl shrink-0">
                                <Fingerprint className="w-6 h-6 text-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground mb-0.5">
                                    {currentTier === 'tier_0' ? 'Upload Government ID' : 'Upload NIN/BVN'}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {currentTier === 'tier_0'
                                        ? 'Passport, National ID, or Drivers License'
                                        : 'NIN, BVN, or Proof of Address for Tier 2'}
                                </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                        </button>
                    </div>
                </div>
            )}

            {/* Liveness Step (SmileID) */}
            {activeStep === 'liveness' && smileConfigured && (
                <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setActiveStep(null); setError(null); }}
                                className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                                <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
                            </button>
                            <h2 className="text-lg font-bold text-foreground">Liveness Verification</h2>
                        </div>
                        <button onClick={() => { setActiveStep(null); setError(null); }}
                            className="p-2 hover:bg-muted rounded-lg"><X className="w-5 h-5 text-muted-foreground" /></button>
                    </div>

                    <div className="p-6 space-y-5">
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3">
                            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <p className="text-sm text-foreground">
                                Enter your details below, then open the camera for guided capture: liveness photos, selfie, and ID images.
                                Use Chrome, Safari, or Edge on HTTPS.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">First Name</label>
                                <input value={smileForm.first_name}
                                    onChange={e => setSmileForm(s => ({ ...s, first_name: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
                                    placeholder="John" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Last Name</label>
                                <input value={smileForm.last_name}
                                    onChange={e => setSmileForm(s => ({ ...s, last_name: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
                                    placeholder="Doe" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Country</label>
                                <select value={smileForm.country}
                                    onChange={e => setSmileForm(s => ({ ...s, country: e.target.value.toUpperCase() }))}
                                    className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none">
                                    {SMILE_ISO2_COUNTRIES.map(c => (
                                        <option key={c.code} value={c.code} className="bg-card text-foreground">{c.name} ({c.code})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">ID Type</label>
                                <select value={smileForm.id_type}
                                    onChange={e => setSmileForm(s => ({ ...s, id_type: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none">
                                    {smileIdTypeOptions.map(opt => (
                                        <option key={opt.value} value={opt.value} className="bg-card text-foreground">{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">ID Number</label>
                                <input value={smileForm.id_number}
                                    onChange={e => setSmileForm(s => ({ ...s, id_number: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground"
                                    placeholder="Enter your ID number" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Date of Birth (optional)</label>
                                <input type="date" value={smileForm.dob}
                                    onChange={e => setSmileForm(s => ({ ...s, dob: e.target.value }))}
                                    className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none" />
                            </div>
                        </div>

                        <button type="button"
                            disabled={submitting || !smileForm.first_name.trim() || !smileForm.last_name.trim() || smileForm.country.trim().length !== 2 || !smileForm.id_type.trim() || !smileForm.id_number.trim()}
                            onClick={() => setShowCameraModal(true)}
                            className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            <Camera className="w-5 h-5" />
                            Open Camera - Liveness & ID Capture
                        </button>
                    </div>
                </Motion.div>
            )}

            {/* Identity Upload Step */}
            {activeStep === 'identity' && (
                <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setActiveStep(null); resetForm(); }}
                                className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                                <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
                            </button>
                            <h2 className="text-lg font-bold text-foreground">Upload Documents</h2>
                        </div>
                        <button onClick={() => { setActiveStep(null); resetForm(); }}
                            className="p-2 hover:bg-muted rounded-lg"><X className="w-5 h-5 text-muted-foreground" /></button>
                    </div>

                    <div className="p-6 space-y-6">
                        {currentTier === 'tier_1' && (
                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-foreground">
                                <strong>Tier 2 verification:</strong> Submit NIN, BVN, or proof of address (utility bill or bank statement dated within 3 months).
                            </div>
                        )}

                        {/* Document Type */}
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Document Type</label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {uploadDocOptions.map(doc => (
                                    <button key={doc.id} onClick={() => setDocumentType(doc.id)}
                                        className={`p-4 rounded-xl border-2 text-center transition-all ${documentType === doc.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'}`}>
                                        <doc.icon className={`w-6 h-6 mx-auto mb-2 ${documentType === doc.id ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <p className="text-sm font-medium text-foreground">{doc.name}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Document Number */}
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                Document Number {(documentType === 'proof_of_address' || documentType === 'utility_bill') ? '(optional)' : '*'}
                            </label>
                            <input type="text" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                                list={documentType && docNumberSuggestions.length > 0 ? 'kyc-doc-suggestions' : undefined}
                                autoComplete="off"
                                placeholder={documentType === 'proof_of_address' ? 'Reference (optional)' : 'Enter document number'}
                                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
                            {documentType && docNumberSuggestions.length > 0 && (
                                <datalist id="kyc-doc-suggestions">
                                    {docNumberSuggestions.map(v => <option key={v} value={v} />)}
                                </datalist>
                            )}
                        </div>

                        {/* File Uploads */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Front *</label>
                                <div onClick={() => frontInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${documentFront ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                                    {documentFront ? (
                                        <div className="text-primary"><Check className="w-6 h-6 mx-auto mb-1" /><p className="text-xs truncate">{documentFront.name}</p></div>
                                    ) : (
                                        <><Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" /><p className="text-xs text-muted-foreground">Upload</p></>
                                    )}
                                </div>
                                <input ref={frontInputRef} type="file" accept="image/*" onChange={e => handleFileChange(e, setDocumentFront)} className="hidden" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Back</label>
                                <div onClick={() => backInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${documentBack ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                                    {documentBack ? (
                                        <div className="text-primary"><Check className="w-6 h-6 mx-auto mb-1" /><p className="text-xs truncate">{documentBack.name}</p></div>
                                    ) : (
                                        <><Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" /><p className="text-xs text-muted-foreground">Upload</p></>
                                    )}
                                </div>
                                <input ref={backInputRef} type="file" accept="image/*" onChange={e => handleFileChange(e, setDocumentBack)} className="hidden" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Selfie</label>
                                <div className="space-y-2">
                                    <div className="flex gap-1.5">
                                        <button type="button" onClick={() => { setError(null); setShowManualSelfieCamera(true); }}
                                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-primary text-white text-[10px] font-bold">
                                            <Camera className="w-3 h-3" /> Camera
                                        </button>
                                        <button type="button" onClick={() => selfieInputRef.current?.click()}
                                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-border text-[10px] font-bold text-foreground">
                                            <Upload className="w-3 h-3" /> Upload
                                        </button>
                                    </div>
                                    <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${selfie ? 'border-primary bg-primary/5' : 'border-border'}`}>
                                        {selfie ? (
                                            <div className="text-primary">
                                                <Check className="w-5 h-5 mx-auto mb-1" />
                                                <p className="text-[10px] truncate">{selfie.name}</p>
                                                <button type="button" onClick={() => setSelfie(null)} className="text-[10px] text-danger underline mt-1">Remove</button>
                                            </div>
                                        ) : <p className="text-[10px] text-muted-foreground">No selfie</p>}
                                    </div>
                                </div>
                                <input ref={selfieInputRef} type="file" accept="image/*" capture="user" onChange={e => handleFileChange(e, setSelfie)} className="hidden" />
                            </div>
                        </div>

                        {/* Tips */}
                        <div className="bg-muted/50 rounded-xl p-4 flex gap-3">
                            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium text-foreground mb-1">Tips for quick approval:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-xs">
                                    <li>Ensure all document details are clearly visible</li>
                                    <li>Photos should be well-lit and in focus</li>
                                    <li>Document should not be expired</li>
                                </ul>
                            </div>
                        </div>

                        <button onClick={handleSubmitKYC}
                            disabled={!documentType || !documentFront || submitting || (documentType !== 'proof_of_address' && documentType !== 'utility_bill' && !documentNumber.trim())}
                            className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {submitting ? 'Submitting...' : 'Submit for Verification'}
                        </button>
                    </div>
                </Motion.div>
            )}

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
                                Uploading images — please keep this page open…
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
                        <h3 className="text-lg font-bold text-foreground pr-10 mb-2">Selfie with your ID</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                            Position your face and ID document in the frame, then capture.
                        </p>
                        <video ref={manualSelfieVideoRef} autoPlay playsInline muted
                            className="w-full rounded-xl bg-black aspect-video object-cover" />
                        <div className="mt-4 flex gap-2">
                            <button type="button" onClick={captureManualSelfie}
                                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl">
                                Capture photo
                            </button>
                            <button type="button" onClick={() => setShowManualSelfieCamera(false)}
                                className="flex-1 py-3 bg-muted text-foreground font-medium rounded-xl">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Previous Submissions */}
            {documents.length > 0 && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
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
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${doc.status === 'approved' ? 'bg-success/10 text-success'
                                    : doc.status === 'rejected' ? 'bg-danger/10 text-danger'
                                        : 'bg-warning/10 text-warning'}`}>
                                    {doc.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Fully Verified Message */}
            {currentTier === 'tier_2' && (
                <div className="bg-card border-2 border-success/30 rounded-2xl p-8 text-center">
                    <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">Fully Verified</h3>
                    <p className="text-muted-foreground text-sm max-w-md mx-auto">
                        Your identity has been verified. You have full access to all Jaxopay features including crypto trading, virtual cards, and maximum transaction limits.
                    </p>
                </div>
            )}
        </div>
    );
};

export default KYC;
