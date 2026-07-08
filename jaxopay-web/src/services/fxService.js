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

    /** Supported payout countries (Yellow Card active withdraw channels) */
    getPayoutCountries: async () => {
        try {
            return await apiClient.get('/fx/countries');
        } catch (error) {
            console.error('Error fetching payout countries:', error);
            throw error;
        }
    },

    /** Banks / mobile-money networks for a destination country */
    getPayoutNetworks: async (country) => {
        try {
            return await apiClient.get(`/fx/networks?country=${encodeURIComponent(country)}`);
        } catch (error) {
            console.error('Error fetching payout networks:', error);
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
    },

    // ── Crypto on/off-ramp (Yellow Card) ──

    /** Ramp eligibility for the current user (NG users need a verified BVN/NIN). */
    getRampStatus: async () => {
        try {
            return await apiClient.get('/fx/ramp/status');
        } catch (error) {
            console.error('Error fetching ramp status:', error);
            throw error;
        }
    },

    /** Supported stablecoins + networks for on/off-ramp. */
    getRampOptions: async (currency = 'NGN') => {
        try {
            return await apiClient.get(`/fx/ramp/options?currency=${encodeURIComponent(currency)}`);
        } catch (error) {
            console.error('Error fetching ramp options:', error);
            throw error;
        }
    },

    /** Buy USDT/USDC with fiat (on-ramp). */
    rampDeposit: async (payload) => {
        try {
            return await apiClient.post('/fx/ramp/deposit', payload);
        } catch (error) {
            console.error('Error creating crypto deposit:', error);
            throw error;
        }
    },

    /** Sell USDT/USDC for fiat (off-ramp). */
    rampWithdraw: async (payload) => {
        try {
            return await apiClient.post('/fx/ramp/withdraw', payload);
        } catch (error) {
            console.error('Error creating crypto withdrawal:', error);
            throw error;
        }
    }
};

export default fxService;
