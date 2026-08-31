-- 038_payment_collection_fee_enum.sql
--
-- New transaction_type enum value for the Payment Collection feature (receive money from a
-- payer abroad via Yellow Card's /receive API). Split into its own migration (see 023/025 for
-- the same constraint) because Postgres disallows using a newly added enum value in the same
-- transaction it was added in.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'yc_payment_collection';
