-- 030_rls_lockdown_financial_controls_and_public_forms.sql
--
-- SECURITY FIX: user_financial_controls and public_form_submissions were created (migrations
-- 019 and 021) without Row Level Security enabled — "Unrestricted" in the Supabase dashboard,
-- meaning the anon/authenticated PostgREST API roles could read AND write them directly over
-- REST with no protection at all, bypassing the Express backend entirely:
--   - user_financial_controls: per-user deposit/withdrawal enable flags + custom limits —
--     directly readable/writable by anyone with the project's anon key.
--   - public_form_submissions: guest contact-form submissions (name/email/phone/message) — a
--     straightforward PII leak via the anon key.
-- Confirmed via grep that neither table is ever accessed through the Supabase client SDK from
-- the frontend (jaxopay-web) — both are exclusively read/written by the Express backend's own
-- connection, which uses the RLS-bypassing "postgres" role. So, matching the exact pattern
-- already established in 011_rls_write_lockdown.sql for password_resets/account_deletion_requests
-- (and reconfirmed by the current audit: every other table in the DB already has RLS enabled,
-- most with zero policies for internal-only tables), enabling RLS with zero policies here is
-- correct: it makes both tables fully inaccessible via direct REST (default-deny) with no
-- functional impact on the app.
ALTER TABLE public.user_financial_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_form_submissions ENABLE ROW LEVEL SECURITY;
