-- Seed the observed Obiex NGN payout charge: 50 + 7.5% VAT = 53.75, flat.
--
-- Separate from 044 because Postgres will not let a newly added enum value be used in the same
-- transaction that added it, and the migration runner wraps each file in one.
--
-- 'fixed' means fee_value is the flat amount (see computeFee). Currency-scoped, so Ghana can carry
-- its own cost once GHS payouts go live. Verified against a real withdrawal: 1,200 debited, 1,100
-- sent to Obiex, 1,046.25 received — exactly 53.75 taken.
INSERT INTO fee_configurations (transaction_type, fee_type, fee_value, min_fee, max_fee, currency, country, is_active)
VALUES ('provider_payout_cost', 'fixed', 53.75, 0, 0, 'NGN', NULL, true)
ON CONFLICT DO NOTHING;
