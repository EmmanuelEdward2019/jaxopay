-- 017_deposit_withdrawal_halt_toggles.sql
--
-- Four independent system-wide kill switches for the super admin dashboard: halt fiat deposits,
-- crypto deposits, fiat withdrawals, and crypto withdrawals separately. Reuses the existing
-- feature_toggles infrastructure (already cached 60s in featureGuard.js, already audit-logged in
-- updateFeatureToggle) rather than building a parallel system.
--
-- Split into its own migration: Postgres won't let a new enum value be used (e.g. in an INSERT)
-- within the same transaction it was added in ("unsafe use of new value of enum type") — the
-- INSERT of the actual rows happens in 018, once this is committed.
ALTER TYPE feature_toggle ADD VALUE IF NOT EXISTS 'deposits_fiat';
ALTER TYPE feature_toggle ADD VALUE IF NOT EXISTS 'deposits_crypto';
ALTER TYPE feature_toggle ADD VALUE IF NOT EXISTS 'withdrawals_fiat';
ALTER TYPE feature_toggle ADD VALUE IF NOT EXISTS 'withdrawals_crypto';
