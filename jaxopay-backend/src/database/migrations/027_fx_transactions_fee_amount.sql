-- 027_fx_transactions_fee_amount.sql
--
-- fx_transactions (YC currency swap + international transfer) had nowhere to record the new
-- platform fee/spread being applied to these flows. Adding a dedicated column rather than
-- repurposing recipient_details (which is swap-irrelevant and semantically for payout details).
ALTER TABLE fx_transactions ADD COLUMN IF NOT EXISTS fee_amount NUMERIC NOT NULL DEFAULT 0;
