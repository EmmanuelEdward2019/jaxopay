-- Signup email verification is switching from a clickable link (a one-shot token that email
-- security scanners routinely pre-fetch and consume before the real user ever clicks it — the
-- root cause of persistent "Invalid or expired verification token" reports) to a 6-digit code
-- the user types in manually, reusing the existing otp_codes table (already used for 2FA login).
-- A 6-digit code has only 1,000,000 possible values, far fewer than the 64-char hex link token,
-- so brute-force guessing needs an explicit attempt counter (2FA login OTP already leans on
-- authRateLimiter alone; email verification gets its own per-code lockout on top of that).
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
