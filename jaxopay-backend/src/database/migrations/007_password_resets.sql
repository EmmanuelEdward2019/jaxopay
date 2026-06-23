-- 007_password_resets.sql
-- Creates the password_resets table used by auth.controller.js (forgotPassword / resetPassword).
-- This table was referenced in code but never defined in a migration, causing
-- POST /auth/forgot-password to return 500 (INSERT into a non-existent table).

CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_created_at ON password_resets(created_at DESC);
