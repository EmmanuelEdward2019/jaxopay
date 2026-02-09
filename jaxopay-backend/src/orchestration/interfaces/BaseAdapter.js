/**
 * Base class for all provider adapters.
 * Ensures a consistent interface across different API providers.
 */
class BaseAdapter {
    constructor(config = {}) {
        this.config = config;
        this.name = 'BaseAdapter';
    }

    /**
     * Check provider health status.
     * @returns {Promise<Boolean>}
     */
    async checkHealth() {
        throw new Error('Method not implemented: checkHealth');
    }

    /**
     * Normalize errors from provider-specific to internal formats.
     * @param {Error} error 
     */
    handleProviderError(error) {
        throw new Error('Method not implemented: handleProviderError');
    }
}

export default BaseAdapter;
