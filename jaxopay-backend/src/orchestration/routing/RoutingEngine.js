import providerRegistry from '../registry/ProviderRegistry.js';
import { query } from '../../config/database.js';

class RoutingEngine {
    /**
     * Selects the best provider for a given request.
     */
    async selectProvider({ serviceType, country, amount, currency, priority = 'balanced' }) {
        // 1. Fetch routing rules from database (cached or dynamic)
        const rules = await this._getRoutingRules(serviceType, country);

        // 2. Filter available providers based on rules and health
        const candidates = await this._filterAndRankProviders(rules, { amount, currency, priority });

        if (candidates.length === 0) {
            throw new Error(`No available providers for \${serviceType} in \${country}`);
        }

        return candidates[0]; // Return the primary provider instance
    }

    async _getRoutingRules(serviceType, country) {
        // This could query a 'routing_rules' table. 
        // Fallback to feature_toggles or a hardcoded priority for now.
        const res = await query(
            'SELECT config FROM feature_toggles WHERE feature_name = $1',
            [serviceType]
        );

        const config = res.rows[0]?.config || {};
        // Example config: { "routing": { "NG": ["korapay", "paystack"], "DEFAULT": ["wise"] } }
        return config.routing?.[country] || config.routing?.['DEFAULT'] || [];
    }

    async _filterAndRankProviders(providerIds, { amount, currency, priority }) {
        const validProviders = [];

        for (const id of providerIds) {
            const adapter = providerRegistry.getAdapter(null, id); // Need to decide how to handle serviceType mapping
            if (!adapter) continue;

            const health = providerRegistry.getProviderHealth(id);
            if (health?.status !== 'healthy') continue;

            // Check adapter capabilities (e.g. min/max amount, currency support)
            // For now, just add if healthy
            validProviders.push(adapter);
        }

        return validProviders;
    }
}

export default new RoutingEngine();
