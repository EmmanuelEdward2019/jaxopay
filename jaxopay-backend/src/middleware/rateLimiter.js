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
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased to 50 for development
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded:', {
      ip: req.ip,
      url: req.originalUrl,
      email: req.body.email,
    });
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again in 15 minutes.',
    });
  },
});

// OTP rate limiter
export const otpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Increased to 20 for development
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later.',
  },
  handler: (req, res) => {
    logger.warn('OTP rate limit exceeded:', {
      ip: req.ip,
      phone: req.body.phone,
    });
    res.status(429).json({
      success: false,
      message: 'Too many OTP requests, please try again in 5 minutes.',
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

