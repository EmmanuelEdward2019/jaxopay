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
    // Create user
    createUser: async (userData) => {
        try {
            const response = await apiClient.post('/admin/users', userData);
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

    getApprovedKYC: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/kyc/approved', { params });
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

    // Get all transactions (ADMIN ONLY)
    getTransactions: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/transactions', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get all feature toggles
    getFeatureToggles: async () => {
        try {
            const response = await apiClient.get('/admin/toggles');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Update feature toggle
    updateFeatureToggle: async (featureId, toggleData) => {
        try {
            const response = await apiClient.patch(`/admin/toggles/${featureId}`, toggleData);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get high risk users
    getHighRiskUsers: async () => {
        try {
            const response = await apiClient.get('/admin/aml/high-risk');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Refresh user risk score
    refreshUserRiskScore: async (userId) => {
        try {
            const response = await apiClient.post(`/admin/users/${userId}/aml-refresh`);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Get admin audit logs
    getAuditLogs: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/audit-logs', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // FX Management
    getExchangeRates: async () => {
        try {
            const response = await apiClient.get('/admin/fx/rates');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    createExchangeRate: async (data) => {
        try {
            const response = await apiClient.post('/admin/fx/rates', data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    updateExchangeRate: async (rateId, data) => {
        try {
            const response = await apiClient.patch(`/admin/fx/rates/${rateId}`, data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Fee Management
    getFeeConfigs: async () => {
        try {
            const response = await apiClient.get('/admin/fees/configs');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    createFeeConfig: async (data) => {
        try {
            const response = await apiClient.post('/admin/fees/configs', data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    updateFeeConfig: async (feeId, data) => {
        try {
            const response = await apiClient.patch(`/admin/fees/configs/${feeId}`, data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // System Control
    toggleEmergencyShutdown: async (isShutdown) => {
        try {
            const response = await apiClient.post('/admin/system/shutdown', { is_shutdown: isShutdown });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Manual Overrides
    processRefund: async (transactionId, reason) => {
        try {
            const response = await apiClient.post(`/admin/transactions/${transactionId}/refund`, { reason });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Compliance Reporting
    getComplianceStats: async () => {
        try {
            const response = await apiClient.get('/admin/compliance/stats');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Global Wallet Management
    getAllWallets: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/wallets', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    updateWalletStatus: async (walletId, status) => {
        try {
            const response = await apiClient.patch(`/admin/wallets/${walletId}`, { status });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Global Card Management
    getAllCards: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/cards', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    updateCardStatus: async (cardId, status) => {
        try {
            const response = await apiClient.patch(`/admin/cards/${cardId}/status`, { status });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Bulk SMS
    sendBulkSMS: async (data) => {
        try {
            const response = await apiClient.post('/admin/sms/bulk', data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // User Feature Access
    getUserFeatures: async (userId) => {
        try {
            const response = await apiClient.get(`/admin/users/${userId}/features`);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    updateUserFeature: async (userId, featureData) => {
        try {
            const response = await apiClient.patch(`/admin/users/${userId}/features`, featureData);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Orchestration Status
    getOrchestrationStatus: async () => {
        try {
            const response = await apiClient.get('/admin/system/orchestration');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Treasury / reconciliation overview (provider floats vs user liabilities)
    getTreasury: async () => {
        try {
            const response = await apiClient.get('/admin/treasury');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Fund movements — internal double-entry ledger
    getFundMovements: async (params = {}) => {
        try {
            const response = await apiClient.get('/admin/ledger', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Send email / dashboard notification to selected users
    sendMessage: async ({ user_ids, all_users, channels, subject, message }) => {
        try {
            const response = await apiClient.post('/admin/messages', { user_ids, all_users, channels, subject, message });
            return { success: response?.success !== false, data: response.data, message: response?.message };
        } catch (error) {
            return { success: false, error: error?.response?.data?.message || error.message };
        }
    },

    // Crypto ramp settlement queue (manual ops)
    getRamps: async (status = 'PENDING') => {
        try {
            const response = await apiClient.get('/admin/ramps', { params: { status } });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    confirmRamp: async (id) => {
        try {
            const response = await apiClient.post(`/admin/ramps/${id}/confirm`);
            return { success: response?.success !== false, data: response.data, message: response?.message };
        } catch (error) {
            return { success: false, error: error?.response?.data?.message || error.message };
        }
    },
    failRamp: async (id, reason) => {
        try {
            const response = await apiClient.post(`/admin/ramps/${id}/fail`, { reason });
            return { success: response?.success !== false, data: response.data, message: response?.message };
        } catch (error) {
            return { success: false, error: error?.response?.data?.message || error.message };
        }
    }
};

export default adminService;
