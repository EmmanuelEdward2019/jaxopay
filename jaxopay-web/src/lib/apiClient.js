import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const authRaw = localStorage.getItem('jaxopay-auth');
    if (authRaw) {
      try {
        const authData = JSON.parse(authRaw);
        // Zustand persist wraps the state in a 'state' object
        const session = authData.state?.session || authData.session;
        if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`;
        }
      } catch (error) {
        console.error('Error parsing auth data:', error);
      }
    }

    // Add device fingerprint if available
    const deviceFingerprint = localStorage.getItem('device-fingerprint');
    if (deviceFingerprint) {
      config.headers['X-Device-Fingerprint'] = deviceFingerprint;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// User-friendly error messages based on status codes
const getErrorMessage = (status, serverMessage) => {
  // If server provides a clear message, use it
  if (serverMessage && !serverMessage.includes('status code')) {
    return serverMessage;
  }

  const errorMessages = {
    400: 'The information you provided is invalid. Please check and try again.',
    401: 'Your session has expired. Please log in again to continue.',
    403: 'You don\'t have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'This information already exists. Please use different details.',
    422: 'Please check that all fields are filled in correctly.',
    429: 'Too many requests. Please wait a moment and try again.',
    500: 'Something went wrong on our end. Please try again later.',
    502: 'Our servers are temporarily unavailable. Please try again in a few minutes.',
    503: 'Service is temporarily unavailable. Please try again later.',
  };

  return errorMessages[status] || 'Something went wrong. Please try again.';
};

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor - Handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => {
    // Return the data directly for successful responses
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;
    const serverMessage = error.response?.data?.message;
    const status = error.response?.status;

    // Handle 401 Unauthorized - Token expired (Skip for auth endpoints)
    const isAuthRoute = originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/signup') ||
      originalRequest.url?.includes('/auth/reset-password') ||
      originalRequest.url?.includes('/auth/verify-otp');

    if (status === 401 && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        console.log('🔄 Attempting to refresh token...');
        // Try to refresh the token
        const authRaw = localStorage.getItem('jaxopay-auth');
        if (authRaw) {
          const authData = JSON.parse(authRaw);
          const session = authData.state?.session || authData.session;

          if (session?.refresh_token) {
            const response = await axios.post(
              `${API_BASE_URL}/auth/refresh-token`,
              { refresh_token: session.refresh_token },
              { headers: { 'X-Device-Fingerprint': localStorage.getItem('device-fingerprint') || '' } }
            );

            if (response.data.success) {
              const { user, access_token, refresh_token } = response.data.data;
              console.log('✅ Token refreshed successfully');

              const newSession = {
                access_token,
                refresh_token,
                user,
              };

              // Update stored session - preserving Zustand structure
              if (authData.state) {
                authData.state.session = newSession;
                authData.state.user = user;
                authData.state.isAuthenticated = true;
              } else {
                authData.session = newSession;
                authData.user = user;
                authData.isAuthenticated = true;
              }

              localStorage.setItem('jaxopay-auth', JSON.stringify(authData));

              processQueue(null, access_token);
              isRefreshing = false;

              // Retry original request with new token
              originalRequest.headers.Authorization = `Bearer ${access_token}`;
              return apiClient(originalRequest);
            }
          }
        }

        console.warn('❌ Refresh failed or no refresh token found');
        processQueue(new Error('Refresh failed'), null);
        isRefreshing = false;

        // No valid refresh token - redirect to login
        localStorage.removeItem('jaxopay-auth');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject({ message: 'Your session has expired. Please log in again.' });
      } catch (refreshError) {
        console.error('❌ Error during token refresh:', refreshError);
        processQueue(refreshError, null);
        isRefreshing = false;

        // Refresh failed - clear auth and redirect to login
        localStorage.removeItem('jaxopay-auth');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject({ message: 'Your session has expired. Please log in again.' });
      }
    }

    // Get a user-friendly error message
    const friendlyMessage = getErrorMessage(status, serverMessage);


    const errorData = {
      message: friendlyMessage,
      status: status,
      data: error.response?.data,
    };

    return Promise.reject(errorData);
  }
);

// Helper function to handle API errors
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error
    return {
      success: false,
      message: error.response.data?.message || 'Server error occurred',
      status: error.response.status,
      data: error.response.data,
    };
  } else if (error.request) {
    // Request made but no response
    return {
      success: false,
      message: 'No response from server. Please check your connection.',
      status: 0,
    };
  } else {
    // Error in request setup
    return {
      success: false,
      message: error.message || 'An error occurred',
      status: 0,
    };
  }
};

// Generate device fingerprint
export const generateDeviceFingerprint = () => {
  const fingerprint = `${navigator.userAgent}-${navigator.language}-${screen.width}x${screen.height}`;
  const hash = btoa(fingerprint).substring(0, 32);
  localStorage.setItem('device-fingerprint', hash);
  return hash;
};

// Initialize device fingerprint on load
if (!localStorage.getItem('device-fingerprint')) {
  generateDeviceFingerprint();
}

export default apiClient;

