-- 022_seed_remaining_feature_toggles.sql
--
-- gift_cards, flights, and bulk_sms are valid feature_toggle enum values (see 001_initial_schema)
-- but were never seeded, so they never showed up in the admin Feature Management UI even though
-- the code paths behind them are live. requireFeature() already treats a missing row as
-- "enabled" (see middleware/featureGuard.js), so seeding these as enabled=true here changes
-- nothing about current behavior — it just makes them visible/manageable in the admin UI.
INSERT INTO feature_toggles (feature_name, is_enabled) VALUES
  ('gift_cards', true),
  ('flights', true),
  ('bulk_sms', true)
ON CONFLICT (feature_name) DO NOTHING;
