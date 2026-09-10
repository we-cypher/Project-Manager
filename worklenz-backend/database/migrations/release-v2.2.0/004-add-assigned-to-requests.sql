-- Legacy filename kept intentionally.
-- Lexicographic sort runs this BEFORE 20250101000001 creates client_portal_requests.
-- Real column add lives in 20250101000008-add-assigned-to-requests.sql.
-- This file must remain a no-op when the table does not exist yet.

DO $$
BEGIN
  IF to_regclass('public.client_portal_requests') IS NOT NULL THEN
    ALTER TABLE client_portal_requests
      ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_client_portal_requests_assigned_to
      ON client_portal_requests(assigned_to);
    COMMENT ON COLUMN client_portal_requests.assigned_to IS
      'The user (team member) assigned to handle this request';
  END IF;
END
$$;
