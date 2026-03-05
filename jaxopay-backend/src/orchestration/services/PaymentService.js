import logger from '../../utils/logger.js';
import KorapayAdapter from '../adapters/payments/KorapayAdapter.js';
import GraphAdapter from '../adapters/cards/GraphAdapter.js';
import VTpassAdapter from '../adapters/utilities/VTpassAdapter.js';

/**
 * Unified Payment Service
 *
 * Provides a single interface across all providers:
 *   pay()         — Accept a payment (Korapay checkout, VTpass bill, etc.)
 *   checkStatus() — Query transaction status by reference
 *   payout()      — Disburse to a bank/mobile account
 *   balance()     — Check merchant balance (Korapay)
 *
 * Usage:
 *   import paymentService from './orchestration/services/PaymentService.js';
 *   const result = await paymentService.pay({ provider: 'korapay', amount: 5000, ... });
 */

const korapay = new KorapayAdapter();
const graph = new GraphAdapter();
const vtpass = new VTpassAdapter();

const adapters = {
    korapay,
    graph,
    graphfinance: graph,
    vtpass,
};

function getAdapter(provider) {
    const adapter = adapters[provider?.toLowerCase()];
    if (!adapter) {
        throw { message: `Unknown provider: ${provider}`, statusCode: 400 };
    }
    return adapter;
}

const PaymentService = {
    /**
     * Accept a payment / initiate a charge
     * @param {Object} opts
     * @param {string} opts.provider - 'korapay' | 'vtpass'
     * @param {number} opts.amount
     * @param {string} opts.currency
     * @param {string} opts.reference
     * @param {Object} opts.customer - { name, email }
     * @param {Object} opts.metadata - provider-specific extras
     */
    async pay({ provider, amount, currency, reference, customer, metadata = {} }) {
        logger.info(`[PaymentService] pay() via ${provider}: ${amount} ${currency} ref=${reference}`);
        const adapter = getAdapter(provider);

        try {
            if (provider === 'korapay') {
                return await adapter.initializeCharge({
                    amount,
                    currency,
                    reference,
                    customer,
                    redirectUrl: metadata.redirectUrl,
                    notificationUrl: metadata.notificationUrl,
                });
            }

            if (provider === 'vtpass') {
                return await adapter.execute({
                    request_id: reference,
                    serviceID: metadata.serviceID,
                    billersCode: metadata.billersCode,
                    variation_code: metadata.variation_code,
                    amount,
                    phone: metadata.phone,
                });
            }

            // Fallback: generic execute
            return await adapter.execute({
                amount,
                currency,
                metadata: { reference, customer, ...metadata },
            });
        } catch (err) {
            logger.error(`[PaymentService] pay() failed via ${provider}:`, err.message || err);
            throw err;
        }
    },

    /**
     * Query transaction status
     * @param {string} provider - 'korapay' | 'vtpass'
     * @param {string} reference - The transaction reference / request_id
     */
    async checkStatus({ provider, reference }) {
        logger.info(`[PaymentService] checkStatus() via ${provider}: ref=${reference}`);
        const adapter = getAdapter(provider);

        try {
            return await adapter.status(reference);
        } catch (err) {
            logger.error(`[PaymentService] checkStatus() failed:`, err.message || err);
            throw err;
        }
    },

    /**
     * Disburse / Payout to a bank account
     * @param {Object} opts
     * @param {string} opts.provider - 'korapay'
     * @param {number} opts.amount
     * @param {string} opts.currency
     * @param {string} opts.reference
     * @param {Object} opts.accountDetails - { bankCode, accountNumber, accountName }
     * @param {string} opts.narration
     * @param {string} opts.customerEmail
     */
    async payout({ provider, amount, currency, reference, accountDetails, narration, customerEmail }) {
        logger.info(`[PaymentService] payout() via ${provider}: ${amount} ${currency} → ${accountDetails?.accountNumber}`);
        const adapter = getAdapter(provider);

        try {
            if (adapter.disburse) {
                return await adapter.disburse({
                    reference,
                    amount,
                    currency,
                    bankCode: accountDetails.bankCode,
                    accountNumber: accountDetails.accountNumber,
                    accountName: accountDetails.accountName,
                    narration,
                    customerEmail,
                });
            }

            // Fallback: generic execute with payout type
            return await adapter.execute({
                amount,
                currency,
                type: 'payout',
                metadata: {
                    reference,
                    destination: accountDetails,
                    narration,
                },
            });
        } catch (err) {
            logger.error(`[PaymentService] payout() failed via ${provider}:`, err.message || err);
            throw err;
        }
    },

    /**
     * Check merchant balance
     * @param {string} provider - 'korapay'
     */
    async balance(provider = 'korapay') {
        logger.info(`[PaymentService] balance() via ${provider}`);
        const adapter = getAdapter(provider);

        if (!adapter.getBalances) {
            throw { message: `Balance check not supported by ${provider}`, statusCode: 400 };
        }

        try {
            return await adapter.getBalances();
        } catch (err) {
            logger.error(`[PaymentService] balance() failed:`, err.message || err);
            throw err;
        }
    },

    /**
     * Health check for a specific provider
     */
    async healthCheck(provider) {
        const adapter = getAdapter(provider);
        return await adapter.checkHealth();
    },
};

export default PaymentService;
