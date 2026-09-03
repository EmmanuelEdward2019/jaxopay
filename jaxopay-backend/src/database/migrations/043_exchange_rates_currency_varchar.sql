-- Let exchange_rates hold any currency code, not just the ones the wallet enum knows about.
--
-- from_currency/to_currency were the shared `currency_code` enum, which covers the currencies
-- JAXOPAY holds wallets in. Yellow Card's payout corridors are a different, larger, and
-- externally-controlled set: XOF (already carrying real live NGN->XOF transfers) isn't in the
-- enum at all, so those corridors literally could not be priced. Requiring an enum migration
-- before an admin can set a markup on a corridor Yellow Card already supports is the wrong
-- coupling — this table is FX pricing configuration, not a ledger of currencies we custody.
--
-- Safe to change in place: no foreign keys, no views, and the only readers compare it as a
-- string (swapMarkup.service.js, ycMarkup.service.js, admin.controller.js). Indexes are rebuilt
-- automatically by the type change.
ALTER TABLE exchange_rates
  ALTER COLUMN from_currency TYPE VARCHAR(10) USING from_currency::text,
  ALTER COLUMN to_currency   TYPE VARCHAR(10) USING to_currency::text;

-- The enum previously prevented typos; keep a cheap shape guard in its place so a fat-fingered
-- code can't become a row that silently never matches anything at runtime.
ALTER TABLE exchange_rates
  DROP CONSTRAINT IF EXISTS exchange_rates_currency_format;
ALTER TABLE exchange_rates
  ADD CONSTRAINT exchange_rates_currency_format
  CHECK (from_currency ~ '^[A-Z0-9]{2,10}$' AND to_currency ~ '^[A-Z0-9]{2,10}$');
