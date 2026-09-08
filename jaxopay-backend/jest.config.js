/**
 * Jest Configuration for JAXOPAY Backend
 */

export default {
  // Use ES modules
  preset: null,
  testEnvironment: 'node',
  
  // Transform ES modules
  transform: {},
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!src/server.js',
    '!src/config/database.js'
  ],
  
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  
  // Coverage directory
  coverageDirectory: 'coverage',
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Test timeout.
  // 10s was a coin flip: the Quidax webhook tests deliberately exercise apiClient's retry path,
  // which sleeps 1s + 2s + 3s between attempts by design (see utils/apiClient.js). That is ~6s of
  // intentional waiting before the assertion even runs, so under parallel worker load those suites
  // intermittently blew the limit and failed for timing reasons alone, not behaviour.
  testTimeout: 30000,
  
  // Module paths
  moduleDirectories: ['node_modules', 'src'],
  
  // Verbose output
  verbose: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Force exit after tests
  forceExit: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Reset mocks between tests
  resetMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true
};
