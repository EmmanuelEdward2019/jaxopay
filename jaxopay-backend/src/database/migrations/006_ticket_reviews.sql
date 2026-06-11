-- Migration: Ticket Reviews
-- Adds rating and review_comment to support_tickets table

ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating >= 1 AND rating <= 5),
ADD COLUMN IF NOT EXISTS review_comment TEXT;

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('006_ticket_reviews')
ON CONFLICT (version) DO NOTHING;
