-- 023_crypto_ramp_toggle_enum.sql
--
-- Adds a dedicated 'crypto_ramp' feature_toggle value so the Yellow Card crypto on/off-ramp
-- (buy/sell crypto with fiat) can be disabled independently of ordinary crypto deposits/
-- withdrawals. Previously /cross-border/ramp/deposit and /ramp/withdraw were gated by
-- deposits_crypto/withdrawals_crypto — the SAME toggles that gate plain Obiex/Quidax crypto
-- deposits/withdraws in crypto.routes.js, so there was no way to turn off just the ramp.
-- Split into its own migration (rather than combined with the seed insert in 024) because
-- Postgres doesn't allow using a newly added enum value in the same transaction it was added in.
ALTER TYPE feature_toggle ADD VALUE IF NOT EXISTS 'crypto_ramp';
