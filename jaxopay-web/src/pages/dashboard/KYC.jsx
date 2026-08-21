import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
    Shield, Upload, Check, X, AlertTriangle, Clock,
    FileText, Camera, CreditCard, Info, Home,
    User, ChevronRight, ChevronDown, Lock, CheckCircle2,
    Fingerprint, ScanFace, ArrowRight, Globe, PartyPopper,
} from 'lucide-react';
import kycService from '../../services/kycService';
import userService from '../../services/userService';
import { SMILE_ISO2_COUNTRIES } from '../../constants/smileKycOptions';

// ── Tier ladder definitions — JAXOPAY's own requirements, always visible so a user can see the
// whole path ahead, not just whatever they're on right now.
// `num` is the real backend tier (kyc_tier = tier_1/2/3) and drives all gating/lookup logic below —
// never change it. `displayNum` is the user-facing tier number (num - 1), used only in rendered
// text, so the tier ladder reads Tier 0/1/2 instead of Tier 1/2/3. ────────────────────────────────
const TIER_DEFS = [
    { num: 1, displayNum: 0, title: 'Basic Profile', subtitle: 'Confirm your details', icon: User },
    { num: 2, displayNum: 1, title: 'Identity Verification', subtitle: 'Government ID + liveness check', icon: ScanFace },
    { num: 3, displayNum: 2, title: 'Address Verification', subtitle: 'Proof of residence', icon: Home },
];

// Passport and Driver's License are no longer offered — Tier 2 only accepts NIN or National ID
// (number + liveness/selfie, no document photo). Kept out of the selector entirely per product
// decision, not just hidden.
const ID_DOCUMENT_TYPES = [
    { id: 'nin', name: 'NIN (Nigeria)', icon: Fingerprint },
    { id: 'national_id', name: 'National ID', icon: CreditCard },
];
// Legacy types (passport, drivers_license) are no longer selectable for new submissions, but kept
// here so status/rejection-reason lookups still recognize documents submitted before this change.
const ID_DOC_TYPE_VALUES = ID_DOCUMENT_TYPES.map((d) => d.id).concat(['id_card', 'passport', 'drivers_license']);
const ADDRESS_DOC_TYPE_VALUES = ['proof_of_address', 'utility_bill'];

const ADDRESS_DOCUMENT_TYPES = [
    'Utility bill (electricity, water, gas)',
    'Bank statement (within last 3 months)',
    'Government-issued letter',
    'Tax document or assessment',
];

const KYC_DOC_NUMBER_STORAGE_KEY = 'jaxopay-kyc-doc-numbers';
const KYC_DOC_NUMBER_HISTORY_MAX = 15;

// Smile ID's hosted Web SDK (v12) — capture AND submission both happen inside its own modal
// iframe, so there's no local camera UI to wire up on our side at all, unlike the old Smart
// Camera Web component this replaces. Not published to npm — the script tag is the only
// supported install path. Loaded lazily (only once a user actually opens KYC) and cached at
// module scope so remounting this page never injects it twice.
const SMILE_V12_SCRIPT_URL = 'https://cdn.usesmileid.com/inline/v12/js/script.min.js';
let smileV12ScriptPromise = null;
function loadSmileV12Script() {
    if (window.SmileIdentity) return Promise.resolve();
    if (!smileV12ScriptPromise) {
        smileV12ScriptPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${SMILE_V12_SCRIPT_URL}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () => reject(new Error('Could not load the verification script.')));
                return;
            }
            const script = document.createElement('script');
            script.src = SMILE_V12_SCRIPT_URL;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Could not load the verification script.'));
            document.head.appendChild(script);
        }).catch((err) => {
            smileV12ScriptPromise = null; // let a retry re-attempt instead of caching a failure forever
            throw err;
        });
    }
    return smileV12ScriptPromise;
}

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

/** Aggregate status across a set of document_type values: approved beats pending beats rejected. */
function docStatusFor(documents, types) {
    const relevant = documents.filter((d) => types.includes(d.document_type));
    if (relevant.some((d) => d.verification_status === 'approved' || d.status === 'approved')) return 'approved';
    if (relevant.some((d) => d.verification_status === 'pending' || d.status === 'pending')) return 'pending';
    if (relevant.length > 0) return 'rejected';
    return 'none';
}

