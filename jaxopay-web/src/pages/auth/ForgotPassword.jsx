import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Mail,
    Lock,
    ArrowLeft,
    Check,
    AlertCircle,
    Eye,
    EyeOff,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { requestPasswordReset, resetPassword, isLoading } = useAuthStore();

    const [step, setStep] = useState(1); // 1: Request, 2: Sent, 3: Reset (with token)
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Check for reset token in URL
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            setStep(3);
        }
    }, [searchParams]);

    const handleRequestReset = async (e) => {
        e.preventDefault();
        setError('');

        if (!email) {
            setError('Please enter your email address');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('Please enter a valid email address');
            return;
        }

        const result = await requestPasswordReset(email);
        if (result.success) {
            setStep(2);
        } else {
            setError(result.error || 'Failed to send reset email. Please try again.');
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');

        if (!password || !confirmPassword) {
            setError('Please fill in all fields');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        const token = searchParams.get('token');
        const result = await resetPassword(token, password);
        if (result.success) {
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } else {
            setError(result.error || 'Failed to reset password. The link may have expired.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2">
                        <img src="/logo-icon.png" alt="JAXOPAY" className="w-12 h-12 object-contain" />
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">JAXOPAY</span>
                    </Link>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
                    {/* Step 1: Request Password Reset */}
                    {step === 1 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to login
                            </Link>

                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Forgot password?
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-8">
                                No worries, we'll send you reset instructions.
                            </p>

                            {error && (
                                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                                </div>
                            )}

                            <form onSubmit={handleRequestReset} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter your email"
                                            className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                    ) : (
                                        'Reset Password'
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {/* Step 2: Email Sent */}
                    {step === 2 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center"
                        >
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Mail className="w-8 h-8 text-primary-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Check your email
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                We sent a password reset link to<br />
                                <span className="font-medium text-gray-900 dark:text-white">{email}</span>
                            </p>

                            <button
                                onClick={() => navigate('/login')}
                                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl mb-4"
                            >
                                Back to Login
                            </button>

                            <p className="text-sm text-gray-500">
                                Didn't receive the email?{' '}
                                <button
                                    onClick={() => setStep(1)}
                                    className="text-primary-600 hover:text-green-700 font-medium"
                                >
                                    Click to resend
                                </button>
                            </p>
                        </motion.div>
                    )}

                    {/* Step 3: Set New Password */}
                    {step === 3 && !success && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Set new password
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-8">
                                Your new password must be different from previously used passwords.
                            </p>

                            {error && (
                                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                                </div>
                            )}

                            <form onSubmit={handleResetPassword} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter new password"
                                            className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Confirm New Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                    ) : (
                                        'Reset Password'
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {/* Success State */}
                    {step === 3 && success && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center"
                        >
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Check className="w-8 h-8 text-primary-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Password reset successfully
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Your password has been reset. Redirecting to login...
                            </p>
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto" />
                        </motion.div>
                    )}
                </div>

                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
                    Remember your password?{' '}
                    <Link to="/login" className="text-primary-600 hover:text-green-700 font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default ForgotPassword;
