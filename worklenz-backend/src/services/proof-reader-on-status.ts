import { randomUUID } from "crypto";

import db from "../config/db";
import { reviewCreative, ProofReaderNote } from "./proof-reader-openai";
import { getKey, readObject, uploadBuffer } from "../shared/storage";
import { log_error, sanitizeCommentContent } from "../shared/utils";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_COMMENT_LENGTH = 5000;
const REVIEW_STATUS_NAMES = new Set(["selfreview", "underreview"]);
const IMAGE_MIME_BY_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const runningTaskIds = new Set<string>();

interface ProofReaderStatusInput {
  taskId: string;
  statusId: string;
  userId: string;
  notify?: (projectId: string, taskId: string) => void;
}

function isReviewStatus(name: string): boolean {
  return REVIEW_STATUS_NAMES.has(name.toLowerCase().replace(/[^a-z]/g, ""));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function clipComment(html: string): string {
  const safe = sanitizeCommentContent(html);
  return safe.length > MAX_COMMENT_LENGTH ? safe.slice(0, MAX_COMMENT_LENGTH) : safe;
}

function resultComment(fileName: string, notes: ProofReaderNote[]): string {
  const blocks = [
    `<p><strong>Proof Reader</strong> checked <strong>${escapeHtml(fileName)}</strong>.</p>`,
  ];
  for (const note of notes) {
    blocks.push(`<p><strong>${escapeHtml(note.label)}</strong><br>${escapeHtml(note.note)}</p>`);
  }
  return clipComment(blocks.join(""));
}

async function postComment(taskId: string, teamId: string, userId: string, content: string): Promise<string | null> {
  const result = await db.query(`SELECT create_task_comment($1) AS comment`, [
    JSON.stringify({
      task_id: taskId,
      user_id: userId,
      team_id: teamId,
      content: clipComment(content),
      mentions: [],
    }),
  ]);
  const commentId = result.rows[0]?.comment?.id as string | undefined;
  if (!commentId) return null;
  await db.query(`UPDATE tasks SET updated_at = NOW() WHERE id = $1`, [taskId]);
  return commentId;
}

async function replaceComment(commentId: string, content: string): Promise<void> {
  await db.query(
    `UPDATE task_comment_contents SET text_content = $2 WHERE comment_id = $1`,
    [commentId, clipComment(content)]
  );
}

/**
 * When a task moves to Self Review or Under Review, proof the newest image
 * attachment with the team's Proof Reader prompt and write the notes back
 * as a task comment.
 */
export function queueProofReaderForTaskStatus(input: ProofReaderStatusInput): void {
  if (runningTaskIds.has(input.taskId)) return;
  runningTaskIds.add(input.taskId);
  void runProofReaderForTaskStatus(input)
    .catch(error => {
      log_error(error);
    })
    .finally(() => {
      runningTaskIds.delete(input.taskId);
    });
}

async function runProofReaderForTaskStatus(input: ProofReaderStatusInput): Promise<void> {
  const task = await db.query(
    `SELECT t.project_id, p.team_id, ts.name AS status_name
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN task_statuses ts ON ts.id = $2
     WHERE t.id = $1`,
    [input.taskId, input.statusId]
  );
  const row = task.rows[0] as { project_id: string; team_id: string; status_name: string } | undefined;
  if (!row || !isReviewStatus(row.status_name)) return;

  const tell = () => input.notify?.(row.project_id, input.taskId);

  const settings = await db.query(
    `SELECT main_prompt FROM proof_reader_settings WHERE team_id = $1`,
    [row.team_id]
  );
  const mainPrompt = String(settings.rows[0]?.main_prompt || "").trim();
  if (!mainPrompt) {
    await postComment(
      input.taskId,
      row.team_id,
      input.userId,
      "<p><strong>Proof Reader</strong> did not run. Add a main prompt in Proof Reader settings, then move the task to Self Review or Under Review again.</p>"
    );
    tell();
    return;
  }

  const attachment = await db.query(
    `SELECT id, name, size, type
     FROM task_attachments
     WHERE task_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [input.taskId]
  );
  const images = (attachment.rows as Array<{ id: string; name: string; size: string | number; type: string }>)
    .filter(file => IMAGE_MIME_BY_TYPE[String(file.type || "").toLowerCase()]);
  const latest = images.find(file => Number(file.size) <= MAX_IMAGE_BYTES);
  if (!latest) {
    const message = images.length
      ? "<p><strong>Proof Reader</strong> did not run. The image attachment is larger than 8 MB.</p>"
      : "<p><strong>Proof Reader</strong> did not run. Attach a PNG, JPEG, WebP, or GIF, then move the task to Self Review or Under Review again.</p>";
    await postComment(input.taskId, row.team_id, input.userId, message);
    tell();
    return;
  }

  const mimeType = IMAGE_MIME_BY_TYPE[latest.type.toLowerCase()];
  const source = await readObject(getKey(row.team_id, row.project_id, latest.id, latest.type));
  if (!source?.buffer?.length) {
    await postComment(
      input.taskId,
      row.team_id,
      input.userId,
      `<p><strong>Proof Reader</strong> could not read <strong>${escapeHtml(latest.name)}</strong>.</p>`
    );
    tell();
    return;
  }

  const checks = await db.query(
    `SELECT title, prompt
     FROM proof_reader_sub_prompts
     WHERE team_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, created_at ASC`,
    [row.team_id]
  );

  const reviewId = randomUUID();
  const storageKey = `proof-reader/${row.team_id}/${reviewId}/${latest.id}.${latest.type.replace(/[^a-z0-9]/gi, "") || "img"}`;
  const uploaded = await uploadBuffer(source.buffer, mimeType, storageKey);
  if (!uploaded) {
    await postComment(
      input.taskId,
      row.team_id,
      input.userId,
      "<p><strong>Proof Reader</strong> could not store the image.</p>"
    );
    tell();
    return;
  }

  await db.query(
    `INSERT INTO proof_reader_reviews (id, team_id, created_by, file_name, storage_key, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')`,
    [reviewId, row.team_id, input.userId, latest.name.slice(0, 255), storageKey]
  );

  const commentId = await postComment(
    input.taskId,
    row.team_id,
    input.userId,
    `<p><strong>Proof Reader</strong> is checking <strong>${escapeHtml(latest.name)}</strong>.</p>`
  );
  tell();

  try {
    const notes = await reviewCreative({
      imageBuffer: source.buffer,
      mimeType,
      mainPrompt,
      checks: checks.rows.map((check: { title: string; prompt: string }) => ({
        label: check.title,
        prompt: check.prompt,
      })),
    });
    await saveNotes(reviewId, notes);
    if (commentId) await replaceComment(commentId, resultComment(latest.name, notes));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The review could not be completed.";
    log_error(`Proof Reader status review failed for ${reviewId}: ${message}`);
    await db.query(
      `UPDATE proof_reader_reviews SET status = 'failed', error_message = $2 WHERE id = $1`,
      [reviewId, message.slice(0, 500)]
    );
    if (commentId) {
      await replaceComment(
        commentId,
        `<p><strong>Proof Reader</strong> could not check <strong>${escapeHtml(latest.name)}</strong>. ${escapeHtml(message.slice(0, 300))}</p>`
      );
    }
  }

  tell();
}

async function saveNotes(reviewId: string, notes: ProofReaderNote[]): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index];
      await client.query(
        `INSERT INTO proof_reader_results (review_id, label, note, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [reviewId, note.label, note.note, index]
      );
    }
    await client.query(
      `UPDATE proof_reader_reviews SET status = 'completed', error_message = NULL WHERE id = $1`,
      [reviewId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
