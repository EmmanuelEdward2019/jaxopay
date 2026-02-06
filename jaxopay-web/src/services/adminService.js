import apiClient from '../lib/apiClient';

const adminService = {
    // Get system statistics
    getStats: async () => {
        try {
            const response = await apiClient.get('/admin/stats');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get all users
    getUsers: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/users', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get single user
    getUser: async (userId) => {
        try {
            const response = await apiClient.get(`/admin/users/${userId}`);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Update user
    updateUser: async (userId, userData) => {
        try {
            const response = await apiClient.patch(`/admin/users/${userId}`, userData);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Suspend user
    suspendUser: async (userId, reason) => {
        try {
            const response = await apiClient.post(`/admin/users/${userId}/suspend`, { reason });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get pending KYC documents
    getPendingKYC: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/kyc/pending', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Verify KYC document
    verifyKYCDocument: async (documentId, status, rejectionReason) => {
        try {
            const response = await apiClient.patch(`/admin/kyc/${documentId}/verify`, {
                status,
                rejection_reason: rejectionReason,
            });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get all transactions (using existing transaction endpoint with admin filter)
    getTransactions: async (params = {}) => {
        try {
            const response = await apiClient.get('/transactions', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
};

export default adminService;
