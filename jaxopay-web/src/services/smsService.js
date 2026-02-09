import apiClient from '../lib/apiClient';

const smsService = {
    // Send Bulk SMS (User)
    sendBulkSMS: async (data) => {
        try {
            const response = await apiClient.post('/sms/bulk', data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get SMS History
    getSMSHistory: async (params = {}) => {
        try {
            const response = await apiClient.get('/sms/history', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get SMS Pricing/Estimator
    getEstimator: async (data) => {
        try {
            const response = await apiClient.post('/sms/estimate', data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

export default smsService;
