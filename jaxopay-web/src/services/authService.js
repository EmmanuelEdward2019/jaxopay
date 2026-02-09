import apiClient, { handleApiError } from '../lib/apiClient';

const authService = {
  // Sign up with email and password
  signup: async (email, password, userData = {}) => {
    try {
      const response = await apiClient.post('/auth/signup', {
        email,
        password,
        ...userData,
      });
      // apiClient returns { success, message, data } - we need response.data for the payload
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Login with email and password
  login: async (email, password) => {
    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });
      // apiClient returns { success, message, data } - we need response.data for the payload
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Login with phone (request OTP)
  loginWithPhone: async (phone) => {
    try {
      const response = await apiClient.post('/auth/login/phone', {
        phone,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Verify OTP
  verifyOTP: async (otp, phone, userId) => {
    try {
      const payload = { otp };
      if (phone) payload.phone = phone;
      if (userId) payload.userId = userId;

      const response = await apiClient.post('/auth/verify-otp', payload);
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Logout
  logout: async () => {
    try {
      const response = await apiClient.post('/auth/logout');
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Refresh token
  refreshToken: async (refreshToken) => {
    try {
      const response = await apiClient.post('/auth/refresh-token', {
        refresh_token: refreshToken,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Request password reset
  requestPasswordReset: async (email) => {
    try {
      const response = await apiClient.post('/auth/forgot-password', {
        email,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Reset password
  resetPassword: async (token, newPassword) => {
    try {
      const response = await apiClient.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Verify email
  verifyEmail: async (token) => {
    try {
      const response = await apiClient.post('/auth/verify-email', {
        token,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Change password
  changePassword: async (currentPassword, newPassword) => {
    try {
      const response = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Get active sessions
  getSessions: async () => {
    try {
      const response = await apiClient.get('/auth/sessions');
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Terminate a specific session
  terminateSession: async (sessionId) => {
    try {
      const response = await apiClient.delete(`/auth/sessions/${sessionId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Logout all other sessions
  logoutAll: async () => {
    try {
      const response = await apiClient.delete('/auth/sessions');
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Enable 2FA
  enable2FA: async (method) => {
    try {
      const response = await apiClient.post('/auth/2fa/enable', {
        method,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Verify 2FA
  verify2FA: async (code, method) => {
    try {
      const response = await apiClient.post('/auth/2fa/verify', {
        code,
        method,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },

  // Disable 2FA
  disable2FA: async (password) => {
    try {
      const response = await apiClient.post('/auth/2fa/disable', {
        password,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export default authService;

