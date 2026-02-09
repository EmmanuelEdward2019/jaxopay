import apiClient from '../lib/apiClient';

const notificationService = {
    getNotifications: async (params = {}) => {
        try {
            const response = await apiClient.get('/notifications', { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    getUnreadCount: async () => {
        try {
            const response = await apiClient.get('/notifications/unread-count');
            return { success: true, count: response.count };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    markAsRead: async (id) => {
        try {
            const response = await apiClient.patch(`/notifications/${id}/read`);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    markAllAsRead: async () => {
        try {
            const response = await apiClient.post('/notifications/read-all');
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    deleteNotification: async (id) => {
        try {
            const response = await apiClient.delete(`/notifications/${id}`);
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

export default notificationService;
