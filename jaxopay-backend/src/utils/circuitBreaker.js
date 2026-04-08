import logger from './logger.js';

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures when external services are down
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
    this.name = options.name || 'CircuitBreaker';

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;

    // Statistics
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
    };
  }

  async execute(operation, ...args) {
    this.stats.totalCalls++;

    // Check if circuit is OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        logger.info(`[${this.name}] Circuit entering HALF_OPEN state`);
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        this.successCount = 0;
      } else {
        this.stats.rejectedCalls++;
        throw new Error(`Circuit breaker is OPEN for ${this.name}. Service temporarily unavailable.`);
      }
    }

    // Check half-open call limit
    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.halfOpenMaxCalls) {
      this.stats.rejectedCalls++;
      throw new Error(`Circuit breaker is HALF_OPEN for ${this.name}. Call limit reached.`);
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
    }

    try {
      const result = await operation(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      // Only count 5xx/network errors as circuit-breaker failures.
      // 4xx errors (400, 401, 403, 404, 422…) are client-side problems
      // (bad credentials, bad request) — NOT indicators that the service is down.
      const statusCode = error.statusCode || error.status || error.response?.status;
      if (!statusCode || statusCode >= 500) {
        this.onFailure();
      } else {
        // Still track the failed call in stats, but don't trip the breaker.
        this.stats.failedCalls++;
      }
      throw error;
    }
  }

  onSuccess() {
    this.stats.successfulCalls++;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxCalls) {
        logger.info(`[${this.name}] Circuit CLOSED (recovered)`);
        this.reset();
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  onFailure() {
    this.stats.failedCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      logger.warn(`[${this.name}] Circuit OPENED (failure in HALF_OPEN)`);
      this.state = 'OPEN';
    } else if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      logger.warn(`[${this.name}] Circuit OPENED (failure threshold reached: ${this.failureCount})`);
      this.state = 'OPEN';
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      stats: this.stats,
    };
  }
}

// Create circuit breakers for different services
export const circuitBreakers = {
  quidax: new CircuitBreaker({
    name: 'QuidaxAPI',
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenMaxCalls: 3,
  }),
  korapay: new CircuitBreaker({
    name: 'KorapayAPI',
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenMaxCalls: 3,
  }),
  strowallet: new CircuitBreaker({
    name: 'StrowalletAPI',
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenMaxCalls: 2,
  }),
  smileIdentity: new CircuitBreaker({
    name: 'SmileIdentityAPI',
    failureThreshold: 3,
    resetTimeout: 60000,
    halfOpenMaxCalls: 2,
  }),
};

export default CircuitBreaker;
