import logger from '../../utils/logger.js';
import providerRegistry from '../registry/ProviderRegistry.js';

class FailoverManager {
    /**
     * Executes a provider call with automatic failover support.
     */
    async executeWithFailover(serviceType, context, operation) {
        const providers = providerRegistry.getProvidersForService(serviceType);
        let lastError = null;

        for (const providerId of providers) {
            const adapter = providerRegistry.getAdapter(serviceType, providerId);
            const health = providerRegistry.getProviderHealth(providerId);

            if (health?.status === 'suspended') continue;

            try {
                logger.info(`Attempting operation with provider: ${providerId}`);
                const result = await operation(adapter);

                // Success: Update health metrics
                providerRegistry.updateHealth(providerId, { errorRate: Math.max(0, health.errorRate - 0.1) });
                return result;
            } catch (err) {
                lastError = err;
                logger.error(`Provider ${providerId} failed: ${err.message}`);

                // Update health metrics
                providerRegistry.updateHealth(providerId, {
                    errorRate: (health.errorRate || 0) + 1,
                    status: (health.errorRate > 3) ? 'degraded' : 'healthy'
                });

                // Failover logic: if error is retryable, proceed to next provider
                if (this._isRetryable(err)) {
                    continue;
                } else {
                    throw err; // Non-retryable error
                }
            }
        }

        throw new Error(`All providers for ${serviceType} failed. Last error: ${lastError?.message}`);
    }

    _isRetryable(error) {
        // 5xx errors or network timeouts are retryable. 4xx (bad request/unauthorized) are not.
        const statusCode = error.statusCode || error.response?.status;
        if (!statusCode) return true; // Assume retryable if unknown
        return statusCode >= 500;
    }
}

export default new FailoverManager();
