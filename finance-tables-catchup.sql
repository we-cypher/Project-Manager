-- finance-tables-catchup.sql
-- Creates missing finance tables required by the EE finance module.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout.

BEGIN;

-- 1. finance_rate_cards (org-level rate cards)
CREATE TABLE IF NOT EXISTS finance_rate_cards (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id    UUID REFERENCES teams(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    currency   VARCHAR(10) DEFAULT 'usd',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finance_rate_cards_team_id
    ON finance_rate_cards(team_id);

-- 2. finance_rate_card_roles (org-level rate card job roles)
CREATE TABLE IF NOT EXISTS finance_rate_card_roles (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rate_card_id UUID NOT NULL REFERENCES finance_rate_cards(id) ON DELETE CASCADE,
    job_title_id UUID NOT NULL REFERENCES job_titles(id) ON DELETE CASCADE,
    rate         NUMERIC(10,2) DEFAULT 0,
    man_day_rate NUMERIC(10,2) DEFAULT 0,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rate_card_id, job_title_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_rate_card_roles_rate_card_id
    ON finance_rate_card_roles(rate_card_id);

CREATE INDEX IF NOT EXISTS idx_finance_rate_card_roles_job_title_id
    ON finance_rate_card_roles(job_title_id);

-- 3. finance_project_rate_card_roles (project-level rate card roles)
CREATE TABLE IF NOT EXISTS finance_project_rate_card_roles (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    job_title_id UUID NOT NULL REFERENCES job_titles(id) ON DELETE CASCADE,
    rate         NUMERIC(10,2) DEFAULT 0,
    man_day_rate NUMERIC(10,2) DEFAULT 0,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, job_title_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_project_rate_card_roles_project_id
    ON finance_project_rate_card_roles(project_id);

CREATE INDEX IF NOT EXISTS idx_finance_project_rate_card_roles_job_title_id
    ON finance_project_rate_card_roles(job_title_id);

-- 4. Add project_rate_card_role_id column to project_members
ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS project_rate_card_role_id UUID
    REFERENCES finance_project_rate_card_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_members_rate_card_role_id
    ON project_members(project_rate_card_role_id);

COMMIT;
