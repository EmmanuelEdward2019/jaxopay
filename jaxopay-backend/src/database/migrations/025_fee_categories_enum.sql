-- 025_fee_categories_enum.sql
--
-- Adds transaction_type enum values for the new fee_configurations categories requested:
-- swap buy/sell (as separate categories since a spread naturally differs by direction once
-- fiat is on one side), fiat deposit, fiat withdrawal, YC currency swap, YC international
-- transfer. Investigation confirmed the existing 'exchange' fee_configurations row was dead
-- configuration — nothing in the transaction code ever called getFeeConfig('exchange', ...),
-- so none of these flows had any real markup applied before this.
-- Split into its own migration (see 023/017 for the same constraint) because Postgres disallows
-- using a newly added enum value in the same transaction it was added in.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'swap_buy';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'swap_sell';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'fiat_deposit';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'fiat_withdrawal';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'yc_currency_swap';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'yc_international_transfer';
