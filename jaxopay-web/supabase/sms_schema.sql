-- Bulk SMS System Tables
CREATE TABLE IF NOT EXISTS sms_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sender_id VARCHAR(11) DEFAULT 'JAXOPAY',
    message TEXT NOT NULL,
    total_recipients INTEGER NOT NULL,
    successful_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    total_units INTEGER NOT NULL,
    total_cost DECIMAL(20, 8) NOT NULL,
    status VARCHAR(20) DEFAULT 'processing', -- 'processing', 'completed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

CREATE INDEX idx_sms_batches_user_id ON sms_batches(user_id);
CREATE INDEX idx_sms_batches_status ON sms_batches(status);

-- Add 'bulk_sms' to transaction_type enum if it doesn't exist
-- Note: In PostgreSQL, adding to enum needs care
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'bulk_sms';
