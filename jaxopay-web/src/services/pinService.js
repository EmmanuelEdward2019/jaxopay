import apiClient from '../lib/apiClient';

const pinService = {
    // Whether the user has set a transaction PIN (+ lock state)
    getStatus: async () => {
        try {
            const response = await apiClient.get('/security/transaction-pin');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Set PIN for the first time (requires account password)
    setPin: async (pin, password) => {
        try {
            const response = await apiClient.post('/security/transaction-pin', { pin, password });
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
        }
    },

    // Change PIN (authorize with current PIN or account password)
    changePin: async ({ current_pin, new_pin, password }) => {
        try {
            const response = await apiClient.patch('/security/transaction-pin', { current_pin, new_pin, password });
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
        }
    },
};

export default pinService;
