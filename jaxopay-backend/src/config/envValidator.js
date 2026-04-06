import logger from '../utils/logger.js';

/**
 * Environment Variable Validator
 * Ensures critical environment variables are set and valid before server starts
 */

const REQUIRED_VARS = {
  // Core Server
  NODE_ENV: { required: true, values: ['development', 'production', 'test'] },
  PORT: { required: false, type: 'number' },
  API_VERSION: { required: false },

  // Database
  DATABASE_URL: { required: false }, // Either this or individual DB vars
  DB_HOST: { required: false },
  DB_NAME: { required: false },
  DB_USER: { required: false },
  DB_PASSWORD: { required: false },

  // Security - CRITICAL
  JWT_SECRET: { required: true, minLength: 32 },
  JWT_REFRESH_SECRET: { required: true, minLength: 32 },
  ENCRYPTION_KEY: { required: true, length: 32 },

  // CORS
  ALLOWED_ORIGINS: { required: true },
};

const PLACEHOLDER_PATTERNS = [
  /your_?/i,
  /placeholder/i,
  /change[-_]?this/i,
  /example/i,
  /test[-_]?key/i,
  /demo/i,
];

/**
 * Check if value looks like a placeholder
 */
function isPlaceholder(value) {
  if (!value) return false;
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(String(value)));
}

/**
 * Validate environment variables
 */
export function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // Check NODE_ENV
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push(`Invalid NODE_ENV: ${nodeEnv}. Must be development, production, or test.`);
  }

  // Check database configuration
  const hasDbUrl = process.env.DATABASE_URL && !isPlaceholder(process.env.DATABASE_URL);
  const hasDbConfig = process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER;

  if (!hasDbUrl && !hasDbConfig) {
    errors.push('Database not configured. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD');
  }

  // Check JWT secrets
  if (!process.env.JWT_SECRET || isPlaceholder(process.env.JWT_SECRET)) {
    errors.push('JWT_SECRET is missing or contains placeholder value');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  if (!process.env.JWT_REFRESH_SECRET || isPlaceholder(process.env.JWT_REFRESH_SECRET)) {
    errors.push('JWT_REFRESH_SECRET is missing or contains placeholder value');
  } else if (process.env.JWT_REFRESH_SECRET.length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  // Check encryption key
  if (!process.env.ENCRYPTION_KEY || isPlaceholder(process.env.ENCRYPTION_KEY)) {
    errors.push('ENCRYPTION_KEY is missing or contains placeholder value');
  } else if (process.env.ENCRYPTION_KEY.length !== 32) {
    errors.push('ENCRYPTION_KEY must be exactly 32 characters long');
  }

  // Check CORS in production
  if (nodeEnv === 'production') {
    if (!process.env.ALLOWED_ORIGINS || isPlaceholder(process.env.ALLOWED_ORIGINS)) {
      errors.push('ALLOWED_ORIGINS must be set in production');
    }
  }

  // Warnings for optional but recommended services
  if (!process.env.RESEND_API_KEY || isPlaceholder(process.env.RESEND_API_KEY)) {
    warnings.push('RESEND_API_KEY not configured - email notifications will fail');
  }

  if (!process.env.TWILIO_ACCOUNT_SID || isPlaceholder(process.env.TWILIO_ACCOUNT_SID)) {
    warnings.push('Twilio not configured - SMS/OTP will be unavailable');
  }

  // Check webhook secrets in production
  if (nodeEnv === 'production') {
    const webhookSecrets = ['KORAPAY_SECRET_KEY', 'GRAPH_WEBHOOK_SECRET'];
    webhookSecrets.forEach(secret => {
      if (!process.env[secret] || isPlaceholder(process.env[secret])) {
        warnings.push(`${secret} not set - webhook verification will fail`);
      }
    });
  }

  return { errors, warnings, isValid: errors.length === 0 };
}

/**
 * Log validation results and exit if critical errors found
 */
export function enforceEnvironmentValidation() {
  const { errors, warnings, isValid } = validateEnvironment();

  if (warnings.length > 0) {
    logger.warn('⚠️  Environment Configuration Warnings:');
    warnings.forEach(warning => logger.warn(`   - ${warning}`));
  }

  if (!isValid) {
    logger.error('❌ Environment Configuration Errors:');
    errors.forEach(error => logger.error(`   - ${error}`));
    logger.error('\n💡 Please check your .env file and fix the errors above before starting the server.\n');
    
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      logger.warn('⚠️  Continuing in development mode despite errors...\n');
    }
  } else {
    logger.info('✅ Environment validation passed');
  }

  return isValid;
}

export default { validateEnvironment, enforceEnvironmentValidation };

