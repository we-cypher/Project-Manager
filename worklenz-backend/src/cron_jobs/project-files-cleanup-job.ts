import { CronJob } from "cron";
import { PoolClient } from "pg";

import db from "../config/db";
import { log_error } from "../shared/utils";
import { deleteObject, getProjectFileStorageKey } from "../shared/storage";

// Run every 15 minutes by default. Overridable for testing.
const TIME = process.env.PROJECT_FILES_CLEANUP_INTERVAL || "*/15 * * * *";

// Pending presign records older than this are considered orphaned. Must be at
// least as long as the presigned URL validity (15 min) plus the confirm grace
// window (PRESIGN_EXPIRY_MS, 20 min in the controller) so we never delete a
// record a slow-but-legitimate upload is still working through.
const STALE_PENDING_MINUTES = 30;

// Cap how many orphans we touch per tick so a large backlog can't block the DB.
const MAX_CLEANUP_PER_TICK = 200;

// Advisory lock ID to prevent concurrent execution across instances.
const ADVISORY_LOCK_ID = 900200;

const log = (value: string) => console.log("project-files-cleanup-job:", value);

async function acquireAdvisoryLock(client: PoolClient): Promise<boolean> {
  const result = await client.query("SELECT pg_try_advisory_lock($1) AS acquired;", [
    ADVISORY_LOCK_ID,
  ]);
  return result.rows[0]?.acquired === true;
}

async function releaseAdvisoryLock(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_unlock($1);", [ADVISORY_LOCK_ID]);
}

let tableVerified = false;

async function ensureTableExists(client: PoolClient): Promise<boolean> {
  if (tableVerified) return true;
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'project_files'
     ) AS exists;`
  );
  if (!result.rows[0]?.exists) {
    log("project_files table does not exist yet, skipping cleanup tick.");
    return false;
  }

  const colCheck = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'project_files' AND column_name = 'status'
     ) AS exists;`
  );
  if (!colCheck.rows[0]?.exists) {
    log("project_files.status column does not exist yet, skipping cleanup tick.");
    return false;
  }

  tableVerified = true;
  return true;
}

async function onCleanupTick(): Promise<void> {
  let locked = false;
  let lockClient: PoolClient | null = null;
  try {
    lockClient = await db.pool.connect();
    locked = await acquireAdvisoryLock(lockClient);
    if (!locked) return;

    if (!await ensureTableExists(lockClient)) return;

    const staleResult = await lockClient.query(
      `SELECT id, team_id, project_id, type
       FROM project_files
       WHERE status = 'pending'
         AND created_at < (NOW() - ($1 || ' minutes')::interval)
       ORDER BY created_at ASC
       LIMIT $2;`,
      [STALE_PENDING_MINUTES, MAX_CLEANUP_PER_TICK],
    );

    if (!staleResult.rowCount) return;

    const ids: string[] = [];
    for (const row of staleResult.rows) {
      ids.push(row.id);
      // The object may or may not exist (the browser may have uploaded but
      // never confirmed). deleteObject is a no-op/log on a missing key.
      const storageKey = getProjectFileStorageKey(
        row.team_id,
        row.project_id,
        row.id,
        row.type,
      );
      void deleteObject(storageKey);
    }

    await lockClient.query("DELETE FROM project_files WHERE id = ANY($1::uuid[]);", [ids]);

    log(`Cleaned up ${ids.length} orphaned pending upload record(s).`);
  } catch (error) {
    log_error(error);
  } finally {
    if (locked && lockClient) {
      try {
        await releaseAdvisoryLock(lockClient);
      } catch (error) {
        log_error(error);
      }
    }
    lockClient?.release();
  }
}

export function startProjectFilesCleanupJob() {
  log("(cron) Project files cleanup job ready.");
  const job = new CronJob(TIME, () => void onCleanupTick(), null, true);
  job.start();
}
