import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ShieldCheck, Lock, AlertCircle, Loader2 } from 'lucide-react';
import pinService from '../../services/pinService';

/**
 * Reusable transaction-PIN entry modal.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - onConfirm: (pin: string) => void   // parent runs the transaction with this pin
 *  - title, description: strings
 *  - processing: boolean                // parent is submitting
 *  - errorMessage: string               // error from the parent's transaction attempt (e.g. wrong PIN)
 */
const PinModal = ({ open, onClose, onConfirm, title = 'Enter Transaction PIN', description = 'Authorize this transaction with your 4-digit PIN.', processing = false, errorMessage = '' }) => {
    const navigate = useNavigate();
    const [digits, setDigits] = useState(['', '', '', '']);
    const [statusLoading, setStatusLoading] = useState(true);
    const [pinSet, setPinSet] = useState(true);
    const [locked, setLocked] = useState(false);
    const inputs = useRef([]);

    useEffect(() => {
        if (!open) return;
        setDigits(['', '', '', '']);
        setStatusLoading(true);
        pinService.getStatus().then((res) => {
            if (res.success) {
                setPinSet(res.data.is_set);
                setLocked(res.data.locked);
            }
            setStatusLoading(false);
            setTimeout(() => inputs.current[0]?.focus(), 50);
        });
    }, [open]);

    // Clear digits whenever the parent reports an error so the user can retry.
    useEffect(() => {
        if (errorMessage) {
            setDigits(['', '', '', '']);
            setTimeout(() => inputs.current[0]?.focus(), 50);
        }
    }, [errorMessage]);

    if (!open) return null;

    const handleChange = (i, val) => {
        const d = val.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[i] = d;
        setDigits(next);
        if (d && i < 3) inputs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i, e) => {
        if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
        if (e.key === 'Enter') submit();
    };

    const handlePaste = (e) => {
        const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
        if (pasted) {
            const next = ['', '', '', ''];
            pasted.split('').forEach((c, idx) => { next[idx] = c; });
            setDigits(next);
            inputs.current[Math.min(pasted.length, 3)]?.focus();
        }
        e.preventDefault();
    };

    const pin = digits.join('');
    const submit = () => {
        if (pin.length === 4 && !processing) onConfirm(pin);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl border border-border p-6 relative animate-in zoom-in-95 duration-200">
                <button onClick={onClose} disabled={processing} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground disabled:opacity-40">
                    <X className="w-5 h-5" />
                </button>

                {statusLoading ? (
                    <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <p className="text-sm">Checking your security settings…</p>
                    </div>
                ) : !pinSet ? (
                    <div className="py-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck className="w-7 h-7 text-primary" />
                        </div>
                        <h3 className="text-lg font-bold text-foreground mb-1">Set up your transaction PIN</h3>
                        <p className="text-sm text-muted-foreground mb-6">You need a 4-digit transaction PIN to authorize payments and withdrawals.</p>
                        <button
                            onClick={() => { onClose(); navigate('/dashboard/settings?tab=security'); }}
                            className="w-full py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-colors"
                        >
                            Set up PIN in Settings
                        </button>
                    </div>
                ) : locked ? (
                    <div className="py-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-7 h-7 text-danger" />
                        </div>
                        <h3 className="text-lg font-bold text-foreground mb-1">PIN temporarily locked</h3>
                        <p className="text-sm text-muted-foreground mb-6">Too many incorrect attempts. Please try again later or reset your PIN in Settings.</p>
                        <button onClick={onClose} className="w-full py-3 bg-muted text-foreground rounded-2xl font-bold hover:bg-muted/80 transition-colors">Close</button>
                    </div>
                ) : (
                    <div className="pt-2">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck className="w-7 h-7 text-primary" />
                        </div>
                        <h3 className="text-lg font-bold text-foreground text-center mb-1">{title}</h3>
                        <p className="text-sm text-muted-foreground text-center mb-6">{description}</p>

                        <div className="flex justify-center gap-3 mb-4" onPaste={handlePaste}>
                            {digits.map((d, i) => (
                                <input
                                    key={i}
                                    ref={(el) => (inputs.current[i] = el)}
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={d}
                                    disabled={processing}
                                    onChange={(e) => handleChange(i, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(i, e)}
                                    className="w-12 h-14 text-center text-2xl font-bold bg-muted/50 border border-border rounded-2xl outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50"
                                    maxLength={1}
                                />
                            ))}
                        </div>

                        {errorMessage && (
                            <div className="flex items-center gap-2 justify-center text-danger text-sm mb-4">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        <button
                            onClick={submit}
                            disabled={pin.length !== 4 || processing}
                            className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {processing ? (<><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>) : 'Confirm'}
                        </button>

                        <button
                            onClick={() => { onClose(); navigate('/dashboard/settings?tab=security'); }}
                            className="w-full mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                            Forgot PIN? Reset in Settings
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PinModal;
