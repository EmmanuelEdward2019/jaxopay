import logger from './logger.js';

/**
 * Simple in-memory cache with TTL support
 * Can be replaced with Redis in production for distributed caching
 */
class Cache {
  constructor(options = {}) {
    this.ttl = options.defaultTTL || 60 * 1000; // Default 1 minute
    this.checkPeriod = options.checkPeriod || 5 * 60 * 1000; // Cleanup every 5 minutes
    this._store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Get access to store for iteration
   */
  getStore() {
    return this._store;
  }

  /**
   * Generate cache key
   */
  _generateKey(namespace, key) {
    return `${namespace}:${key}`;
  }

  /**
   * Get item from cache
   */
  get(namespace, key) {
    const fullKey = this._generateKey(namespace, key);
    const item = this._store.get(fullKey);

    if (!item) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this._store.delete(fullKey);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.value;
  }

  /**
   * Set item in cache
   */
  set(namespace, key, value, ttl = null) {
    const fullKey = this._generateKey(namespace, key);
    const expiry = Date.now() + (ttl || this.ttl);

    this._store.set(fullKey, { value, expiry });
    this.stats.sets++;
  }

  /**
   * Delete item from cache
   */
  delete(namespace, key) {
    const fullKey = this._generateKey(namespace, key);
    const deleted = this._store.delete(fullKey);
    if (deleted) this.stats.deletes++;
    return deleted;
  }

  /**
   * Clear all items in a namespace
   */
  clearNamespace(namespace) {
    const prefix = `${namespace}:`;
    let count = 0;

    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        count++;
      }
    }

    this.stats.deletes += count;
    logger.info(`[Cache] Cleared ${count} items from namespace: ${namespace}`);
    return count;
  }

  /**
   * Clear all cache
   */
  clear() {
    const size = this._store.size;
    this._store.clear();
    logger.info(`[Cache] Cleared all ${size} items`);
    return size;
  }

  /**
   * Get or set cache value (with async factory)
   */
  async getOrSet(namespace, key, factory, ttl = null) {
    const cached = this.get(namespace, key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(namespace, key, value, ttl);
    return value;
  }

  /**
   * Clean up expired items
   */
  cleanup() {
    const now = Date.now();
    let expired = 0;

    for (const [key, item] of this._store.entries()) {
      if (now > item.expiry) {
        this._store.delete(key);
        expired++;
      }
    }

    if (expired > 0) {
      logger.debug(`[Cache] Cleaned up ${expired} expired items`);
    }

    return expired;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.checkPeriod);
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      size: this._store.size,
      ...this.stats,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };
  }
}

// Create singleton instance
const cache = new Cache({
  defaultTTL: 60 * 1000, // 1 minute
  checkPeriod: 5 * 60 * 1000, // 5 minutes
});

// Predefined namespaces for different data types
export const CacheNamespaces = {
  CRYPTO_RATES: 'crypto:rates',
  CRYPTO_MARKETS: 'crypto:markets',
  CRYPTO_TICKER: 'crypto:ticker',
  USER_SESSIONS: 'user:sessions',
  USER_PROFILES: 'user:profiles',
  WALLET_BALANCES: 'wallet:balances',
  FX_RATES: 'fx:rates',
  BILL_PROVIDERS: 'bill:providers',
  CARD_CONFIG: 'card:config',
};

// Predefined TTLs for different data types (in milliseconds)
export const CacheTTL = {
  VERY_SHORT: 5 * 1000,       // 5 seconds - order books
  SHORT: 30 * 1000,           // 30 seconds - crypto prices
  MEDIUM: 60 * 1000,          // 1 minute - user data
  LONG: 5 * 60 * 1000,        // 5 minutes - config data
  VERY_LONG: 60 * 60 * 1000,  // 1 hour - static data
};

export { Cache };
export default cache;
