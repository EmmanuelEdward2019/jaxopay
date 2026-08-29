-- 037_kyc_documents_smile_type_id.sql
-- Smile ID's own canonical job identifier (TypeID format: job_xxxxxxxxxxxxxxxxxxxxxxxxxx),
-- delivered via the webhook's Job-ID header — distinct from document_number's `SMILE:<uuid>`,
-- which is OUR OWN partner-chosen job_id used only to correlate webhooks back to the row we
-- created at submission time. The V3 Replay Callback / Verification Status APIs
-- (docs.usesmileid.com/api-reference/core-resources/replay-webhook,
-- .../verification-status) require THIS id, not ours, so it needs to be captured and stored
-- the first time we ever see it (any webhook delivery, including a non-terminal "processing"
-- one) in order to reconcile a job whose FINAL webhook never arrives.
ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS smile_type_id TEXT;
