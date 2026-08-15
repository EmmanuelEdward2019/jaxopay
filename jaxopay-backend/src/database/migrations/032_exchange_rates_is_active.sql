-- 032_exchange_rates_is_active.sql
--
-- exchange_rates predates this migrations folder and was missing an is_active column that
-- admin.controller.js's createExchangeRate/updateExchangeRate and the FX Rates & Markup UI
-- (SystemManagement.jsx) have always assumed exists — every "Add Exchange Rate" submission was
-- failing with a raw "column is_active does not exist" Postgres error (42703), which surfaced to
-- the admin only as a generic "Something went wrong" since it's not a validation error. Defaults
-- to true so any pre-existing rows (there were none) would have kept working unmodified.
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
