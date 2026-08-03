-- 016_vba_provider_account_id.sql
--
-- Stores the provider's own account identifier (e.g. Glyde's virtual-account `uid`) alongside
-- our existing provider_reference. Needed to poll GET /virtual-accounts/{uid}/transactions for
-- reconciliation — a safety net for deposits the webhook fails to deliver or match (confirmed
-- happening: a real ₦100 Glyde collection landed with total_collected updated on Glyde's side,
-- but no webhook was ever recorded/processed on ours).
ALTER TABLE virtual_bank_accounts ADD COLUMN IF NOT EXISTS provider_account_id VARCHAR(255);
