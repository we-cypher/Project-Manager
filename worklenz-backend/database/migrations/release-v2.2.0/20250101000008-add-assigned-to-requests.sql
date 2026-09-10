-- Add assigned_to field to client_portal_requests table
-- This allows team members to be assigned to handle specific requests
-- Runs after 20250101000001 creates client_portal_requests (004 is a safe no-op if run earlier).

DO $$
BEGIN
  IF to_regclass('public.client_portal_requests') IS NULL THEN
    RAISE EXCEPTION 'client_portal_requests missing; run 20250101000001 first';
  END IF;
END
$$;

ALTER TABLE client_portal_requests
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_portal_requests_assigned_to ON client_portal_requests(assigned_to);

COMMENT ON COLUMN client_portal_requests.assigned_to IS 'The user (team member) assigned to handle this request';
