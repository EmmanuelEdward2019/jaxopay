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

    // Set PIN for the first time (just needs to be logged in)
    setPin: async (pin) => {
        try {
            const response = await apiClient.post('/security/transaction-pin', { pin });
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
        }
    },

    // Change PIN (authorize with the current PIN)
    changePin: async ({ current_pin, new_pin }) => {
        try {
            const response = await apiClient.patch('/security/transaction-pin', { current_pin, new_pin });
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
        }
    },
};

export default pinService;
