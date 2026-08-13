import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

// Signup verification via a 6-digit code the user reads out of their inbox and types in —
// replaces the old clickable-link flow. Real verification links routinely got hit by corporate
// "safe links" email scanners and link-preview features before the user ever clicked, silently
// consuming the one-shot token; a code typed in by hand can't be "clicked" by a bot.
const VerifyEmail = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { verifyEmailCode, resendVerificationEmail, isLoading } = useAuthStore();

    const [email, setEmail] = useState(location.state?.email || searchParams.get('email') || '');
    const [code, setCode] = useState('');
    const [status, setStatus] = useState('idle'); // 'idle' | 'success'
    const [error, setError] = useState('');
    const [resending, setResending] = useState(false);
    const [resendSent, setResendSent] = useState(false);
    const codeInputRef = useRef(null);

    useEffect(() => {
        codeInputRef.current?.focus();
    }, []);

    const handleVerify = async (e) => {
        e.preventDefault();
        setError('');
        if (!email) {
            setError('Please enter your email address');
            return;
        }
        if (!/^\d{6}$/.test(code)) {
            setError('Enter the 6-digit code from your email');
            return;
        }
        const result = await verifyEmailCode(email, code);
        if (result.success) {
            setStatus('success');
            setTimeout(() => navigate('/dashboard'), 1200);
        } else {
            setError(result.error || 'Verification failed. Please check the code and try again.');
        }
    };

    const handleResend = async () => {
        if (!email) {
            setError('Please enter your email address');
            return;
        }
        setError('');
        setResending(true);
        const result = await resendVerificationEmail(email);
        setResending(false);
        if (result.success) {
            setResendSent(true);
            setCode('');
        } else {
            setError(result.error || 'Failed to send verification code.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2">
                        <img src="/logo.png" alt="JAXOPAY" className="w-12 h-12 object-contain" />
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">JAXOPAY</span>
                    </Link>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
                    {status === 'success' ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="w-8 h-8 text-primary-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Email Verified!
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                Taking you to your dashboard...
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <ShieldCheck className="w-8 h-8 text-blue-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Verify Your Email
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Enter the 6-digit code we sent to your email address.
                            </p>

                            {error && (
                                <div className="mb-4 p-4 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                                    {error}
                                </div>
                            )}
                            {resendSent && !error && (
                                <div className="mb-4 p-4 rounded-xl text-sm bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300">
                                    New code sent! Check your inbox (and spam folder).
                                </div>
                            )}

                            <form onSubmit={handleVerify} className="space-y-4">
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Enter your email"
                                        className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    />
                                </div>
                                <input
                                    ref={codeInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    className="w-full py-4 text-center text-3xl font-bold tracking-[0.5em] bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                                <button
                                    type="submit"
                                    disabled={isLoading || code.length !== 6}
                                    className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto" />
                                    ) : (
                                        'Verify Email'
                                    )}
                                </button>
                            </form>

                            <p className="text-sm text-gray-500 mt-6">
                                Didn't get a code?{' '}
                                <button
                                    onClick={handleResend}
                                    disabled={resending}
                                    className="text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                                    {resending ? 'Sending...' : 'Resend code'}
                                </button>
                            </p>
                        </motion.div>
                    )}
                </div>

                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
                    Need help?{' '}
                    <Link to="/contact" className="text-primary-600 hover:text-primary-700 font-medium">
                        Contact Support
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default VerifyEmail;
