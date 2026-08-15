-- 033_exchange_rates_updated_at_and_markup_precision.sql
--
-- Two more gaps left over from exchange_rates predating this migrations folder:
--
-- 1. No updated_at column, even though updateExchangeRate's UPDATE statement (and every other
--    admin-editable table in this codebase) sets one — every PATCH to an existing rate (the
--    Active/Inactive toggle, inline Base Rate/Markup edits) was failing with a raw
--    "column updated_at does not exist" Postgres error.
--
-- 2. markup_percentage was NUMERIC(5,2) — only 2 decimal places. JAXOPAY's actual swap spreads
--    need finer precision than that (e.g. a 1395 -> 1393 NGN/USDT sell markup is -0.1435%, a
--    1395 -> 1400 buy markup is +0.3571%); at 2dp both of those silently round to -0.14/0.36,
--    which is off by up to ~0.01 percentage points on a real quote. Widened to NUMERIC(9,4),
--    comfortably inside the existing -50..50 app-level validation bound in admin.routes.js.
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE exchange_rates ALTER COLUMN markup_percentage TYPE NUMERIC(9, 4);
