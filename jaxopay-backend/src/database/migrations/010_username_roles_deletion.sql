-- 010_username_roles_deletion.sql
-- (a) username: short, human-friendly identifier for internal transfers (alternative to email/UID).
-- (b) roles: multi-role support for staff/admin accounts (legacy `role` column kept as the
--     "primary" role for backward compatibility with existing single-role checks).
-- (c) account_deletion_requests: users request deletion, super_admin approves/rejects.

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[];

-- Case-insensitive uniqueness (only enforced for rows that have set one).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (LOWER(username))
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
    requested_at TIMESTAMP DEFAULT NOW(),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    admin_note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Only one active (pending) request per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_one_pending
  ON account_deletion_requests (user_id)
  WHERE status = 'pending';
