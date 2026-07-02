-- 009_card_fee_configs.sql
-- Card fees as editable fee_configurations rows (flat + percentage).
-- For fee_type 'flat_plus_percent': min_fee = flat component, fee_value = percentage.

INSERT INTO fee_configurations (transaction_type, fee_type, fee_value, min_fee, max_fee, currency, is_active)
SELECT 'card_creation', 'flat_plus_percent', 2, 2.5, 0, 'USD', true
WHERE NOT EXISTS (SELECT 1 FROM fee_configurations WHERE transaction_type = 'card_creation');

INSERT INTO fee_configurations (transaction_type, fee_type, fee_value, min_fee, max_fee, currency, is_active)
SELECT 'card_funding', 'flat_plus_percent', 2, 2, 0, 'USD', true
WHERE NOT EXISTS (SELECT 1 FROM fee_configurations WHERE transaction_type = 'card_funding');
