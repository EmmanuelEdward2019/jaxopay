-- 040_seed_payment_collection.sql
--
-- Seeds Payment Collection's fee (active at 2%, matching the same 0.5% JAXOPAY / 1.5% YC split
-- already applied to yc_international_transfer — explicitly requested, unlike the other flows
-- which launched at 0% pending a pricing decision) and its feature toggle (enabled — this
-- launches live, not staged off like crypto_ramp was).
INSERT INTO fee_configurations (transaction_type, fee_type, fee_value, min_fee, max_fee, currency, country, is_active) VALUES
  ('yc_payment_collection', 'percentage', 2, 0, 0, NULL, NULL, true);

INSERT INTO feature_toggles (feature_name, is_enabled) VALUES
  ('payment_collection', true)
ON CONFLICT (feature_name) DO NOTHING;
