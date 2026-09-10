#!/bin/bash
set -e

echo "Starting database initialization..."

SQL_DIR="/docker-entrypoint-initdb.d/sql"
MIGRATIONS_DIR="/docker-entrypoint-initdb.d/migrations"
BACKUP_DIR="/docker-entrypoint-initdb.d/pg_backups"

# --------------------------------------------
# 🗄️ STEP 1: Attempt to restore latest backup
# --------------------------------------------

if [ -d "$BACKUP_DIR" ]; then
  LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | head -n 1)
else
  LATEST_BACKUP=""
fi

if [ -f "$LATEST_BACKUP" ]; then
  echo "🗄️ Found latest backup: $LATEST_BACKUP"
  echo "⏳ Restoring from backup..."
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$LATEST_BACKUP"
  echo "✅ Backup restoration complete. Skipping schema and migrations."
  exit 0
else
  echo "ℹ️ No valid backup found. Proceeding with base schema and migrations."
fi

# --------------------------------------------
# 🏗️ STEP 2: Continue with base schema setup
# --------------------------------------------

# Create migrations table if it doesn't exist
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT now()
  );
"

# List of base schema files to execute in order
BASE_SQL_FILES=(
  "0_extensions.sql"
  "1_tables.sql"
  "indexes.sql"
  "4_functions.sql"
  "triggers.sql"
  "3_views.sql"
  "2_dml.sql"
  "5_database_user.sql"
)

echo "Running base schema SQL files in order..."

for file in "${BASE_SQL_FILES[@]}"; do
  full_path="$SQL_DIR/$file"
  if [ -f "$full_path" ]; then
    echo "Executing $file..."
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$full_path"
  else
    echo "WARNING: $file not found, skipping."
  fi
done

echo "✅ Base schema SQL execution complete."

# --------------------------------------------
# 🚀 STEP 3: Apply SQL migrations
# --------------------------------------------

# Release subdirectories must run before the top-level migrations, which assume
# tables such as client_users and import_jobs already exist. Version order is
# explicit because filenames alone do not sort into a dependency-safe sequence.
ORDERED_MIGRATION_DIRS=(
  "release-2.1.2"
  "release-v2.1.4"
  "release-v2.2.0"
  "release-v2.2.1-business-plan-trial"
  "release-v2.2.2-team-lead-role"
  "release-v2.2.3"
  "release-v2.3.0"
  "release-v2.3.1"
  "release-v2.4"
  "release-v2.5"
  "release-v2.6"
  "import-tasks"
)

apply_migration_file() {
  local file="$1"
  local version="${file#"$MIGRATIONS_DIR"/}"

  if psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM schema_migrations WHERE version = '$version'" | grep -q 1; then
    echo "Skipping already applied migration: $version"
    return
  fi

  echo "Applying migration: $version"
  if ! psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$file"; then
    echo "ERROR: Migration failed: $version"
    exit 1
  fi
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "INSERT INTO schema_migrations (version) VALUES ('$version');"
}

apply_migration_dir() {
  local dir="$1"
  if [ ! -d "$dir" ] || ! compgen -G "$dir/*.sql" > /dev/null; then
    return
  fi
  while IFS= read -r file; do
    apply_migration_file "$file"
  done < <(find "$dir" -maxdepth 1 -type f -name "*.sql" | sort)
}

if [ -d "$MIGRATIONS_DIR" ]; then
  echo "Applying migrations..."

  applied_dirs=()
  for dir in "${ORDERED_MIGRATION_DIRS[@]}"; do
    apply_migration_dir "$MIGRATIONS_DIR/$dir"
    applied_dirs+=("$MIGRATIONS_DIR/$dir")
  done

  # Any subdirectory added later still runs, after the known release order.
  while IFS= read -r dir; do
    for known in "${applied_dirs[@]}"; do
      if [ "$dir" = "$known" ]; then
        continue 2
      fi
    done
    apply_migration_dir "$dir"
  done < <(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d | sort)

  apply_migration_dir "$MIGRATIONS_DIR"

  echo "✅ Migration execution complete."
else
  echo "No migrations directory found, skipping migrations."
fi

echo "🎉 Database initialization completed successfully."
