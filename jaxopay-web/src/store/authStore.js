import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authService from '../services/authService';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setSession: (session) => set({ session }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        const result = await authService.login(email, password);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        // API returns { user: ..., session: { access_token, refresh_token, expires_in } }
        const { user, session: sessionData } = result.data;
        const session = {
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
          user,
        };

        set({
          user,
          session,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });

        return { success: true, data: result.data };
      },

      loginWithOTP: async (phone) => {
        set({ isLoading: true, error: null });
        const result = await authService.loginWithPhone(phone);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        set({ isLoading: false });
        return { success: true, data: result.data };
      },

      verifyOTP: async (phone, otp) => {
        set({ isLoading: true, error: null });
        const result = await authService.verifyOTP(phone, otp);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        const { user, access_token, refresh_token } = result.data;
        const session = { access_token, refresh_token, user };

        set({
          user,
          session,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });

        return { success: true, data: result.data };
      },

      signup: async (email, password, metadata) => {
        set({ isLoading: true, error: null });
        const result = await authService.signup(email, password, metadata);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        // Auto-login after signup - API returns session with tokens
        const { user, session: sessionData } = result.data;
        if (sessionData?.access_token) {
          const session = {
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token,
            user,
          };

          set({
            user,
            session,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } else {
          set({ isLoading: false });
        }

        return { success: true, data: result.data };
      },

      // Alias for signup
      register: async (userData) => {
        set({ isLoading: true, error: null });
        const { email, password, ...metadata } = userData;
        const result = await authService.signup(email, password, metadata);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        // Auto-login after signup - API returns session with tokens
        const { user, session: sessionData } = result.data;
        if (sessionData?.access_token) {
          const session = {
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token,
            user,
          };

          set({
            user,
            session,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } else {
          set({ isLoading: false });
        }

        return { success: true, data: result.data };
      },

      requestPasswordReset: async (email) => {
        set({ isLoading: true, error: null });
        const result = await authService.requestPasswordReset(email);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        set({ isLoading: false });
        return { success: true, data: result.data };
      },

      resetPassword: async (token, newPassword) => {
        set({ isLoading: true, error: null });
        const result = await authService.resetPassword(token, newPassword);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        set({ isLoading: false });
        return { success: true, data: result.data };
      },

      verifyEmail: async (token) => {
        set({ isLoading: true, error: null });
        const result = await authService.verifyEmail(token);

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        set({ isLoading: false });
        return { success: true, data: result.data };
      },

      resendVerificationEmail: async (email) => {
        set({ isLoading: true, error: null });
        try {
          // Note: This endpoint needs to be added to the backend
          const result = await authService.requestPasswordReset(email); // Reusing as placeholder
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ error: error.message, isLoading: false });
          return { success: false, error: error.message };
        }
      },

      logout: async () => {
        set({ isLoading: true });
        const result = await authService.logout();

        if (!result.success) {
          set({ error: result.error, isLoading: false });
          return { success: false, error: result.error };
        }

        set({
          user: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });

        return { success: true };
      },

      refreshSession: async () => {
        const currentState = get();
        if (!currentState.session?.refresh_token) {
          set({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }

        try {
          const result = await authService.refreshToken(currentState.session.refresh_token);

          if (!result.success) {
            // Only logout if it's an authentication error (401/403)
            // If it's a network error (status 0 or 500), keep the session
            if (result.status === 401 || result.status === 403) {
              console.warn('Refresh token invalid or expired, logging out:', result.error);
              set({
                user: null,
                session: null,
                isAuthenticated: false,
                isLoading: false,
              });
            } else {
              console.warn('Token refresh failed due to network/server issue, preserving session:', result.error);
              set({ isLoading: false });
            }
            return;
          }

          const { user, access_token, refresh_token } = result.data;
          const session = { access_token, refresh_token, user };

          set({
            user,
            session,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          console.error('Unexpected error during refreshSession:', error);
          set({ isLoading: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'jaxopay-auth',
      partialize: (state) => ({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

