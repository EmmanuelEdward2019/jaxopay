class ProviderRegistry {
    constructor() {
        this.providers = new Map();
        this.healthStatus = new Map(); // { providerId: { status, lastCheck, latency, errorRate } }
    }

    register(serviceType, providerId, adapterInstance) {
        if (!this.providers.has(serviceType)) {
            this.providers.set(serviceType, new Map());
        }
        this.providers.get(serviceType).set(providerId, adapterInstance);

        // Initialize health status
        this.healthStatus.set(providerId, {
            status: 'healthy',
            lastCheck: new Date(),
            latency: 0,
            errorRate: 0
        });
    }

    getAdapter(serviceType, providerId) {
        const serviceProviders = this.providers.get(serviceType);
        if (!serviceProviders) return null;
        return serviceProviders.get(providerId);
    }

    getProvidersForService(serviceType) {
        const serviceProviders = this.providers.get(serviceType);
        return serviceProviders ? Array.from(serviceProviders.keys()) : [];
    }

    updateHealth(providerId, metrics) {
        const current = this.healthStatus.get(providerId) || {};
        this.healthStatus.set(providerId, { ...current, ...metrics, lastCheck: new Date() });
    }

    getProviderHealth(providerId) {
        return this.healthStatus.get(providerId);
    }

    getAll() {
        const result = {};
        for (const [serviceType, serviceProviders] of this.providers.entries()) {
            result[serviceType] = {};
            for (const [providerId, _] of serviceProviders.entries()) {
                result[serviceType][providerId] = {
                    status: 'active'
                };
            }
        }
        return result;
    }
}

export default new ProviderRegistry();
