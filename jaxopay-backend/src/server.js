import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { attachRequestId, logRequest } from './middleware/requestId.js';
import routes from './routes/index.js';
import { connectDatabase, checkDatabaseHealth, closeDatabaseConnections } from './config/database.js';
import { enforceEnvironmentValidation } from './config/envValidator.js';

// Load environment variables
dotenv.config();

// Validate environment variables before starting
enforceEnvironmentValidation();

const app = express();
const server = createServer(app);

// Environment variables
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_VERSION = process.env.API_VERSION || 'v1';

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Compression middleware (gzip responses)
app.use(compression({
  level: 6, // Default compression level (balance between speed and compression)
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      // don't compress responses with this request header
      return false;
    }
    // fallback to standard filter function
    return compression.filter(req, res);
  }
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['https://jaxopay.com'];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint', 'X-Request-ID', 'X-2FA-Token'],
};

app.use(cors(corsOptions));

// Request ID tracking (must be first)
app.use(attachRequestId);

// Cookie parsing middleware
app.use(cookieParser());

// Body parsing middleware
// Large limit for Smile ID biometric payloads (selfie + liveness + ID images as base64)
//
// IMPORTANT: The `verify` callback captures the raw HTTP body bytes for webhook routes
// BEFORE Express converts them to a JS object. Webhook HMAC signatures (Quidax, Korapay,
// etc.) are computed over the original raw bytes. If we sign JSON.stringify(req.body)
// instead, any whitespace or key-order difference causes an HMAC mismatch → rejected webhooks
// → deposits/payouts never credited. rawBody is attached to req for the webhook verifier.
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    if (req.path && req.path.includes('/webhooks/')) {
      req.rawBody = buf.toString('utf8');
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging (after parsing)
app.use(logRequest);

// Standard logging middleware
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Rate limiting
app.use(rateLimiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const statusCode = dbHealth.healthy ? 200 : 503;

  res.status(statusCode).json({
    status: dbHealth.healthy ? 'ok' : 'degraded',
    service: 'jaxopay-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: API_VERSION,
    database: dbHealth,
  });
});


// API routes
app.use(`/api/${API_VERSION}`, routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Database connection and server startup
const startServer = async () => {
  try {
    // Start server first so health checks pass
    server.listen(PORT, () => {
      // Node 18+ defaults requestTimeout to 5m — large KYC payloads (base64 images) need longer
      server.requestTimeout = 600000;
      server.headersTimeout = 610000;
      server.keepAliveTimeout = 65000;
      logger.info(`🚀 JAXOPAY API Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${NODE_ENV}`);
      logger.info(`🔗 API Base URL: http://localhost:${PORT}/api/${API_VERSION}`);
      logger.info(`💚 Health check: http://localhost:${PORT}/health`);
    });

    // Try to connect to database (asynchronous)
    connectDatabase()
      .then(() => logger.info('✅ Database connected successfully'))
      .catch((dbError) => {
        logger.warn('⚠️  Database connection failed - server running without database');
        logger.warn('Database error:', dbError.message);
        logger.warn('API endpoints will return errors until database is configured');
      });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close database connections properly
      await closeDatabaseConnections();
      logger.info('Database connections closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 25 seconds (allowing for transaction completion)
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 25000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Log unhandled promise rejections but do NOT shut down the server.
// Rejected promises from background polling (e.g. ticker refresh, circuit breakers)
// are non-fatal — killing the process would drop all in-flight requests including
// CORS preflight OPTIONS responses, which the browser then mis-reports as CORS errors.
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Intentionally not calling gracefulShutdown here.
});

// Start the server
startServer();

export default app;

