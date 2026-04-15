import logger from '../utils/logger.js';

// Custom error class
export class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Not found handler
export const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

// Global error handler
export const errorHandler = (err, req, res, next) => {
  // Normalize raw Axios/upstream errors into operational AppError-shaped objects
  // so they surface with meaningful status codes instead of generic 500s.
  if (!err.isOperational && err.response) {
    const upstreamStatus = err.response.status;
    const upstreamMsg = err.response.data?.message || err.message;
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      err.statusCode = 502;
      err.message = 'Payment provider authentication failed. Please contact support.';
    } else if (upstreamStatus >= 400 && upstreamStatus < 500) {
      err.statusCode = upstreamStatus;
      err.message = upstreamMsg || 'Invalid request to payment provider.';
    } else {
      err.statusCode = 502;
      err.message = 'Payment provider is temporarily unavailable. Please try again.';
    }
    err.isOperational = true;
    err.status = `${err.statusCode}`.startsWith('4') ? 'fail' : 'error';
  }

  // Normalize circuit-breaker errors (plain Error objects with no .response)
  if (!err.isOperational && !err.response && /circuit breaker/i.test(err.message)) {
    err.statusCode = 503;
    err.message = 'This service is temporarily unavailable. Please try again in a few seconds.';
    err.isOperational = true;
    err.status = 'error';
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error
  if (err.statusCode === 500) {
    logger.error('Internal Server Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      user: req.user?.id,
    });
  } else {
    logger.warn('Client Error:', {
      message: err.message,
      statusCode: err.statusCode,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // Development error response
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      error: {
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode,
      },
    });
  }

  // Production error response
  if (err.isOperational) {
    // Operational, trusted error: send message to client
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
    });
  }

  // Programming or unknown error: don't leak error details
  return res.status(500).json({
    success: false,
    status: 'error',
    message: 'Something went wrong. Please try again later.',
  });
};

// Async error wrapper
export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation error handler
export const handleValidationError = (errors) => {
  const messages = errors.array().map(err => ({
    field: err.path,
    message: err.msg,
  }));
  
  return new AppError(
    'Validation failed',
    400,
    true
  );
};

