-- 034_pending_signups.sql
--
-- Signup used to INSERT a real `users` row immediately, before the email was ever verified.
-- Since email/phone are UNIQUE on `users`, a typo'd or abandoned unverified signup permanently
-- squatted on that email/phone — a genuine user correcting a mistake got "email already in use"
-- for an account that was never actually theirs to begin with, with no way to fix it themselves.
--
-- pending_signups holds signup data (already-hashed password included) until the 6-digit email
-- code is confirmed; only then does a real `users` row get created (see verifyEmailCode in
-- auth.controller.js). Deliberately has NO unique constraint on email/phone — signup deletes and
-- replaces any prior pending row for the same email before inserting, so retrying with a
-- correction never errors. Uniqueness against real accounts is still enforced at promotion time
-- by the existing `users.email`/`users.phone` UNIQUE constraints.
CREATE TABLE IF NOT EXISTS pending_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  password_hash TEXT NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  country_code VARCHAR(2),
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON pending_signups(email);
