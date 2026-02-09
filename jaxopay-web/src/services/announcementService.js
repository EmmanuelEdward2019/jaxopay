import apiClient from '../lib/apiClient';

const announcementService = {
    getActiveAnnouncements: async () => {
        try {
            const response = await apiClient.get('/announcements/active');
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Admin
    createAnnouncement: async (announcementData) => {
        try {
            const response = await apiClient.post('/announcements', announcementData);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    deactivateAnnouncement: async (id) => {
        try {
            const response = await apiClient.patch(`/announcements/${id}/deactivate`);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

export default announcementService;
