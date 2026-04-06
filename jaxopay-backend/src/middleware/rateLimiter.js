import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

// General API rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Increased to 1000 for development
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
    });
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
    });
  },
});

// Strict rate limiter for authentication endpoints
// Production: 10 attempts per 15 min, Development: 50 attempts
const authMaxAttempts = process.env.NODE_ENV === 'production' ? 10 : 50;

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: authMaxAttempts,
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded:', {
      ip: req.ip,
      url: req.originalUrl,
      email: req.body.email,
      userAgent: req.get('user-agent'),
    });
    res.status(429).json({
      success: false,
      message: `Too many authentication attempts from this IP. Please try again in 15 minutes.`,
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },
});

// OTP rate limiter (stricter) - Production: 3 attempts, Development: 10
const otpMaxAttempts = process.env.NODE_ENV === 'production' ? 3 : 10;

export const otpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: otpMaxAttempts,
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later.',
  },
  handler: (req, res) => {
    logger.warn('OTP rate limit exceeded:', {
      ip: req.ip,
      phone: req.body.phone,
      userAgent: req.get('user-agent'),
    });
    res.status(429).json({
      success: false,
      message: `Too many OTP requests. Please try again in ${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60)} minutes.`,
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },
});

// Transaction rate limiter
export const transactionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each user to 10 transactions per minute
  message: {
    success: false,
    message: 'Too many transactions, please slow down.',
  },
  keyGenerator: (req) => {
    // Use user ID instead of IP for authenticated requests
    return req.user?.id || req.ip;
  },
});

export default rateLimiter;

