import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, TrendingUp, X } from 'lucide-react';
import { useKycGateStore } from '../store/kycGateStore';

// Global handler for the backend's KYC 403 codes, mounted once at the app root and driven by
// kycGateStore (fired from apiClient.js's response interceptor). Mirrors RN's KycGateModal.tsx.
// Deliberately scoped to KYC_TIER_REQUIRED and LIMIT_EXCEEDED only — BVN_NIN_REQUIRED/PENDING
// already have working inline handling on the specific pages that need them (Wallets.jsx,
// CrossBorder.jsx, CryptoRamp.jsx all render NigerianIdGate reactively already); routing those
// through this modal too would show two different prompts for the same condition.
const CONFIG = {
    KYC_TIER_REQUIRED: {
        icon: ShieldCheck,
        title: 'Verify your identity',
        fallbackBody: 'Verify your identity to use this feature. It only takes a minute.',
        cta: 'Verify identity',
        tone: 'accent',
    },
    LIMIT_EXCEEDED: {
        icon: TrendingUp,
        title: 'Limit reached',
        fallbackBody: 'This transaction exceeds your current limit. Upgrade your KYC tier to raise it.',
        cta: 'Upgrade KYC',
        tone: 'crit',
    },
};

const TONE_CLASSES = {
    accent: { bg: 'bg-primary/10', fg: 'text-primary', btn: 'bg-primary hover:bg-primary/90' },
    crit: { bg: 'bg-danger/10', fg: 'text-danger', btn: 'bg-danger hover:bg-danger/90' },
};

export default function KycGateModal() {
    const navigate = useNavigate();
    const visible = useKycGateStore((s) => s.visible);
    const code = useKycGateStore((s) => s.code);
    const message = useKycGateStore((s) => s.message);
    const hide = useKycGateStore((s) => s.hide);

    const cfg = code ? CONFIG[code] : null;
    if (!cfg) return null;
    const Icon = cfg.icon;
    const tone = TONE_CLASSES[cfg.tone];

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={hide}
                >
                    <motion.div
                        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                        className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button type="button" onClick={hide} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                            <X className="w-5 h-5" />
                        </button>

                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${tone.bg}`}>
                            <Icon className={`w-8 h-8 ${tone.fg}`} />
                        </div>

                        <h3 className="text-lg font-bold text-foreground mb-2">{cfg.title}</h3>
                        {/* Prefer the backend message when it's user-ready (e.g. LIMIT_EXCEEDED carries
                            the limit + remaining amount verbatim). */}
                        <p className="text-sm text-muted-foreground mb-6">{message || cfg.fallbackBody}</p>

                        <button
                            type="button"
                            onClick={() => { hide(); navigate('/dashboard/kyc'); }}
                            className={`w-full py-3 text-white font-bold rounded-xl transition-all mb-2 ${tone.btn}`}
                        >
                            {cfg.cta}
                        </button>
                        <button type="button" onClick={hide} className="text-sm text-muted-foreground hover:text-foreground py-2">
                            Not now
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
