/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS websites (
      id                   UUID                     DEFAULT uuid_generate_v4() NOT NULL,
      team_id              UUID                                                NOT NULL,
      client_id            UUID                                                NOT NULL,
      project_id           UUID,
      name                 TEXT                                                NOT NULL,
      domain               TEXT                                                NOT NULL,
      status               TEXT                     DEFAULT 'active'           NOT NULL,
      domain_managed_by    TEXT                                                NOT NULL,
      domain_provider      TEXT,
      domain_account_email TEXT,
      domain_expiry        DATE,
      hosting_managed_by   TEXT                                                NOT NULL,
      hosting_provider     TEXT,
      hosting_plan         TEXT,
      hosting_expiry       DATE,
      dns_manager          TEXT,
      notes                TEXT,
      credentials_ref      TEXT,
      created_by           UUID,
      created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
      updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
      archived_at          TIMESTAMP WITH TIME ZONE,
      CONSTRAINT websites_pk PRIMARY KEY (id),
      CONSTRAINT websites_team_id_fk FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
      CONSTRAINT websites_client_id_fk FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE RESTRICT,
      CONSTRAINT websites_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
      CONSTRAINT websites_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT websites_status_check CHECK (status = ANY (ARRAY ['active', 'suspended', 'expired', 'archived'])),
      CONSTRAINT websites_domain_managed_by_check CHECK (domain_managed_by = ANY (ARRAY ['us', 'client'])),
      CONSTRAINT websites_hosting_managed_by_check CHECK (hosting_managed_by = ANY (ARRAY ['us', 'client']))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS websites_team_domain_active_uindex
      ON websites (team_id, domain)
      WHERE archived_at IS NULL;

    CREATE INDEX IF NOT EXISTS websites_team_id_idx ON websites (team_id);
    CREATE INDEX IF NOT EXISTS websites_client_id_idx ON websites (client_id);
    CREATE INDEX IF NOT EXISTS websites_domain_expiry_idx ON websites (domain_expiry);
    CREATE INDEX IF NOT EXISTS websites_hosting_expiry_idx ON websites (hosting_expiry);
    CREATE INDEX IF NOT EXISTS websites_status_idx ON websites (status);

    CREATE TABLE IF NOT EXISTS website_renewals (
      id              UUID                     DEFAULT uuid_generate_v4() NOT NULL,
      website_id      UUID                                                NOT NULL,
      team_id         UUID                                                NOT NULL,
      item            TEXT                                                NOT NULL,
      previous_expiry DATE,
      new_expiry      DATE                                                NOT NULL,
      renewed_by      UUID,
      renewed_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
      note            TEXT,
      CONSTRAINT website_renewals_pk PRIMARY KEY (id),
      CONSTRAINT website_renewals_website_id_fk FOREIGN KEY (website_id) REFERENCES websites (id) ON DELETE CASCADE,
      CONSTRAINT website_renewals_team_id_fk FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
      CONSTRAINT website_renewals_renewed_by_fk FOREIGN KEY (renewed_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT website_renewals_item_check CHECK (item = ANY (ARRAY ['domain', 'hosting']))
    );

    CREATE INDEX IF NOT EXISTS website_renewals_website_id_idx ON website_renewals (website_id, renewed_at DESC);

    CREATE TABLE IF NOT EXISTS website_reminder_settings (
      team_id         UUID PRIMARY KEY REFERENCES teams (id) ON DELETE CASCADE,
      task_lead_days  INT                      DEFAULT 30                     NOT NULL,
      intervals_days  INT[]                    DEFAULT '{60,30,14,7,1,0}'     NOT NULL,
      task_project_id UUID,
      timezone        TEXT,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP      NOT NULL,
      updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP      NOT NULL,
      CONSTRAINT website_reminder_settings_task_project_fk FOREIGN KEY (task_project_id) REFERENCES projects (id) ON DELETE SET NULL,
      CONSTRAINT website_reminder_settings_lead_days_check CHECK (task_lead_days >= 0 AND task_lead_days <= 365)
    );

    CREATE TABLE IF NOT EXISTS website_renewal_tasks (
      id          UUID DEFAULT uuid_generate_v4() NOT NULL,
      website_id  UUID                            NOT NULL,
      item        TEXT                            NOT NULL,
      expiry_date DATE                            NOT NULL,
      task_id     UUID                            NOT NULL,
      created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT website_renewal_tasks_pk PRIMARY KEY (id),
      CONSTRAINT website_renewal_tasks_website_fk FOREIGN KEY (website_id) REFERENCES websites (id) ON DELETE CASCADE,
      CONSTRAINT website_renewal_tasks_task_fk FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
      CONSTRAINT website_renewal_tasks_item_check CHECK (item = ANY (ARRAY ['domain', 'hosting'])),
      CONSTRAINT website_renewal_tasks_cycle_uindex UNIQUE (website_id, item, expiry_date)
    );

    CREATE TABLE IF NOT EXISTS website_reminder_log (
      id          UUID                     DEFAULT uuid_generate_v4() NOT NULL,
      website_id  UUID                                                NOT NULL,
      item        TEXT                                                NOT NULL,
      expiry_date DATE                                                NOT NULL,
      days_before INT                                                 NOT NULL,
      sent_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
      CONSTRAINT website_reminder_log_pk PRIMARY KEY (id),
      CONSTRAINT website_reminder_log_website_fk FOREIGN KEY (website_id) REFERENCES websites (id) ON DELETE CASCADE,
      CONSTRAINT website_reminder_log_item_check CHECK (item = ANY (ARRAY ['domain', 'hosting'])),
      CONSTRAINT website_reminder_log_cycle_uindex UNIQUE (website_id, item, expiry_date, days_before)
    );

    ALTER TABLE user_notifications
      ADD COLUMN IF NOT EXISTS website_id UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_website_id_fk'
      ) THEN
        ALTER TABLE user_notifications
          ADD CONSTRAINT user_notifications_website_id_fk
            FOREIGN KEY (website_id) REFERENCES websites (id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_user_notifications_website_id ON user_notifications (website_id);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_user_notifications_website_id;
    ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_website_id_fk;
    ALTER TABLE user_notifications DROP COLUMN IF EXISTS website_id;
    DROP TABLE IF EXISTS website_reminder_log;
    DROP TABLE IF EXISTS website_renewal_tasks;
    DROP TABLE IF EXISTS website_reminder_settings;
    DROP TABLE IF EXISTS website_renewals;
    DROP TABLE IF EXISTS websites;
  `);
};
