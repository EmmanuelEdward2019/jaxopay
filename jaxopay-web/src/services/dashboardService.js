import apiClient from '../lib/apiClient';

const dashboardService = {
    // Get dashboard summary - all data in one call
    getSummary: async () => {
        try {
            const response = await apiClient.get('/dashboard/summary');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
};

export default dashboardService;
