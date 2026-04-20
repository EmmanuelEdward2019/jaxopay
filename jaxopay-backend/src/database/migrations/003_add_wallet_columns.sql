-- Migration 003: Add missing wallet columns
-- Purpose: Ensures available_balance and locked_balance columns exist on the
--          wallets table in production. These are defined in 001_initial_schema.sql
--          but CREATE TABLE IF NOT EXISTS does not add columns to an already-existing
--          table, so any production DB set up before these columns were added needs
--          this ALTER TABLE to catch up.
--
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS available_balance DECIMAL(20, 8) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_balance    DECIMAL(20, 8) DEFAULT 0;

-- Backfill: set available_balance = balance for existing rows where it is still 0
-- (assumes no funds are currently locked, which is correct for a fresh production DB)
UPDATE wallets
SET available_balance = balance
WHERE available_balance = 0 AND balance > 0;
