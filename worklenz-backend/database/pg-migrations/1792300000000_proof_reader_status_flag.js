'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE task_statuses
      ADD COLUMN IF NOT EXISTS proof_reader_enabled BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE proof_reader_settings
      ADD COLUMN IF NOT EXISTS status_review_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    ALTER TABLE task_statuses DROP COLUMN IF EXISTS proof_reader_enabled;
    ALTER TABLE proof_reader_settings DROP COLUMN IF EXISTS status_review_enabled;
  `);
};
