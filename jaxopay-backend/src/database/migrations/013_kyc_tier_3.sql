-- 013_kyc_tier_3.sql
-- New KYC tier model:
--   tier_1: full name + address + phone + verified email (profile completion) — $0 limit
--   tier_2: NIN + facial/biometric verification — real transaction limits unlock
--   tier_3: + proof of address (utility bill / bank statement) — highest limits
-- BVN is deliberately NOT part of this tier ladder (it doesn't apply outside Nigeria) — it
-- gates specific Nigeria-only transactions (NGN deposits, international transfer, Yellow Card)
-- at the point of the transaction instead. See kycLimits.service.js and
-- CurrencyEngineService.assertNigerianId.

ALTER TYPE kyc_tier ADD VALUE IF NOT EXISTS 'tier_3';
