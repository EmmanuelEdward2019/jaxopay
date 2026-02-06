import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if we have valid Supabase credentials
const hasValidCredentials =
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder');

if (!hasValidCredentials) {
  console.warn(
    '⚠️ SUPABASE NOT CONFIGURED\n\n' +
    'Please set up your Supabase project:\n' +
    '1. Go to https://supabase.com and create a project\n' +
    '2. Run the schema.sql file in SQL Editor\n' +
    '3. Get your project URL and anon key from Settings > API\n' +
    '4. Update the .env file with your credentials\n' +
    '5. Restart the dev server\n\n' +
    'For now, the app will run in demo mode with limited functionality.'
  );
}

export const supabase = hasValidCredentials
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'X-Client-Info': 'jaxopay-web',
        },
      },
    })
  : null; // Return null if credentials are invalid

// Auth helper functions
export const auth = {
  signUp: async (email, password, metadata = {}) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    return { data, error };
  },

  signIn: async (email, password) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured. Please check console for setup instructions.' } };
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  signInWithOTP: async (phone) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data, error } = await supabase.auth.signInWithOtp({
      phone,
    });
    return { data, error };
  },

  signInWithGoogle: async () => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { data, error };
  },

  signOut: async () => {
    if (!supabase) return { error: null };
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  getCurrentUser: async () => {
    if (!supabase) return { user: null, error: null };
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  },

  getCurrentSession: async () => {
    if (!supabase) return { session: null, error: null };
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  },

  resetPassword: async (email) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { data, error };
  },

  updatePassword: async (newPassword) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { data, error };
  },

  verifyOTP: async (phone, token) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    return { data, error };
  },
};

// Database helper functions
export const db = {
  // Generic CRUD operations
  select: async (table, query = '*', filters = {}) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    let queryBuilder = supabase.from(table).select(query);

    Object.entries(filters).forEach(([key, value]) => {
      queryBuilder = queryBuilder.eq(key, value);
    });

    const { data, error } = await queryBuilder;
    return { data, error };
  },

  insert: async (table, data) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select();
    return { data: result, error };
  },

  update: async (table, id, data) => {
    if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
    const { data: result, error } = await supabase
      .from(table)
      .update(data)
      .eq('id', id)
      .select();
    return { data: result, error };
  },

  delete: async (table, id) => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);
    return { error };
  },
};

export default supabase;

