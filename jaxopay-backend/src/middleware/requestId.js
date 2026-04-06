import crypto from 'crypto';
import logger from '../utils/logger.js';

/**
 * Request ID Middleware
 * Generates or extracts request ID for distributed tracing
 * Attaches to request, response headers, and logs
 */

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Generate a unique request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Middleware to attach request ID to all requests
 */
export const attachRequestId = (req, res, next) => {
  // Check if client provided a request ID
  let requestId = req.get(REQUEST_ID_HEADER);

  // Generate new ID if none provided or invalid format
  if (!requestId || typeof requestId !== 'string' || requestId.length > 100) {
    requestId = generateRequestId();
  }

  // Attach to request object
  req.requestId = requestId;

  // Add to response headers for client debugging
  res.setHeader(REQUEST_ID_HEADER, requestId);

  // Add to all logs in this request context
  const originalLog = logger.info.bind(logger);
  const originalWarn = logger.warn.bind(logger);
  const originalError = logger.error.bind(logger);

  logger.info = (message, meta = {}) => originalLog(message, { ...meta, requestId });
  logger.warn = (message, meta = {}) => originalWarn(message, { ...meta, requestId });
  logger.error = (message, meta = {}) => originalError(message, { ...meta, requestId });

  // Restore original logger after response
  res.on('finish', () => {
    logger.info = originalLog;
    logger.warn = originalWarn;
    logger.error = originalError;
  });

  next();
};

/**
 * Log incoming requests with request ID
 */
export const logRequest = (req, res, next) => {
  const startTime = Date.now();

  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
    });
  });

  next();
};

export default { attachRequestId, logRequest };

