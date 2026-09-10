-- Catch-up: finance / org columns missing from open-source base schema
-- Also required by admin-center, finance-overview, and project-finance APIs.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS calculation_method TEXT DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS hours_per_day INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS base_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS restrict_task_creation BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS timelog_backdate_limit_days INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS business_plan_override BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS team_member_limit_override INTEGER;

UPDATE organizations SET calculation_method = 'hourly' WHERE calculation_method IS NULL;
UPDATE organizations SET hours_per_day = 8 WHERE hours_per_day IS NULL;
UPDATE organizations SET base_currency = 'USD' WHERE base_currency IS NULL OR base_currency = '';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS calculation_method TEXT DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS restrict_task_creation BOOLEAN DEFAULT FALSE;

UPDATE projects SET budget = 0 WHERE budget IS NULL;
UPDATE projects SET currency = 'USD' WHERE currency IS NULL OR currency = '';

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS fixed_cost NUMERIC(14, 2) DEFAULT 0;

ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS comment_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_comment_id_fkey'
  ) AND to_regclass('public.task_comments') IS NOT NULL THEN
    ALTER TABLE user_notifications
      ADD CONSTRAINT user_notifications_comment_id_fkey
      FOREIGN KEY (comment_id) REFERENCES task_comments(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Prefer Asia/Kolkata (Postgres no longer accepts Asia/Calcutta as a zone name)
UPDATE users
SET timezone_id = (SELECT id FROM timezones WHERE name = 'Asia/Kolkata' LIMIT 1)
WHERE timezone_id IN (SELECT id FROM timezones WHERE name = 'Asia/Calcutta')
  AND EXISTS (SELECT 1 FROM timezones WHERE name = 'Asia/Kolkata');
