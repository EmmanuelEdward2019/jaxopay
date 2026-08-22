-- 035_ngn_withdrawal_fee.sql
--
-- Flat ₦100 fee on NGN bank withdrawals (transfer.controller.js already calls
-- getFeeConfig('fiat_withdrawal', transferCurrency) — it's been live at 0% since
-- 026_seed_fee_categories.sql). getFeeConfig prefers a currency-specific row over the
-- existing currency=NULL (applies-to-any-currency) 0% row, so this only affects NGN
-- withdrawals; every other currency keeps falling through to the 0% global row untouched.

INSERT INTO fee_configurations (transaction_type, fee_type, fee_value, min_fee, max_fee, currency, country, is_active)
SELECT 'fiat_withdrawal', 'fixed', 100, 0, 0, 'NGN', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM fee_configurations WHERE transaction_type = 'fiat_withdrawal' AND currency = 'NGN'
);
