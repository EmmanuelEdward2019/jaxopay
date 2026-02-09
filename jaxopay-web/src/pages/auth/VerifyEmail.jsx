import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Mail, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const VerifyEmail = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { token: urlToken } = useParams();
    const { verifyEmail, resendVerificationEmail, isLoading } = useAuthStore();

    const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error', 'resend'
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (urlToken) {
            handleVerify(urlToken);
        } else {
            // No token, show resend form
            setStatus('resend');
        }
    }, [urlToken]);

    const handleVerify = async (token) => {
        setStatus('verifying');
        const result = await verifyEmail(token);
        if (result.success) {
            setStatus('success');
            setMessage('Your email has been verified successfully!');
            setTimeout(() => navigate('/login'), 3000);
        } else {
            setStatus('error');
            setMessage(result.error || 'Verification failed. The link may have expired.');
        }
    };

    const handleResend = async () => {
        if (!email) {
            setMessage('Please enter your email address');
            return;
        }

        const result = await resendVerificationEmail(email);
        if (result.success) {
            setMessage('Verification email sent! Check your inbox.');
        } else {
            setMessage(result.error || 'Failed to send verification email.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2">
                        <img src="/logo.png" alt="JAXOPAY" className="w-12 h-12 object-contain" />
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">JAXOPAY</span>
                    </Link>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
                    {/* Verifying State */}
                    {status === 'verifying' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <div className="w-16 h-16 mx-auto mb-6">
                                <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-200 border-t-primary-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Verifying your email...
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                Please wait while we verify your email address.
                            </p>
                        </motion.div>
                    )}

                    {/* Success State */}
                    {status === 'success' && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="w-8 h-8 text-primary-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Email Verified!
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                {message}
                            </p>
                            <p className="text-sm text-gray-500 mb-4">
                                Redirecting to login...
                            </p>
                            <Link
                                to="/login"
                                className="inline-block w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl"
                            >
                                Go to Login
                            </Link>
                        </motion.div>
                    )}

                    {/* Error State */}
                    {status === 'error' && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <XCircle className="w-8 h-8 text-red-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Verification Failed
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                {message}
                            </p>
                            <div className="space-y-4">
                                <button
                                    onClick={() => setStatus('resend')}
                                    className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
                                >
                                    <RefreshCw className="w-5 h-5" />
                                    Request New Link
                                </button>
                                <Link
                                    to="/login"
                                    className="block w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    Back to Login
                                </Link>
                            </div>
                        </motion.div>
                    )}

                    {/* Resend Form */}
                    {status === 'resend' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Mail className="w-8 h-8 text-blue-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Verify Your Email
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Enter your email to receive a new verification link.
                            </p>

                            {message && (
                                <div className={`mb-4 p-4 rounded-xl text-sm ${message.includes('sent')
                                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                    }`}>
                                    {message}
                                </div>
                            )}

                            <div className="space-y-4">
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
                                <button
                                    onClick={handleResend}
                                    disabled={isLoading}
                                    className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                    ) : (
                                        <>
                                            <Mail className="w-5 h-5" />
                                            Send Verification Email
                                        </>
                                    )}
                                </button>
                            </div>
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
