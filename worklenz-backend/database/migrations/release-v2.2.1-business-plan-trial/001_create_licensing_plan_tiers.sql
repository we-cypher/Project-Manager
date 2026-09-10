-- Migration: Create licensing_plan_tiers (missing from base open-source schema)
-- Description: Table required by register_user / plan trials (BUSINESS_LARGE)
-- Date: 2026-09-10

CREATE TABLE IF NOT EXISTS licensing_plan_tiers (
    id                  UUID                     DEFAULT uuid_generate_v4() NOT NULL,
    tier_name           TEXT                                                NOT NULL,
    display_name        TEXT                                                NOT NULL,
    trial_duration_days INTEGER,
    trial_enabled       BOOLEAN                  DEFAULT FALSE              NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
    CONSTRAINT licensing_plan_tiers_pk PRIMARY KEY (id),
    CONSTRAINT licensing_plan_tiers_tier_name_key UNIQUE (tier_name)
);

INSERT INTO licensing_plan_tiers (tier_name, display_name, trial_duration_days, trial_enabled)
VALUES
    ('FREE', 'Free', NULL, FALSE),
    ('PRO_SMALL', 'Pro Small', NULL, FALSE),
    ('BUSINESS_SMALL', 'Business Small', NULL, FALSE),
    ('PRO_LARGE', 'Pro Large', NULL, FALSE),
    ('BUSINESS_LARGE', 'Business Large', 7, TRUE),
    ('ENTERPRISE', 'Enterprise', NULL, FALSE)
ON CONFLICT (tier_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    trial_duration_days = COALESCE(licensing_plan_tiers.trial_duration_days, EXCLUDED.trial_duration_days),
    trial_enabled = licensing_plan_tiers.trial_enabled OR EXCLUDED.trial_enabled,
    updated_at = NOW();

COMMENT ON TABLE licensing_plan_tiers IS 'Subscription plan tiers (FREE, PRO_*, BUSINESS_*, ENTERPRISE)';
COMMENT ON COLUMN licensing_plan_tiers.tier_name IS 'Stable machine key matching PlanTier enum';
COMMENT ON COLUMN licensing_plan_tiers.display_name IS 'Human-readable plan name';
COMMENT ON COLUMN licensing_plan_tiers.trial_duration_days IS 'Days for plan-specific trial (NULL = no trial)';
COMMENT ON COLUMN licensing_plan_tiers.trial_enabled IS 'Whether plan-specific trial is available';
