-- Enable RLS on the last three public tables that were missing it.
--
-- Supabase's security linter emails a warning for every table in the `public` schema without row
-- level security, because PostgREST serves that schema to anyone holding the project's anon key.
-- 53 of the 56 tables already had it; these three are newer and were created without it:
--   device_push_tokens  (added with push notifications)
--   pending_signups     (added when signup stopped creating a users row before email confirmation)
--   webhook_events      (added to record inbound provider webhooks)
--
-- No policies are added, which means deny-all for `anon` and `authenticated` — the correct posture
-- here, since nothing is meant to reach these tables from a browser. (They aren't even granted to
-- those roles today; this is the belt to that pair of braces.) The API backend is unaffected: it
-- connects as `postgres`, which has BYPASSRLS, and the web/mobile clients never query Postgres
-- directly — @supabase/supabase-js is present in the web app only for a config sanity check and
-- issues no queries.
--
-- Any new table added to `public` from now on should enable RLS in the same migration that creates
-- it, or the warning emails come back.

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