function latestRejectionReason(documents, types) {
    const rejected = documents
        .filter((d) => types.includes(d.document_type) && (d.verification_status === 'rejected' || d.status === 'rejected'))
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    return rejected[0]?.rejection_reason || null;
}

// ── Main Component ────────────────────────────────────────────────────
const KYC = () => {
    const refreshSession = useAuthStore(s => s.refreshSession);
    const [kycStatus, setKycStatus] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Tier status + upgrade button
    const [tierLimits, setTierLimits] = useState(null);
    const [upgrading, setUpgrading] = useState(false);
    const [upgradeMsg, setUpgradeMsg] = useState(null);

    // Which tier's panel is expanded — defaults to the first non-verified tier once data loads.
    const [expandedTier, setExpandedTier] = useState(null);
    const [tierPopup, setTierPopup] = useState(null); // { completedTier, nextTier } | null

    // Form state (shared across tier panels)
    const [formData, setFormData] = useState({
        fullName: '',
        dateOfBirth: '',
        nationality: 'NG',
        address: '',
        documentType: '',
        documentNumber: '',
        selfie: null,
        addressDocument: null,
    });

    // SmileID state
    const manualSelfieVideoRef = useRef(null);
    const manualSelfieStreamRef = useRef(null);
    const selfieInputRef = useRef(null);
    const addressDocInputRef = useRef(null);

    const [smileConfigured, setSmileConfigured] = useState(false);
    const [openingSmileVerification, setOpeningSmileVerification] = useState(false);
    const [showManualSelfieCamera, setShowManualSelfieCamera] = useState(false);
    const [docNumberHistoryTick, setDocNumberHistoryTick] = useState(0);

    // ── Data fetching ────────────────────────────────────────────────
    const fetchKYCData = useCallback(async () => {
        setLoading(true);
        const [statusResult, docsResult, smileCfg, limitsResult, profileResult] = await Promise.all([
            kycService.getKYCStatus(),
            kycService.getDocuments(),
            kycService.getSmileConfig(),
            kycService.getTierLimits(),
            userService.getProfile(),
        ]);
        if (statusResult.success) setKycStatus(statusResult.data);
        if (docsResult.success) setDocuments(docsResult.data.documents || []);
        if (smileCfg.success && smileCfg.data?.configured) setSmileConfigured(true);
        else setSmileConfigured(false);
        if (limitsResult.success) setTierLimits(limitsResult.data);
        if (profileResult.success) {
            const u = profileResult.data?.user || {};
            setProfile(u);
            // Pre-fill from the saved profile so a returning user doesn't retype what's already on file.
            setFormData((prev) => ({
                ...prev,
                fullName: prev.fullName || [u.first_name, u.last_name].filter(Boolean).join(' '),
                address: prev.address || u.address || '',
                dateOfBirth: prev.dateOfBirth || (u.date_of_birth ? String(u.date_of_birth).slice(0, 10) : ''),
                nationality: u.country || prev.nationality,
            }));
        }
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

    // ── Tier status derivation ─────────────────────────────────────────
    const rawTier = kycStatus?.kyc_tier;
    const currentTierLabel = typeof rawTier === 'string' && rawTier.startsWith('tier_') ? rawTier : `tier_${Number(rawTier) || 0}`;
    const tierNum = parseInt(currentTierLabel.replace('tier_', '')) || 0;

    const idDocStatus = docStatusFor(documents, ID_DOC_TYPE_VALUES);
    const facialDocStatus = docStatusFor(documents, ['smile_biometric_kyc', 'smile_basic_kyc']);
    // A manually-uploaded ID document only counts toward facial verification if it actually has
    // a selfie attached (has_selfie, from the real selfie_url column — the ID upload alone does
    // NOT guarantee one was included). Mirrors the backend's own check exactly, so this never
    // shows a checkmark the server wouldn't also honor.
    const approvedIdWithSelfie = documents.some((d) => ID_DOC_TYPE_VALUES.includes(d.document_type) && d.verification_status === 'approved' && d.has_selfie);
    const facialApproved = facialDocStatus === 'approved' || approvedIdWithSelfie;
    const tier2SubStatus = (() => {
        if (idDocStatus === 'pending' || facialDocStatus === 'pending') return 'pending';
        if (idDocStatus === 'rejected' && !facialApproved) return 'rejected';
        if (facialDocStatus === 'rejected' && idDocStatus !== 'approved') return 'rejected';
        return 'none';
    })();
    const addressDocStatus = docStatusFor(documents, ADDRESS_DOC_TYPE_VALUES);

    const tierStatus = (num) => {
        if (tierNum >= num) return 'approved';
        if (num === 1) return 'none'; // Tier 1 is instant (profile check), never "pending"
        if (num === 2) return tier2SubStatus;
        if (num === 3) return addressDocStatus;
        return 'none';
    };

    // Sequential: a tier is locked until every tier before it is approved.
    const isLocked = (num) => num > 1 && tierNum < num - 1;
    const firstActionableTier = TIER_DEFS.find((t) => tierStatus(t.num) !== 'approved' && !isLocked(t.num))?.num ?? null;

    useEffect(() => {
        if (loading) return;
        setExpandedTier((prev) => (prev !== null ? prev : firstActionableTier));
    }, [loading, firstActionableTier]);

    // ── Tier 1: save profile + instant upgrade ──────────────────────────
    const handleSaveTier1 = async () => {
        setError(null);
        const [first, ...rest] = formData.fullName.trim().split(/\s+/);
        if (!first || rest.length === 0) { setError('Please enter your full first and last name.'); return; }
        if (!formData.address.trim()) { setError('Please enter your residential address.'); return; }
        setUpgrading(true);
        setUpgradeMsg(null);
        const profileRes = await userService.updateProfile({
            first_name: first,
            last_name: rest.join(' '),
            address: formData.address.trim(),
            date_of_birth: formData.dateOfBirth || undefined,
            country: formData.nationality,
        });
        if (!profileRes.success) {
            setUpgrading(false);
            setUpgradeMsg({ ok: false, text: profileRes.error || 'Could not save your profile.' });
            return;
        }
        const res = await kycService.requestUpgrade(1);
        setUpgrading(false);
        if (res.success) {
            setUpgradeMsg(null);
            setSuccess('Tier 0 complete!');
            setTierPopup({ completedTier: 1, nextTier: 2 });
            fetchKYCData();
        } else {
            setUpgradeMsg({ ok: false, text: res.error || 'Could not upgrade yet.' });
        }
    };

    // Tier 2/3 don't need a manual "upgrade" click — both approval paths (the Smile ID webhook
    // and an admin's manual verifyKYCDocument decision) already bump kyc_tier directly the
    // moment the underlying document is approved, so the tier card just reflects that on the
    // next fetch. Tier 1 is the only one with no async review step, hence handleSaveTier1 above
    // calling /kyc/upgrade explicitly right after saving the profile.

    // ── SmileID hosted Web SDK (Tier 2 — liveness) ──────────────────────
    // v12 opens and owns its own modal iframe — consent, ID-number entry (pre-filled below so
    // that screen is skipped), then selfie + liveness capture, then submits straight to Smile ID's
    // V3 API itself. Nothing comes back to this page except onSuccess/onClose/onError; the actual
    // verdict arrives later on our webhook (processSmileIdentity), same as every other KYC path.
    const handleOpenSmileVerification = async () => {
        setError(null);
        const [first, ...rest] = formData.fullName.trim().split(/\s+/);
        if (!first || rest.length === 0) {
            setError('Please enter your full first and last name before verifying.');
            return;
        }
        if (!formData.documentNumber.trim()) {
            setError('Please enter your document number before verifying.');
            return;
        }
        setOpeningSmileVerification(true);
        try {
            await loadSmileV12Script();
            const tokenRes = await kycService.getSmileV3Token('biometric_kyc');
            if (!tokenRes.success || !tokenRes.data?.token) {
                setError(tokenRes.error || 'Could not start verification session.');
                return;
            }
            const idType = formData.documentType === 'national_id' ? 'NATIONAL_ID' : 'NIN';
            const country = (formData.nationality || 'NG').toUpperCase();
            // user_details requires at least one contact method if supplied at all, and the phone
            // (if any) must be E.164 — if neither a valid email nor E.164 phone is on file, omit
            // the object entirely and let the in-flow form collect it, rather than risking an
            // init-time validation throw over an incomplete/malformed object.
            const e164Phone = /^\+[1-9]\d{6,14}$/.test(profile?.phone || '') ? profile.phone : null;
            const hasContact = !!(profile?.email || e164Phone);

            window.SmileIdentity({
                token: tokenRes.data.token,
                product: 'biometric_kyc',
                callback_url: tokenRes.data.callback_url,
                environment: tokenRes.data.environment === 'production' ? 'production' : 'sandbox',
                partner_details: {
                    partner_id: tokenRes.data.partnerId,
                    name: 'JAXOPAY',
                    logo_url: `${window.location.origin}/logo-icon.png`,
                    policy_url: `${window.location.origin}/privacy`,
                    theme_color: '#1FAD6B',
                },
                ...(hasContact ? {
                    user_details: {
                        given_names: first,
                        last_name: rest.join(' '),
                        ...(profile?.email ? { email: profile.email } : {}),
                        ...(e164Phone ? { phone_number: e164Phone } : {}),
                    },
                } : {}),
                id_info: {
                    [country]: { [idType]: { id_number: formData.documentNumber.trim() } },
                },
                partner_params: {
                    internal_reference: `kyc-tier2-${Date.now()}`,
                },
                onSuccess: () => {
                    setSuccess('Verification submitted! We will update you when processing completes.');
                    fetchKYCData();
                },
                onClose: () => {
                    // User closed the flow — intent, not an error.
                },
                onError: (message) => {
                    if (message === 'SmileIdentity::ConsentDenied') {
                        setError('Verification requires consent to continue.');
                    } else {
                        setError(message || 'Could not complete verification. Please try again.');
                    }
                },
            });
        } catch (err) {
            setError(err?.message || 'Could not start verification. Please try again.');
        } finally {
            setOpeningSmileVerification(false);
        }
    };

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

    // ── Tier 2: submit ID number + selfie (manual path) ────────────────
    const isTier2FormValid = () =>
        formData.documentType && formData.documentNumber.trim() && formData.selfie;

    const handleSubmitTier2 = async () => {
        if (!isTier2FormValid()) {
            setError('Please complete the document type, number, and selfie.'); return;
        }
        setSubmitting(true); setError(null);
        try {
            const idResult = await kycService.submitDocument({
                document_type: formData.documentType,
                document_number: formData.documentNumber.trim(),
                selfie: formData.selfie,
            });
            if (!idResult.success) {
                setError(idResult.error || 'ID submission failed');
                return;
            }
            if (formData.documentNumber.trim()) {
                rememberKycDocNumber(formData.documentType, formData.documentNumber.trim());
                setDocNumberHistoryTick(t => t + 1);
            }
            setSuccess('Identity verification submitted! This usually takes 24-48 hours.');
            fetchKYCData();
        } catch (e) {
            setError(e?.message || 'Submission failed.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Tier 3: submit address proof ─────────────────────────────────
    const handleSubmitTier3 = async () => {
        if (!formData.addressDocument) { setError('Please upload a proof of address document.'); return; }
        setSubmitting(true); setError(null);
        try {
            const addrResult = await kycService.submitDocument({
                document_type: 'proof_of_address',
                document_number: '',
                document_front: formData.addressDocument,
            });
            if (!addrResult.success) {
                setError(addrResult.error || 'Address proof submission failed');
                return;
            }
            setSuccess('Proof of address submitted! This usually takes 24-48 hours.');
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
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Identity Verification</h1>
                <p className="text-muted-foreground">
                    {tierNum >= 3
                        ? "You're fully verified — highest limits and all features unlocked."
                        : 'Complete each level below to unlock higher limits and more features. You can see every level up front — nothing is hidden.'}
                </p>
            </div>

            {/* Current limits summary */}
            {tierLimits && (
                <div className="bg-card border border-border rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Your current level</p>
                        <span className="text-xl font-bold text-foreground">
                            {tierLimits.limits?.[currentTierLabel]?.name || (tierNum > 0 ? `Tier ${tierNum - 1}` : 'Unverified')}
                        </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Daily limits: <strong className="text-foreground">${Number(tierLimits.limits?.[currentTierLabel]?.daily_limit_crypto || 0).toLocaleString()}</strong> crypto
                        {' · '}<strong className="text-foreground">${Number(tierLimits.limits?.[currentTierLabel]?.daily_limit_fiat || 0).toLocaleString()}</strong> fiat
                    </div>
                </div>
            )}

            {/* ── KYC Levels — always visible, sequential ────────────────── */}
            <div className="space-y-4 mb-8">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Verification Levels</h2>

                {TIER_DEFS.map((tier) => {
                    const status = tierStatus(tier.num);
                    const locked = isLocked(tier.num);
                    const isExpanded = expandedTier === tier.num && !locked;
                    const nextLimits = tierLimits?.limits?.[`tier_${tier.num}`];

                    return (
                        <div key={tier.num}
                            className={`bg-card border rounded-2xl overflow-hidden transition-colors ${
                                status === 'approved' ? 'border-success/30' : status === 'rejected' ? 'border-danger/30' : 'border-border'
                            }`}>
                            <button
                                type="button"
                                disabled={locked}
                                onClick={() => setExpandedTier(isExpanded ? null : tier.num)}
                                className={`w-full flex items-center gap-4 p-5 text-left ${locked ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted/40'}`}
                            >
                                <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                                    status === 'approved' ? 'bg-success/10 text-success'
                                        : status === 'rejected' ? 'bg-danger/10 text-danger'
                                        : status === 'pending' ? 'bg-warning/10 text-warning'
                                        : locked ? 'bg-muted text-muted-foreground'
                                        : 'bg-primary/10 text-primary'
                                }`}>
                                    {status === 'approved' ? <CheckCircle2 className="w-5 h-5" />
                                        : status === 'rejected' ? <AlertTriangle className="w-5 h-5" />
                                        : status === 'pending' ? <Clock className="w-5 h-5" />
                                        : locked ? <Lock className="w-5 h-5" />
                                        : <tier.icon className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-foreground">Tier {tier.displayNum}: {tier.title}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                            status === 'approved' ? 'bg-success/10 text-success'
                                                : status === 'rejected' ? 'bg-danger/10 text-danger'
                                                : status === 'pending' ? 'bg-warning/10 text-warning'
                                                : locked ? 'bg-muted text-muted-foreground'
                                                : 'bg-primary/10 text-primary'
                                        }`}>
                                            {status === 'approved' ? 'Verified' : status === 'rejected' ? 'Needs attention' : status === 'pending' ? 'Under review' : locked ? 'Locked' : 'Not started'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {locked ? `Complete Tier ${tier.num - 2} first` : tier.subtitle}
                                    </p>
                                </div>
                                {!locked && (isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />)}
                            </button>

                            <AnimatePresence>
                                {isExpanded && (
                                    <Motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="px-5 pb-5 border-t border-border pt-5">
                                            {/* Requirements checklist — always shown, per-item ticks */}
                                            <div className="mb-5 space-y-2">
                                                {tier.num === 1 && (
                                                    <>
                                                        <ReqRow label="Full name" done={!!(profile?.first_name && profile?.last_name) || tierNum >= 1} />
                                                        <ReqRow label="Residential address" done={!!profile?.address || tierNum >= 1} />
                                                        <ReqRow label="Verified email" done={!!profile?.is_email_verified} />
                                                        <ReqRow label="Phone number" done={!!profile?.phone} />
                                                    </>
                                                )}
                                                {tier.num === 2 && (
                                                    <>
                                                        <ReqRow label="Government ID / NIN" done={idDocStatus === 'approved'} pending={idDocStatus === 'pending'} />
                                                        <ReqRow label="Liveness / facial verification" done={facialApproved} pending={facialDocStatus === 'pending'} />
                                                    </>
                                                )}
                                                {tier.num === 3 && (
                                                    <ReqRow label="Proof of address (utility bill or bank statement)" done={addressDocStatus === 'approved'} pending={addressDocStatus === 'pending'} />
                                                )}
                                            </div>

                                            {nextLimits && status !== 'approved' && (
                                                <p className="text-xs text-muted-foreground mb-4">
                                                    Unlocks: <strong className="text-foreground">${Number(nextLimits.daily_limit_crypto).toLocaleString()}</strong> crypto / <strong className="text-foreground">${Number(nextLimits.daily_limit_fiat).toLocaleString()}</strong> fiat daily · {(nextLimits.features || []).join(', ')}
                                                </p>
                                            )}

                                            {status === 'approved' && (
                                                <div className="flex items-center gap-2 text-success text-sm font-medium">
                                                    <CheckCircle2 className="w-4 h-4" /> This level is verified.
                                                </div>
                                            )}

                                            {status === 'pending' && (
                                                <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm text-foreground">
                                                    Your submission is being reviewed. This typically takes 24-48 hours (often much faster when processed automatically). We'll notify you the moment it's decided.
                                                </div>
                                            )}

                                            {status === 'rejected' && (
                                                <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 text-sm text-foreground mb-4">
                                                    <p className="font-medium text-danger mb-1">Verification didn't go through</p>
                                                    <p>{latestRejectionReason(documents, tier.num === 2 ? [...ID_DOC_TYPE_VALUES, 'smile_biometric_kyc', 'smile_basic_kyc'] : ADDRESS_DOC_TYPE_VALUES) || 'Please try again — this can also happen due to a temporary provider issue.'}</p>
                                                    <p className="mt-1 text-muted-foreground">Our compliance team can also review this manually — no need to do anything else if you'd rather wait.</p>
                                                </div>
                                            )}

                                            {/* Action panels */}
                                            {tier.num === 1 && status !== 'approved' && (
                                                <Tier1Form formData={formData} updateField={updateField} onSave={handleSaveTier1} saving={upgrading} nationalities={SMILE_ISO2_COUNTRIES} />
                                            )}
                                            {tier.num === 2 && (status === 'none' || status === 'rejected') && (
                                                <Tier2Form
                                                    formData={formData} updateField={updateField} handleFileChange={handleFileChange}
                                                    selfieInputRef={selfieInputRef}
                                                    docNumberSuggestions={docNumberSuggestions}
                                                    smileConfigured={smileConfigured}
                                                    onOpenSmileCamera={handleOpenSmileVerification}
                                                    openingSmileVerification={openingSmileVerification}
                                                    onOpenManualSelfie={() => { setError(null); setShowManualSelfieCamera(true); }}
                                                    onSubmit={handleSubmitTier2}
                                                    submitting={submitting}
                                                    isValid={isTier2FormValid()}
                                                />
                                            )}
                                            {tier.num === 3 && (status === 'none' || status === 'rejected') && (
                                                <Tier3Form formData={formData} addressDocInputRef={addressDocInputRef} handleFileChange={handleFileChange} onSubmit={handleSubmitTier3} submitting={submitting} />
                                            )}
                                        </div>
                                    </Motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>

            {upgradeMsg && !upgradeMsg.ok && (
                <p className="text-sm text-danger mb-6">{upgradeMsg.text}</p>
            )}

            {/* Why Verify section */}
            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
                <div className="flex items-start gap-3 mb-4">
                    <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <h3 className="text-lg font-bold text-foreground">Why verify your identity?</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0"><Shield className="w-4 h-4 text-primary" /></div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Account Security</p>
                            <p className="text-xs text-muted-foreground">Protect your account from unauthorized access</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0"><ArrowRight className="w-4 h-4 text-primary" /></div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Higher Limits</p>
                            <p className="text-xs text-muted-foreground">Unlock higher transaction and withdrawal limits</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0"><CreditCard className="w-4 h-4 text-primary" /></div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Full Features</p>
                            <p className="text-xs text-muted-foreground">Access virtual cards, crypto trading, and more</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0"><Globe className="w-4 h-4 text-primary" /></div>
                        <div>
                            <p className="text-sm font-medium text-foreground">Regulatory Compliance</p>
                            <p className="text-xs text-muted-foreground">Meet KYC/AML requirements for financial services</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Previous Submissions */}
            {documents.length > 0 && <SubmittedDocuments documents={documents} />}

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

            {/* Tier completion popup */}
            <AnimatePresence>
                {tierPopup && (
                    <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setTierPopup(null)}>
                        <Motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
                            onClick={(e) => e.stopPropagation()}>
                            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <PartyPopper className="w-8 h-8 text-success" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">Tier {tierPopup.completedTier - 1} complete!</h3>
                            {tierPopup.nextTier ? (
                                <>
                                    <p className="text-muted-foreground text-sm mb-6">
                                        Continue to Tier {tierPopup.nextTier - 1} from your dashboard any time to unlock even higher limits and more features.
                                    </p>
                                    <div className="flex gap-3">
                                        <button onClick={() => setTierPopup(null)} className="flex-1 py-3 bg-muted text-foreground font-medium rounded-xl">
                                            Later
                                        </button>
                                        <button
                                            onClick={() => { setExpandedTier(tierPopup.nextTier); setTierPopup(null); }}
                                            className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl"
                                        >
                                            Start Tier {tierPopup.nextTier - 1}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-muted-foreground text-sm mb-6">
                                        You've completed every verification level. Enjoy the highest limits and full platform access.
                                    </p>
                                    <button onClick={() => setTierPopup(null)} className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl">
                                        Done
                                    </button>
                                </>
                            )}
                        </Motion.div>
                    </Motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ── Small building blocks ─────────────────────────────────────────────
const ReqRow = ({ label, done, pending }) => (
    <div className="flex items-center gap-2 text-sm">
        {done ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            : pending ? <Clock className="w-4 h-4 text-warning shrink-0" />
            : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
        <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
);

const Tier1Form = ({ formData, updateField, onSave, saving, nationalities }) => (
    <div className="space-y-4">
        <div>
            <label className="block text-sm font-medium text-foreground mb-2">Full Legal Name</label>
            <input value={formData.fullName}
                onChange={e => updateField('fullName', e.target.value)}
                placeholder="Enter your full name as it appears on your ID"
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground" />
        </div>
        <div>
            <label className="block text-sm font-medium text-foreground mb-2">Date of Birth</label>
            <input type="date" value={formData.dateOfBirth}
                onChange={e => updateField('dateOfBirth', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none" />
        </div>
        <div>
            <label className="block text-sm font-medium text-foreground mb-2">Nationality</label>
            <select value={formData.nationality}
                onChange={e => updateField('nationality', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted text-foreground focus:ring-2 focus:ring-ring focus:outline-none">
                {nationalities.map(c => (
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
        <button onClick={onSave} disabled={saving}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>) : (<>Complete Tier 0 <ArrowRight className="w-4 h-4" /></>)}
        </button>
    </div>
);

const Tier2Form = ({
    formData, updateField, handleFileChange, selfieInputRef,
    docNumberSuggestions, smileConfigured, onOpenSmileCamera, openingSmileVerification, onOpenManualSelfie, onSubmit, submitting, isValid,
}) => (
    <div className="space-y-6">
        {/* Document Type Selector */}
        <div>
            <label className="block text-sm font-medium text-foreground mb-3">Document Type</label>
            <div className="grid grid-cols-3 gap-3">
                {ID_DOCUMENT_TYPES.map(doc => (
                    <button key={doc.id} type="button" onClick={() => updateField('documentType', doc.id)}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${
                            formData.documentType === doc.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'
                        }`}>
                        <doc.icon className={`w-6 h-6 mx-auto mb-2 ${formData.documentType === doc.id ? 'text-primary' : 'text-muted-foreground'}`} />
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

        {/* Selfie / Liveness */}
        <div>
            <h3 className="text-sm font-bold text-foreground mb-1">Liveness / Selfie Verification</h3>
            {smileConfigured && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-3">
                    <div className="flex items-start gap-3 mb-4">
                        <ScanFace className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-foreground mb-1">Liveness Verification (Recommended)</h4>
                            <p className="text-sm text-muted-foreground">Use our guided camera to verify your identity in real-time. Results in minutes.</p>
                        </div>
                    </div>
                    <button type="button" onClick={onOpenSmileCamera}
                        disabled={submitting || openingSmileVerification || !formData.fullName.trim() || !formData.documentNumber.trim()}
                        className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        <Camera className="w-5 h-5" /> {openingSmileVerification ? 'Starting verification…' : 'Open Camera - Liveness Capture'}
                    </button>
                    {(!formData.fullName.trim() || !formData.documentNumber.trim()) && (
                        <p className="text-xs text-muted-foreground mt-2 text-center">Enter your name and document number above first</p>
                    )}
                </div>
            )}

            <div className="relative flex items-center gap-3 text-muted-foreground my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-medium">OR upload manually</span>
                <div className="flex-1 h-px bg-border" />
            </div>

            <div className="flex gap-3 mb-3">
                <button type="button" onClick={onOpenManualSelfie}
                    className="flex-1 py-3 bg-muted hover:bg-muted/80 border border-border rounded-xl font-medium text-foreground text-sm flex items-center justify-center gap-2 transition-colors">
                    <Camera className="w-4 h-4" /> Take Photo
                </button>
                <button type="button" onClick={() => selfieInputRef.current?.click()}
                    className="flex-1 py-3 bg-muted hover:bg-muted/80 border border-border rounded-xl font-medium text-foreground text-sm flex items-center justify-center gap-2 transition-colors">
                    <Upload className="w-4 h-4" /> Upload Photo
                </button>
            </div>

            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${formData.selfie ? 'border-primary bg-primary/5' : 'border-border'}`}>
                {formData.selfie ? (
                    <div className="text-primary">
                        <Check className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-sm font-medium">{formData.selfie.name}</p>
                        <button type="button" onClick={() => updateField('selfie', null)} className="text-xs text-danger underline mt-2">Remove</button>
                    </div>
                ) : (
                    <>
                        <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm font-medium text-foreground">No selfie captured yet</p>
                    </>
                )}
            </div>
            <input ref={selfieInputRef} type="file" accept="image/*" capture="user" onChange={e => handleFileChange(e, 'selfie')} className="hidden" />
        </div>

        <button onClick={onSubmit} disabled={submitting || !isValid}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {submitting ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>) : (<>Submit Manual Verification <ArrowRight className="w-4 h-4" /></>)}
        </button>
    </div>
);

const Tier3Form = ({ formData, addressDocInputRef, handleFileChange, onSubmit, submitting }) => (
    <div className="space-y-6">
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
            <input ref={addressDocInputRef} type="file" accept="image/*,.pdf" onChange={e => handleFileChange(e, 'addressDocument')} className="hidden" />
        </div>

        <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-sm font-medium text-foreground mb-3">Accepted documents:</p>
            <ul className="space-y-2">
                {ADDRESS_DOCUMENT_TYPES.map((doc, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {doc}
                    </li>
                ))}
            </ul>
        </div>

        <button onClick={onSubmit} disabled={submitting || !formData.addressDocument}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {submitting ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>) : (<>Submit Address Proof <ArrowRight className="w-4 h-4" /></>)}
        </button>
    </div>
);

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
                        doc.verification_status === 'approved' ? 'bg-success/10 text-success'
                        : doc.verification_status === 'rejected' ? 'bg-danger/10 text-danger'
                        : 'bg-warning/10 text-warning'
                    }`}>
                        {doc.verification_status}
                    </span>
                </div>
            ))}
        </div>
    </div>
);

export default KYC;
