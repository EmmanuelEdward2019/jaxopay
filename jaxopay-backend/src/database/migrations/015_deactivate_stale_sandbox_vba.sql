-- 015_deactivate_stale_sandbox_vba.sql
--
-- Every row currently in virtual_bank_accounts (8 total) is leftover Korapay-SANDBOX test
-- data from March 2026 ("Wema Bank (Sandbox)" / "JAXOPAY User") — created while testing the
-- VBA feature long before it was ever wired into the frontend, and long before Glyde/live
-- Korapay keys existed. None of these represent a real bank account; transfers to them fail
-- ("Account unavailable") because the receiving bank never existed outside Korapay's sandbox.
--
-- Combined with the getOrCreateVBA lookup bug (fixed alongside this migration — it queried by
-- user_id only, with no wallet_id filter), any of these rows could be served back to a user as
-- if it were their real, current NGN deposit account.
--
-- Deactivate rather than delete, to preserve the historical record. The lookup query only
-- reads is_active = true rows, so this alone makes every affected user's next deposit attempt
-- provision a fresh, real account via Glyde (or Korapay live, as fallback).
UPDATE virtual_bank_accounts
SET is_active = false, updated_at = NOW()
WHERE provider = 'korapay'
  AND bank_name ILIKE '%sandbox%';
