-- 024_seed_crypto_ramp_toggle_disabled.sql
--
-- Seeds crypto_ramp as disabled by default, per explicit request: the ramp isn't working
-- reliably right now, and YC can settle crypto/fiat trades directly from deposited balances
-- without it, so it's being turned off rather than left half-broken for users.
INSERT INTO feature_toggles (feature_name, is_enabled) VALUES
  ('crypto_ramp', false)
ON CONFLICT (feature_name) DO NOTHING;
