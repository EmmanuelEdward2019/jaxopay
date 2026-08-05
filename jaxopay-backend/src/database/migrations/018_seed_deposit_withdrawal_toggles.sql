-- 018_seed_deposit_withdrawal_toggles.sql
-- Seeds the four new feature_toggle rows added in 017. All default to enabled (true) — nothing
-- is halted by this migration, it just makes the switches available in the admin dashboard.
INSERT INTO feature_toggles (feature_name, is_enabled) VALUES
  ('deposits_fiat', true),
  ('deposits_crypto', true),
  ('withdrawals_fiat', true),
  ('withdrawals_crypto', true)
ON CONFLICT (feature_name) DO NOTHING;
