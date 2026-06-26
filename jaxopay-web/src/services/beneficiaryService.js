import apiClient from '../lib/apiClient';

// type: bank_account | airtime | data | cable | electricity | crypto
const beneficiaryService = {
    list: async (type) => {
        try {
            const response = await apiClient.get('/beneficiaries', { params: type ? { type } : {} });
            return { success: true, data: response.data || [] };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    },

    create: async (beneficiary) => {
        try {
            const response = await apiClient.post('/beneficiaries', beneficiary);
            return { success: true, message: response.message, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    remove: async (id) => {
        try {
            const response = await apiClient.delete(`/beneficiaries/${id}`);
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
};

export default beneficiaryService;
