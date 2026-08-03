-- 014_grandfather_email_verification.sql
--
-- The "verify email before login" gate was deployed 2026-08-03 04:09:33-07 (commit 7cffa2f).
-- Every account created before that moment signed up under the old flow, which never sent
-- (or required) a verification email — enforcing the gate on them retroactively locked out
-- the entire existing user base with no way to receive the link they were told to check for.
--
-- Grandfather everyone who signed up before the gate existed. Accounts created at/after the
-- cutoff are unaffected and must still verify normally.
UPDATE users
SET is_email_verified = true
WHERE is_email_verified IS NOT TRUE
  AND created_at < '2026-08-03 04:09:33-07';
