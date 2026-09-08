-- 046_split_custom_withdrawal_limits.sql
--
-- Per-user withdrawal caps, split the same way the KYC tier caps already are (kycLimits.service.js
-- TIER_CAPS_USD tracks crypto and fiat independently). Before this there was a single
-- custom_withdrawal_limit_usd that replaced BOTH halves at once, so an admin could not, say, pin a
-- suspicious account's fiat cash-out to $200/day while leaving its crypto activity alone — the
-- exact control asked for when irregular activity is detected on an account.
--
-- custom_withdrawal_limit_usd is kept as the legacy fallback: existing rows keep working (it is
-- read when the matching split column is NULL), and it is backfilled into BOTH new columns below
-- so previously-configured overrides carry over with identical behaviour.
ALTER TABLE user_financial_controls
  ADD COLUMN IF NOT EXISTS custom_withdrawal_limit_fiat_usd   NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS custom_withdrawal_limit_crypto_usd NUMERIC(18, 2);

UPDATE user_financial_controls
   SET custom_withdrawal_limit_fiat_usd   = COALESCE(custom_withdrawal_limit_fiat_usd,   custom_withdrawal_limit_usd),
       custom_withdrawal_limit_crypto_usd = COALESCE(custom_withdrawal_limit_crypto_usd, custom_withdrawal_limit_usd)
 WHERE custom_withdrawal_limit_usd IS NOT NULL;

COMMENT ON COLUMN user_financial_controls.custom_withdrawal_limit_fiat_usd IS
  'Admin override for this user''s DAILY fiat withdrawal cap, in USD. Monthly is 10x, matching TIER_CAPS_USD. NULL = use the KYC tier default.';
COMMENT ON COLUMN user_financial_controls.custom_withdrawal_limit_crypto_usd IS
  'Admin override for this user''s DAILY crypto withdrawal cap, in USD. Monthly is 10x, matching TIER_CAPS_USD. NULL = use the KYC tier default.';
COMMENT ON COLUMN user_financial_controls.custom_withdrawal_limit_usd IS
  'Legacy single cap covering both fiat and crypto. Superseded by the two split columns above; still read as a fallback when the matching split column is NULL.';
