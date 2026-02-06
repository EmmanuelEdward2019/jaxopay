-- JAXOPAY Additional Tables Migration
-- Run this script after the main schema.sql to add missing tables

-- ============================================
-- EMAIL VERIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);

-- ============================================
-- OTP CODES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  purpose VARCHAR(50) NOT NULL, -- 'login', '2fa', 'verification'
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_id ON otp_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);

-- ============================================
-- PASSWORD RESET TOKENS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

-- ============================================
-- FIX user_devices TABLE - Add missing column
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_devices' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE user_devices ADD COLUMN last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- ============================================
-- TOTP SECRETS TABLE (for 2FA authenticator app)
-- ============================================

CREATE TABLE IF NOT EXISTS totp_secrets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  secret_encrypted TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Add 2FA secret column to users table if missing
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'two_fa_secret'
  ) THEN
    ALTER TABLE users ADD COLUMN two_fa_secret TEXT;
  END IF;
END $$;

-- ============================================
-- Disable RLS for service-level operations
-- (The backend uses its own auth, not Supabase auth)
-- ============================================

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents DISABLE ROW LEVEL SECURITY;

-- Drop policies that reference auth.uid() since we're not using Supabase Auth
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS user_profiles_select_own ON user_profiles;
DROP POLICY IF EXISTS wallets_select_own ON wallets;
DROP POLICY IF EXISTS transactions_select_own ON transactions;
DROP POLICY IF EXISTS virtual_cards_select_own ON virtual_cards;
DROP POLICY IF EXISTS users_admin_all ON users;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE email_verifications IS 'Email verification tokens for new account verification';
COMMENT ON TABLE otp_codes IS 'One-time password codes for login and 2FA';
COMMENT ON TABLE password_reset_tokens IS 'Password reset tokens for forgot password flow';
COMMENT ON TABLE totp_secrets IS 'TOTP secrets for authenticator app 2FA';
