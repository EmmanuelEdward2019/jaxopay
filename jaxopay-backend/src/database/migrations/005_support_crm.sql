-- Migration: Support CRM Enhancements
-- Adds assigned_to and tags columns to support_tickets

ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
