/**
 * Jest Test Setup
 * Runs before all tests
 */

import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Disable environment validation in tests
process.env.SKIP_ENV_VALIDATION = 'true';

// Mock secrets for testing
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_purposes_only_minimum_64_characters';
}

if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_for_testing_purposes_only_minimum_64_chars';
}

if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'test_encryption_key_32_chars!!';
}

// Mock webhook secrets
process.env.KORAPAY_SECRET_KEY = 'test_korapay_secret';
process.env.QUIDAX_WEBHOOK_SECRET = 'test_quidax_secret';
process.env.GRAPH_WEBHOOK_SECRET = 'test_graph_secret';
process.env.VTPASS_SECRET_KEY = 'test_vtpass_secret';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
  generateRandomEmail: () => `test${Date.now()}@example.com`,
  generateRandomString: (length = 10) => Math.random().toString(36).substring(2, length + 2),
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

console.log('✅ Test environment initialized');

