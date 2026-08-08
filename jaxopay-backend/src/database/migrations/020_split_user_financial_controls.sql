-- 020_split_user_financial_controls.sql
--
-- Splits the per-user deposits_enabled/withdrawals_enabled toggles into four independent
-- controls (fiat vs crypto, deposit vs withdrawal), matching the granularity already used by
-- the system-wide feature_toggles (deposits_fiat / deposits_crypto / withdrawals_fiat /
-- withdrawals_crypto). An admin can now e.g. disable only crypto withdrawals for a user while
-- leaving their fiat deposits/withdrawals and crypto deposits untouched.
ALTER TABLE user_financial_controls
  ADD COLUMN IF NOT EXISTS deposits_fiat_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deposits_crypto_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS withdrawals_fiat_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS withdrawals_crypto_enabled BOOLEAN NOT NULL DEFAULT true;

-- Carry forward any existing overrides before dropping the old blanket columns.
UPDATE user_financial_controls SET
  deposits_fiat_enabled = deposits_enabled,
  deposits_crypto_enabled = deposits_enabled,
  withdrawals_fiat_enabled = withdrawals_enabled,
  withdrawals_crypto_enabled = withdrawals_enabled;

ALTER TABLE user_financial_controls
  DROP COLUMN IF EXISTS deposits_enabled,
  DROP COLUMN IF EXISTS withdrawals_enabled;
