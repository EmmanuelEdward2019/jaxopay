import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export const useAppStore = create(
  persist(
    (set, get) => ({
      theme: 'light',
      language: 'en',
      currency: 'USD',
      featureToggles: {},
      isLoading: false,

      setTheme: (theme) => {
        set({ theme });
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },

      toggleTheme: () => {
        const currentTheme = get().theme;
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        get().setTheme(newTheme);
      },

      setLanguage: (language) => set({ language }),

      setCurrency: (currency) => set({ currency }),

      fetchFeatureToggles: async () => {
        set({ isLoading: true });
        
        const { data, error } = await supabase
          .from('feature_toggles')
          .select('*');
        
        if (error) {
          console.error('Error fetching feature toggles:', error);
          set({ isLoading: false });
          return;
        }
        
        const toggles = {};
        data.forEach(toggle => {
          toggles[toggle.feature_name] = toggle.is_enabled;
        });
        
        set({ featureToggles: toggles, isLoading: false });
      },

      isFeatureEnabled: (featureName) => {
        const toggles = get().featureToggles;
        return toggles[featureName] !== false; // Default to true if not set
      },
    }),
    {
      name: 'jaxopay-app-settings',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        currency: state.currency,
      }),
    }
  )
);

