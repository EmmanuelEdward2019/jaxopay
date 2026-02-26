import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const Login = () => {
  const [step, setStep] = useState('login'); // 'login' or '2fa'
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, verifyOTP, isLoading, error, tempUserId, twoFAMethod } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data) => {
    const result = await login(data.email, data.password);
    if (result.success) {
      if (result.requires2FA) {
        setStep('2fa');
      } else {
        navigate('/dashboard');
      }
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    // Call verifyOTP(otp, phone, userId)
    // Since this is email login, phone is null, use tempUserId
    const result = await verifyOTP(otp, null, tempUserId);
    if (result.success) {
      navigate('/dashboard');
    }
  };

  if (step === '2fa') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent-50 to-accent-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Two-Factor Authentication</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Enter the code from {twoFAMethod === 'authenticator' ? 'your authenticator app' : 'your email/SMS'}.
            </p>
          </div>

          <div className="card">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Verification Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="input-field text-center text-2xl tracking-widest"
                  placeholder="000000"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || otp.length < 6}
                className="w-full btn-primary flex items-center justify-center"
              >
                {isLoading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : 'Verify'}
              </button>
            </form>
            <button onClick={() => setStep('login')} className="mt-4 text-sm text-center w-full text-gray-500 hover:text-gray-700">Back to Login</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent-50 to-accent-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="JAXOPAY"
            className="h-20 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome Back</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Sign in to your JAXOPAY account
          </p>
        </div>

        {/* Login Form */}
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  {...register('email')}
                  type="email"
                  id="email"
                  className="input-field pl-10"
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  className="input-field pl-10 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Remember me
                </label>
              </div>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">Or continue with</span>
              </div>
            </div>
          </div>

          {/* Social Login - Placeholder for future implementation */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <Link to="/signup" className="font-medium text-accent-600 hover:text-accent-500 dark:text-accent-400">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

