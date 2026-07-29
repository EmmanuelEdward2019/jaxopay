import apiClient from '../lib/apiClient';

const userService = {
  // Get user profile
  getProfile: async () => {
    try {
      const response = await apiClient.get('/users/profile');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update user profile
  updateProfile: async (profileData) => {
    try {
      const response = await apiClient.patch('/users/profile', profileData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Upload avatar
  uploadAvatar: async (file) => {
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await apiClient.post('/users/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get user statistics
  getStatistics: async () => {
    try {
      const response = await apiClient.get('/users/statistics');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get activity logs
  getActivityLogs: async (params = {}) => {
    try {
      const response = await apiClient.get('/users/activity', {
        params,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Search users (for transfers)
  searchUsers: async (query) => {
    try {
      const response = await apiClient.get('/users/search', {
        params: { query },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Request account deletion (pending super_admin approval — does not delete immediately)
  requestAccountDeletion: async (password, reason) => {
    try {
      const response = await apiClient.post('/users/account/delete-request', { password, reason });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Check the caller's own deletion request status
  getAccountDeletionStatus: async () => {
    try {
      const response = await apiClient.get('/users/account/deletion-status');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update user settings
  updateSettings: async (settings) => {
    try {
      const response = await apiClient.patch('/users/settings', settings);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Username: check availability
  checkUsername: async (username) => {
    try {
      const response = await apiClient.get('/users/username/check', { params: { username } });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Username: set/change the caller's own
  setUsername: async (username) => {
    try {
      const response = await apiClient.patch('/users/username', { username });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default userService;

