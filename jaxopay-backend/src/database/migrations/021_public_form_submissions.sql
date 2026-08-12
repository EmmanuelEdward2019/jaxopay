-- 021_public_form_submissions.sql
--
-- Storage for forms filled out by guests on public (unauthenticated) pages — e.g. the Contact
-- page — which previously had no backend at all: submissions were discarded client-side with
-- nothing saved and nothing visible to admins. `form_type` keeps this reusable for future public
-- forms beyond Contact without needing a new table each time.
CREATE TABLE IF NOT EXISTS public_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type VARCHAR(50) NOT NULL DEFAULT 'contact',
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  subject VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'responded', 'archived')),
  admin_note TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_form_submissions_status ON public_form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_public_form_submissions_created_at ON public_form_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_form_submissions_form_type ON public_form_submissions(form_type);
