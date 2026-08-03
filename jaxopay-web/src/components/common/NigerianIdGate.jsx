import { useState } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import fxService from '../../services/fxService';
import kycService from '../../services/kycService';

const IdRow = ({ idType, verified, pending, value, onChange, submitting, onSubmit }) => (
    <div className="flex items-center gap-2">
        <div className="w-14 shrink-0 text-sm font-bold text-gray-700 dark:text-gray-300">{idType.toUpperCase()}</div>
        {verified ? (
            <div className="flex-1 flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Verified
            </div>
        ) : pending ? (
            <div className="flex-1 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 font-medium">
                <Clock className="w-4 h-4" /> Under review — usually approved shortly
            </div>
        ) : (
            <>
                <input
                    value={value}
                    onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    inputMode="numeric"
                    placeholder={`Enter your 11-digit ${idType.toUpperCase()}`}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm"
                />
                <button
                    onClick={onSubmit}
                    disabled={submitting === idType || value.length !== 11}
                    className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
                >
                    {submitting === idType ? '...' : 'Submit'}
                </button>
            </>
        )}
    </div>
);

/**
 * Blocking gate shown to Nigerian users before any Yellow Card-routed transaction (crypto
 * ramp, NGN deposit, international transfer, currency swap) — BOTH BVN and NIN must be
 * verified. Non-Nigerian profiles never see this (the backend reports `required: false`
 * and callers should just skip rendering this component in that case).
 *
 * Usage: fetch `GET /fx/ramp/status` (shared Nigerian-ID status endpoint, not ramp-specific
 * despite the URL) into `gate`, render this component whenever `gate.required && !gate.verified`,
 * and pass `onRefresh` to receive the refreshed status once both are approved.
 */
export default function NigerianIdGate({ gate, onRefresh, title, description }) {
    const [bvn, setBvn] = useState('');
    const [nin, setNin] = useState('');
    const [submitting, setSubmitting] = useState(null); // 'bvn' | 'nin' | null
    const [message, setMessage] = useState('');

    if (!gate?.required || gate.verified) return null;

    const submit = async (idType, value) => {
        if (!/^\d{11}$/.test(value.trim())) {
            setMessage(`Enter a valid 11-digit ${idType.toUpperCase()}.`);
            return;
        }
        setSubmitting(idType);
        setMessage('');
        const res = await kycService.verifyRampId({ id_type: idType, id_number: value.trim() });
        setSubmitting(null);
        if (res.success) {
            setMessage(`${idType.toUpperCase()} submitted for verification.`);
            if (idType === 'bvn') setBvn(''); else setNin('');
            const fresh = await fxService.getRampStatus().catch(() => null);
            if (fresh?.success) onRefresh?.(fresh.data);
        } else {
            setMessage(res.error || res.message || 'Submission failed.');
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3 mb-4">
                <ShieldCheck className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <h2 className="font-semibold text-gray-900 dark:text-white">{title || 'Verify your BVN and NIN'}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {description || 'Both your Bank Verification Number and National Identification Number must be verified before this transaction — Nigerian regulatory requirement. This is a one-time step.'}
                    </p>
                </div>
            </div>
            <div className="space-y-3">
                <IdRow idType="bvn" verified={gate.bvnVerified} pending={gate.bvnPending} value={bvn} onChange={setBvn}
                    submitting={submitting} onSubmit={() => submit('bvn', bvn)} />
                <IdRow idType="nin" verified={gate.ninVerified} pending={gate.ninPending} value={nin} onChange={setNin}
                    submitting={submitting} onSubmit={() => submit('nin', nin)} />
            </div>
            {message && <p className="text-sm mt-3 text-gray-600 dark:text-gray-300">{message}</p>}
            <button
                onClick={async () => {
                    const fresh = await fxService.getRampStatus().catch(() => null);
                    if (fresh?.success) onRefresh?.(fresh.data);
                }}
                className="mt-4 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 inline-flex items-center gap-2"
            >
                <RefreshCw className="w-4 h-4" /> Refresh status
            </button>
        </div>
    );
}
