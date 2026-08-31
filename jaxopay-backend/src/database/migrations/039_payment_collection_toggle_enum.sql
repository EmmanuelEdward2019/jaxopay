-- 039_payment_collection_toggle_enum.sql
--
-- New feature_toggle enum value so Payment Collection can be turned off centrally (e.g. if
-- Yellow Card's /receive API misbehaves in production, mirroring why crypto_ramp got its own
-- toggle) without touching KYC tier gating or any other flow. Separate migration from the seed
-- insert in 040, same enum-in-same-transaction restriction as 038/023/025.
ALTER TYPE feature_toggle ADD VALUE IF NOT EXISTS 'payment_collection';
