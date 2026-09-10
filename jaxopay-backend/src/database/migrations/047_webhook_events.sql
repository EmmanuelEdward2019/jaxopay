-- 047_webhook_events.sql
--
-- A durable record of every inbound provider webhook.
--
-- Written after a multi-day exchange with Obiex over missing crypto withdrawal hashes, where we
-- could not answer a basic question — "did their webhook actually arrive?" — without SSH access to
-- the droplet and grep over a 450MB log file. It turned out the events had been arriving all
-- along and our own SQL was throwing on them; the raw payloads were never stored anywhere, so the
-- one thing that would have settled it in seconds did not exist.
--
-- Deliberately provider-agnostic and append-only: this is an audit trail for reconciling with a
-- provider, not application state. Nothing reads it in a request path.
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(50) NOT NULL,
  -- Provider's own event name/type, e.g. 'WITHDRAWAL', 'DEPOSIT', 'charge.success'.
  event_type VARCHAR(120),
  -- Pulled out of the payload for lookup without having to index the whole JSONB.
  transaction_id VARCHAR(255),
  reference VARCHAR(255),
  status VARCHAR(60),
  -- Whether the HMAC check passed. Obiex/Quidax deliberately fail open, so this records what the
  -- check said even when the event was processed anyway.
  signature_valid BOOLEAN,
  -- The complete body as received. The point of the table.
  payload JSONB NOT NULL,
  -- Set when the handler threw, so a silently-dropped event is visible without log archaeology.
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_created
  ON webhook_events (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_transaction_id
  ON webhook_events (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_reference
  ON webhook_events (reference) WHERE reference IS NOT NULL;
-- Finding the events that were received but blew up in the handler — the case that started this.
CREATE INDEX IF NOT EXISTS idx_webhook_events_errors
  ON webhook_events (created_at DESC) WHERE processing_error IS NOT NULL;

COMMENT ON TABLE webhook_events IS
  'Append-only record of inbound provider webhooks: raw payload, signature result, and any handler error. For reconciling with providers; not read by application logic. Prune periodically — it grows with webhook volume.';
