'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS proof_reader_access (
        id         UUID                     DEFAULT uuid_generate_v4() NOT NULL,
        team_id    UUID                                                NOT NULL,
        user_id    UUID                                                NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
        CONSTRAINT proof_reader_access_pk PRIMARY KEY (id),
        CONSTRAINT proof_reader_access_team_user_unique UNIQUE (team_id, user_id),
        CONSTRAINT proof_reader_access_team_id_fk FOREIGN KEY (team_id) REFERENCES teams ON DELETE CASCADE,
        CONSTRAINT proof_reader_access_user_id_fk FOREIGN KEY (user_id) REFERENCES users ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_proof_reader_access_team_id ON proof_reader_access (team_id);
    CREATE INDEX IF NOT EXISTS idx_proof_reader_access_user_id ON proof_reader_access (user_id);

    CREATE TABLE IF NOT EXISTS proof_reader_settings (
        id          UUID                     DEFAULT uuid_generate_v4() NOT NULL,
        team_id     UUID                                                NOT NULL,
        main_prompt TEXT                     DEFAULT ''                  NOT NULL,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
        CONSTRAINT proof_reader_settings_pk PRIMARY KEY (id),
        CONSTRAINT proof_reader_settings_team_unique UNIQUE (team_id),
        CONSTRAINT proof_reader_settings_team_id_fk FOREIGN KEY (team_id) REFERENCES teams ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS proof_reader_sub_prompts (
        id         UUID                     DEFAULT uuid_generate_v4() NOT NULL,
        team_id    UUID                                                NOT NULL,
        title      VARCHAR(200)                                        NOT NULL,
        prompt     TEXT                                                NOT NULL,
        is_active  BOOLEAN                  DEFAULT TRUE               NOT NULL,
        sort_order INTEGER                  DEFAULT 0                  NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
        CONSTRAINT proof_reader_sub_prompts_pk PRIMARY KEY (id),
        CONSTRAINT proof_reader_sub_prompts_team_id_fk FOREIGN KEY (team_id) REFERENCES teams ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_proof_reader_sub_prompts_team_id ON proof_reader_sub_prompts (team_id, sort_order);

    CREATE TABLE IF NOT EXISTS proof_reader_reviews (
        id            UUID                     DEFAULT uuid_generate_v4() NOT NULL,
        team_id       UUID                                                NOT NULL,
        created_by    UUID                                                NOT NULL,
        file_name     VARCHAR(255)                                        NOT NULL,
        storage_key   TEXT                                                NOT NULL,
        status        VARCHAR(20)              DEFAULT 'pending'          NOT NULL,
        error_message TEXT,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  NOT NULL,
        CONSTRAINT proof_reader_reviews_pk PRIMARY KEY (id),
        CONSTRAINT proof_reader_reviews_status_check CHECK (status IN ('pending', 'completed', 'failed')),
        CONSTRAINT proof_reader_reviews_team_id_fk FOREIGN KEY (team_id) REFERENCES teams ON DELETE CASCADE,
        CONSTRAINT proof_reader_reviews_created_by_fk FOREIGN KEY (created_by) REFERENCES users ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_proof_reader_reviews_team_id ON proof_reader_reviews (team_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS proof_reader_results (
        id         UUID    DEFAULT uuid_generate_v4() NOT NULL,
        review_id  UUID                               NOT NULL,
        label      VARCHAR(200)                       NOT NULL,
        note       TEXT                               NOT NULL,
        sort_order INTEGER DEFAULT 0                  NOT NULL,
        CONSTRAINT proof_reader_results_pk PRIMARY KEY (id),
        CONSTRAINT proof_reader_results_review_id_fk FOREIGN KEY (review_id) REFERENCES proof_reader_reviews ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_proof_reader_results_review_id ON proof_reader_results (review_id, sort_order);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS proof_reader_results;
    DROP TABLE IF EXISTS proof_reader_reviews;
    DROP TABLE IF EXISTS proof_reader_sub_prompts;
    DROP TABLE IF EXISTS proof_reader_settings;
    DROP TABLE IF EXISTS proof_reader_access;
  `);
};
