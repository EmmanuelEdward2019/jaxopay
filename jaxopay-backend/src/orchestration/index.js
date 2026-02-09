import providerRegistry from './registry/ProviderRegistry.js';
import routingEngine from './routing/RoutingEngine.js';
import failoverManager from './failover/FailoverManager.js';
import ledgerService from './ledger/LedgerService.js';

// Import Adapters
import SafeHavenAdapter from './adapters/payments/SafeHavenAdapter.js';
import KorapayAdapter from './adapters/payments/KorapayAdapter.js';
import StrowalletAdapter from './adapters/cards/StrowalletAdapter.js';
import VTpassAdapter from './adapters/utilities/VTpassAdapter.js';

// Initialize and Register Providers
// In a real app, this would be done via environment configs or dependency injection
const initOrchestration = () => {
    // Payments
    providerRegistry.register('payment', 'safehaven', new SafeHavenAdapter());
    providerRegistry.register('payment', 'korapay', new KorapayAdapter());

    // Cards
    providerRegistry.register('card', 'strowallet', new StrowalletAdapter());

    // Utilities
    providerRegistry.register('utility', 'vtpass', new VTpassAdapter());

    console.log('✅ Orchestration Layer Initialized');
};

/**
 * High-level orchestration facade
 */
class OrchestrationLayer {
    constructor() {
        initOrchestration();
    }

    async executePayment(params) {
        return await failoverManager.executeWithFailover('payment', params, async (adapter) => {
            // 1. Validate internally (ledger, compliance)
            // 2. Call provider
            const result = await adapter.execute(params);

            // 3. Record in Ledger if successful
            if (result.success) {
                await ledgerService.recordMovement({
                    fromWalletId: params.fromWalletId,
                    toWalletId: params.toWalletId, // or platform suspense account
                    amount: params.amount,
                    currency: params.currency,
                    transactionId: result.transactionId,
                    description: params.description
                });
            }

            return result;
        });
    }

    async getUtilityProviders(category) {
        return await failoverManager.executeWithFailover('utility', { category }, async (adapter) => {
            return await adapter.getProviders(category);
        });
    }

    async createCard(params) {
        return await failoverManager.executeWithFailover('card', params, async (adapter) => {
            return await adapter.createCard(params);
        });
    }

    // Add other domain methods...
}

export default new OrchestrationLayer();
export { ledgerService, routingEngine, providerRegistry };
