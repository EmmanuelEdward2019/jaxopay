-- Migration 004: Add columns referenced in code but missing from initial schema
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING guards throughout).
--
-- Changes:
--   wallet_transactions  → updated_at, completed_at
--   transactions         → external_reference
--   wallets              → available_balance, locked_balance  (duplicate guard with 003)

-- ── wallet_transactions ────────────────────────────────────────────────────────
-- updateQuidaxWithdrawal (webhook.controller.js) sets updated_at and completed_at
-- on wallet_transactions rows but these columns weren't in the initial schema.
ALTER TABLE wallet_transactions
    ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Backfill updated_at = created_at for existing rows so the column is not null
UPDATE wallet_transactions
SET updated_at = created_at
WHERE updated_at IS NULL;

-- ── transactions ───────────────────────────────────────────────────────────────
-- updateQuidaxSwap queries  t.external_reference  to match swap transactions.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS external_reference VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_transactions_external_ref
    ON transactions (external_reference)
    WHERE external_reference IS NOT NULL;

-- ── wallets (redundant guard — same as 003, safe to re-run) ───────────────────
ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS available_balance DECIMAL(20, 8) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_balance    DECIMAL(20, 8) DEFAULT 0;

-- Backfill available_balance for existing rows
UPDATE wallets
SET available_balance = balance
WHERE available_balance = 0 AND balance > 0;

-- Record migration (create the tracking table first if it doesn't exist)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('004_missing_columns')
ON CONFLICT (version) DO NOTHING;
