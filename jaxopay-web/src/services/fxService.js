import apiClient from '../lib/apiClient';

const fxService = {
    /**
     * Get live exchange rates from Graph Finance
     * @param {string} from - Source currency (e.g., NGN)
     * @param {string} to - Target currency (e.g., USD)
     */
    getRates: async (from, to) => {
        try {
            return await apiClient.get(`/fx/rates?from=${from}&to=${to}`);
        } catch (error) {
            console.error('Error fetching FX rates:', error);
            throw error;
        }
    },

    /**
     * Perform a currency swap
     */
    swap: async (fromCurrency, toCurrency, amount) => {
        try {
            return await apiClient.post('/fx/swap', {
                fromCurrency,
                toCurrency,
                amount: parseFloat(amount)
            });
        } catch (error) {
            console.error('Error performing currency swap:', error);
            throw error;
        }
    },

    /**
     * Send an international payment
     */
    sendInternationalPayment: async (payload) => {
        try {
            return await apiClient.post('/fx/transfers/international', payload);
        } catch (error) {
            console.error('Error sending international payment:', error);
            throw error;
        }
    },

    /**
     * Get management wallet balances (Graph)
     */
    getGraphBalances: async () => {
        try {
            return await apiClient.get('/fx/balances');
        } catch (error) {
            console.error('Error fetching Graph balances:', error);
            throw error;
        }
    },

    /**
     * Check status of an FX transaction
     */
    checkStatus: async (transactionId) => {
        try {
            return await apiClient.get(`/fx/transactions/${transactionId}/status`);
        } catch (error) {
            console.error('Error checking FX transaction status:', error);
            throw error;
        }
    }
};

export default fxService;
