'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE
      col_type TEXT;
    BEGIN
      SELECT data_type
      INTO col_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name = 'team_member_limit_override';

      IF col_type IN ('integer', 'smallint', 'bigint', 'numeric') THEN
        ALTER TABLE organizations
          ALTER COLUMN team_member_limit_override DROP DEFAULT;

        ALTER TABLE organizations
          ALTER COLUMN team_member_limit_override TYPE BOOLEAN
          USING (
            COALESCE(team_member_limit_override, 0) <> 0
          );
      END IF;
    END
    $$;

    ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS team_member_limit_override BOOLEAN DEFAULT TRUE;

    ALTER TABLE organizations
      ALTER COLUMN team_member_limit_override SET DEFAULT TRUE;

    UPDATE organizations
    SET team_member_limit_override = TRUE
    WHERE team_member_limit_override IS DISTINCT FROM TRUE;

    ALTER TABLE organizations
      ALTER COLUMN team_member_limit_override SET NOT NULL;

    COMMENT ON COLUMN organizations.team_member_limit_override IS
      'When TRUE, team member seat limits are not enforced. Default TRUE on this self-hosted deployment.';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    ALTER TABLE organizations
      ALTER COLUMN team_member_limit_override SET DEFAULT FALSE;

    UPDATE organizations
    SET team_member_limit_override = FALSE
    WHERE team_member_limit_override IS DISTINCT FROM FALSE;
  `);
};
