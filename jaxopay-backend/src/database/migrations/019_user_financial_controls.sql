-- 019_user_financial_controls.sql
--
-- Per-user admin overrides: enable/disable deposits or withdrawals for a specific user, and set
-- a custom fixed limit that replaces their KYC-tier-derived default (NGN for deposits, USD for
-- withdrawals — matching the currency convention already used by the deposit screen and
-- kycLimits.service.js respectively). NULL limit columns mean "no override, use the tier default".
CREATE TABLE IF NOT EXISTS user_financial_controls (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deposits_enabled BOOLEAN NOT NULL DEFAULT true,
  withdrawals_enabled BOOLEAN NOT NULL DEFAULT true,
  custom_deposit_limit_ngn NUMERIC(18, 2),
  custom_withdrawal_limit_usd NUMERIC(18, 2),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
