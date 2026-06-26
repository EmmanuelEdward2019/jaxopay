-- 008_transaction_pin_and_beneficiaries.sql
-- Adds: (1) transaction PIN on users, (2) a general saved_beneficiaries table
-- for reusable bill phone numbers, smartcards, meters, bank accounts, wallet addresses.

-- ---------------------------------------------------------------------------
-- 1. Transaction PIN (bcrypt-hashed, with lockout protection)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS transaction_pin VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS transaction_pin_set_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS transaction_pin_failed_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS transaction_pin_locked_until TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 2. Saved beneficiaries (general, type-based)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_beneficiaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- bank_account | airtime | data | cable | electricity | crypto
    type VARCHAR(32) NOT NULL,
    label VARCHAR(120),                 -- user nickname, e.g. "Mum's DSTV"
    value VARCHAR(255) NOT NULL,        -- phone / smartcard / meter / account no / wallet address
    provider VARCHAR(120),              -- display name: MTN, DSTV, IKEDC, GTBank, BTC...
    provider_code VARCHAR(80),          -- bank_code / biller id / network id / coin / network
    account_name VARCHAR(255),          -- resolved holder name where applicable
    currency VARCHAR(10),
    metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_beneficiaries_user_type
    ON saved_beneficiaries(user_id, type) WHERE is_active = true;

DROP TRIGGER IF EXISTS update_saved_beneficiaries_updated_at ON saved_beneficiaries;
CREATE TRIGGER update_saved_beneficiaries_updated_at BEFORE UPDATE ON saved_beneficiaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
1