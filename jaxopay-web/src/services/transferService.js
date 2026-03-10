import apiClient from '../lib/apiClient';

const transferService = {
    // List all available banks
    getBanks: async (currency = 'NGN') => {
        try {
            const response = await apiClient.get('/transfers/banks', { params: { currency } });
            return { success: true, data: response.data ?? response };
        } catch (error) {
            return { success: false, error: error.message || 'Failed to fetch banks' };
        }
    },

    // Resolve account details (get account name)
    resolveAccount: async (bankCode, accountNumber, currency = 'NGN') => {
        try {
            const response = await apiClient.post('/transfers/resolve', {
                bank_code: bankCode,
                account_number: accountNumber,
                currency
            });
            return { success: true, data: response.data ?? response };
        } catch (error) {
            return { success: false, error: error.message || 'Failed to verify account' };
        }
    },

    // Initiate a bank transfer
    sendTransfer: async (payload) => {
        try {
            const response = await apiClient.post('/transfers/send', payload);
            return { success: true, data: response.data ?? response };
        } catch (error) {
            return { success: false, error: error.message || 'Transfer failed' };
        }
    },

    // Get transfer history
    getHistory: async (params = {}) => {
        try {
            const response = await apiClient.get('/transfers/history', { params });
            return { success: true, data: response.data ?? response };
        } catch (error) {
            return { success: false, error: error.message || 'Failed to fetch history' };
        }
    }
};

export default transferService;
