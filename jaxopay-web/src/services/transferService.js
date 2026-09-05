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
    // Withdrawal fee + what the recipient receives. Read from the server so the figure shown can
    // never drift from what's actually charged when an admin changes the fee.
    getWithdrawalQuote: async (currency, amount) => {
        try {
            const response = await apiClient.get('/transfers/withdrawal-quote', {
                params: amount ? { currency, amount } : { currency },
            });
            return { success: true, data: response.data ?? response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    sendTransfer: async (payload) => {
        try {
            const response = await apiClient.post('/transfers/send', payload);
            return { success: true, data: response.data ?? response };
        } catch (error) {
            return { success: false, error: error.message || 'Transfer failed', code: error.code };
        }
    },

    // Poll Korapay to reconcile a processing transfer's status
    verifyTransfer: async (reference) => {
        try {
            const response = await apiClient.post('/transfers/verify', { reference });
            return { success: true, data: response.data ?? response };
        } catch (error) {
            return { success: false, error: error.message || 'Could not check transfer status' };
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
