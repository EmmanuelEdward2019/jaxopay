-- Migration 002: Add Quidax sub-user ID to users table
-- Purpose: Each Jaxopay user maps to a dedicated Quidax sub-account so that
--          every user gets unique crypto deposit addresses and webhook events
--          can be routed to the correct user.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS quidax_user_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS quidax_user_sn  VARCHAR(255);

-- Fast webhook lookups: find Jaxopay user from Quidax webhook data.user.id
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_quidax_user_id
    ON users (quidax_user_id)
    WHERE quidax_user_id IS NOT NULL;
