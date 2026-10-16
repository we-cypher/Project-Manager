import { randomUUID } from "crypto";

import db from "../config/db";
import HandleExceptions from "../decorators/handle-exceptions";
import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import { ServerResponse } from "../models/server-response";
import { userHasProofReaderAccess } from "../middlewares/validators/require-proof-reader-access";
import { reviewCreative, ProofReaderNote } from "../services/proof-reader-openai";
import { hasTeamAdminPrivileges } from "../shared/team-permissions";
import { getPublicUrl, uploadBuffer } from "../shared/storage";
import { log_error } from "../shared/utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROMPT_LENGTH = 8000;
const MAX_SUB_PROMPT_LENGTH = 4000;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

interface ReviewRow {
  id: string;
  file_name: string;
  storage_key: string;
  status: "pending" | "completed" | "failed";
  error_message: string | null;
  created_at: Date | string;
  created_by: string;
  created_by_name: string;
}

interface ResultRow {
  id: string;
  review_id: string;
  label: string;
  note: string;
  sort_order: number;
}

const ACCESS_MEMBERS_SQL = `
  SELECT
    u.id AS user_id,
    u.name,
    u.email,
    r.name AS role_name,
    (COALESCE(r.owner, FALSE) OR r.name IN ('Owner', 'Admin')) AS always_allowed,
    (
      COALESCE(r.owner, FALSE)
      OR r.name IN ('Owner', 'Admin')
      OR EXISTS (
        SELECT 1
        FROM proof_reader_access pra
        WHERE pra.team_id = tm.team_id
          AND pra.user_id = u.id
      )
    ) AS granted
  FROM team_members tm
  JOIN users u ON u.id = tm.user_id
  JOIN roles r ON r.id = tm.role_id
  WHERE tm.team_id = $1
    AND COALESCE(tm.active, TRUE) = TRUE
    AND u.is_deleted = FALSE
  ORDER BY u.name ASC
`;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function displayFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || "creative";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  return (cleaned || "creative").slice(0, 255);
}

function storageFileName(name: string, mimeType: string): string {
  const extension = ALLOWED_IMAGE_TYPES[mimeType] || "img";
  const base = displayFileName(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const withExtension = base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
  return withExtension.slice(0, 180);
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

export default class ProofReaderController {
  @HandleExceptions()
  public static async getMyAccess(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId || !userId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    if (hasTeamAdminPrivileges(req.user)) {
      return res.status(200).send(new ServerResponse(true, { can_access: true }));
    }

    const granted = await userHasProofReaderAccess(userId, teamId);
    return res.status(200).send(new ServerResponse(true, { can_access: granted }));
  }

  @HandleExceptions()
  public static async getAccessMembers(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(ACCESS_MEMBERS_SQL, [teamId]);
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async updateAccess(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const rawIds = req.body?.user_ids;
    if (!Array.isArray(rawIds)) {
      return res.status(400).send(new ServerResponse(false, null, "user_ids must be an array"));
    }

    const userIds = [...new Set(rawIds.map((id: unknown) => String(id)))];
    if (userIds.some(id => !UUID_PATTERN.test(id))) {
      return res.status(400).send(new ServerResponse(false, null, "user_ids must be UUIDs"));
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM proof_reader_access WHERE team_id = $1`, [teamId]);
      if (userIds.length) {
        await client.query(
          `INSERT INTO proof_reader_access (team_id, user_id)
           SELECT $1, u.id
           FROM unnest($2::uuid[]) AS requested(id)
           JOIN team_members tm
             ON tm.user_id = requested.id
            AND tm.team_id = $1
            AND COALESCE(tm.active, TRUE) = TRUE
           JOIN users u ON u.id = tm.user_id AND u.is_deleted = FALSE
           JOIN roles r ON r.id = tm.role_id
           WHERE NOT (COALESCE(r.owner, FALSE) OR r.name IN ('Owner', 'Admin'))
           ON CONFLICT (team_id, user_id) DO NOTHING`,
          [teamId, userIds]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const result = await db.query(ACCESS_MEMBERS_SQL, [teamId]);
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async getSettings(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(
      `SELECT main_prompt FROM proof_reader_settings WHERE team_id = $1`,
      [teamId]
    );
    return res.status(200).send(new ServerResponse(true, { main_prompt: result.rows[0]?.main_prompt || "" }));
  }

  @HandleExceptions()
  public static async updateSettings(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    if (typeof req.body?.main_prompt !== "string" || !req.body.main_prompt.trim()) {
      return res.status(400).send(new ServerResponse(false, null, "Enter a main prompt"));
    }
    const mainPrompt = req.body.main_prompt.trim();
    if (mainPrompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).send(new ServerResponse(false, null, "Main prompt is too long"));
    }

    const result = await db.query(
      `INSERT INTO proof_reader_settings (team_id, main_prompt)
       VALUES ($1, $2)
       ON CONFLICT (team_id)
       DO UPDATE SET main_prompt = EXCLUDED.main_prompt, updated_at = CURRENT_TIMESTAMP
       RETURNING main_prompt`,
      [teamId, mainPrompt]
    );

    return res.status(200).send(new ServerResponse(true, { main_prompt: result.rows[0].main_prompt }));
  }

  @HandleExceptions()
  public static async listSubPrompts(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(
      `SELECT id, title, prompt, is_active, sort_order
       FROM proof_reader_sub_prompts
       WHERE team_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [teamId]
    );
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async createSubPrompt(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const parsed = ProofReaderController.readSubPrompt(req.body);
    if (!parsed) {
      return res.status(400).send(new ServerResponse(false, null, "Enter a title and a prompt"));
    }

    const result = await db.query(
      `INSERT INTO proof_reader_sub_prompts (team_id, title, prompt, is_active, sort_order)
       VALUES (
         $1,
         $2,
         $3,
         $4,
         COALESCE((SELECT MAX(sort_order) + 1 FROM proof_reader_sub_prompts WHERE team_id = $1), 0)
       )
       RETURNING id, title, prompt, is_active, sort_order`,
      [teamId, parsed.title, parsed.prompt, parsed.isActive]
    );

    return res.status(200).send(new ServerResponse(true, result.rows[0]));
  }

  @HandleExceptions()
  public static async updateSubPrompt(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const parsed = ProofReaderController.readSubPrompt(req.body);
    if (!parsed) {
      return res.status(400).send(new ServerResponse(false, null, "Enter a title and a prompt"));
    }

    const result = await db.query(
      `UPDATE proof_reader_sub_prompts
       SET title = $3, prompt = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2
       RETURNING id, title, prompt, is_active, sort_order`,
      [req.params.id, teamId, parsed.title, parsed.prompt, parsed.isActive]
    );

    if (!result.rows[0]) {
      return res.status(404).send(new ServerResponse(false, null, "Sub-prompt not found"));
    }
    return res.status(200).send(new ServerResponse(true, result.rows[0]));
  }

  @HandleExceptions()
  public static async deleteSubPrompt(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(
      `DELETE FROM proof_reader_sub_prompts WHERE id = $1 AND team_id = $2 RETURNING id`,
      [req.params.id, teamId]
    );
    if (!result.rows[0]) {
      return res.status(404).send(new ServerResponse(false, null, "Sub-prompt not found"));
    }
    return res.status(200).send(new ServerResponse(true, { id: result.rows[0].id }));
  }

  @HandleExceptions()
  public static async listReviews(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const reviews = await ProofReaderController.loadReviews(teamId);
    return res.status(200).send(new ServerResponse(true, reviews));
  }

  @HandleExceptions()
  public static async createReview(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId || !userId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const file = (req as IWorkLenzRequest & { file?: UploadedImage }).file;
    if (!file?.buffer?.length) {
      return res.status(400).send(new ServerResponse(false, null, "Upload an image"));
    }
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
      return res.status(400).send(new ServerResponse(false, null, "Upload a PNG, JPEG, WebP, or GIF"));
    }

    const settings = await db.query(
      `SELECT main_prompt FROM proof_reader_settings WHERE team_id = $1`,
      [teamId]
    );
    const mainPrompt = String(settings.rows[0]?.main_prompt || "").trim();
    if (!mainPrompt) {
      return res.status(400).send(new ServerResponse(false, null, "Add a main prompt in Proof Reader settings before uploading."));
    }

    const checksResult = await db.query(
      `SELECT title, prompt
       FROM proof_reader_sub_prompts
       WHERE team_id = $1 AND is_active = TRUE
       ORDER BY sort_order ASC, created_at ASC`,
      [teamId]
    );

    const reviewId = randomUUID();
    const fileName = displayFileName(file.originalname || "creative");
    const storageKey = `proof-reader/${teamId}/${reviewId}/${storageFileName(fileName, file.mimetype)}`;
    const uploaded = await uploadBuffer(file.buffer, file.mimetype, storageKey);
    if (!uploaded) {
      return res.status(500).send(new ServerResponse(false, null, "Could not store the image."));
    }

    await db.query(
      `INSERT INTO proof_reader_reviews (id, team_id, created_by, file_name, storage_key, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [reviewId, teamId, userId, fileName, storageKey]
    );

    try {
      const notes = await reviewCreative({
        imageBuffer: file.buffer,
        mimeType: file.mimetype,
        mainPrompt,
        checks: checksResult.rows.map((row: { title: string; prompt: string }) => ({
          label: row.title,
          prompt: row.prompt,
        })),
      });
      await ProofReaderController.saveNotes(reviewId, notes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The review could not be completed.";
      log_error(`Proof Reader review failed for ${reviewId}: ${message}`);
      await db.query(
        `UPDATE proof_reader_reviews SET status = 'failed', error_message = $2 WHERE id = $1`,
        [reviewId, message.slice(0, 500)]
      );
    }

    const reviews = await ProofReaderController.loadReviews(teamId, reviewId);
    return res.status(200).send(new ServerResponse(true, reviews[0] || null));
  }

  private static readSubPrompt(body: { title?: unknown; prompt?: unknown; is_active?: unknown } | undefined): {
    title: string;
    prompt: string;
    isActive: boolean;
  } | null {
    const title = readText(body?.title, 200);
    const prompt = readText(body?.prompt, MAX_SUB_PROMPT_LENGTH);
    if (!title || !prompt) return null;
    const isActive = typeof body?.is_active === "boolean" ? body.is_active : true;
    return { title, prompt, isActive };
  }

  private static async saveNotes(reviewId: string, notes: ProofReaderNote[]): Promise<void> {
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

  private static async loadReviews(teamId: string, reviewId?: string) {
    const params: string[] = [teamId];
    let filter = "";
    if (reviewId) {
      params.push(reviewId);
      filter = "AND r.id = $2";
    }

    const reviews = await db.query(
      `SELECT r.id, r.file_name, r.storage_key, r.status, r.error_message, r.created_at,
              r.created_by, u.name AS created_by_name
       FROM proof_reader_reviews r
       JOIN users u ON u.id = r.created_by
       WHERE r.team_id = $1
         ${filter}
       ORDER BY r.created_at DESC
       LIMIT 100`,
      params
    );

    const rows = reviews.rows as ReviewRow[];
    if (!rows.length) return [];

    const results = await db.query(
      `SELECT id, review_id, label, note, sort_order
       FROM proof_reader_results
       WHERE review_id = ANY($1::uuid[])
       ORDER BY sort_order ASC`,
      [rows.map(row => row.id)]
    );

    const grouped = new Map<string, ResultRow[]>();
    for (const result of results.rows as ResultRow[]) {
      const list = grouped.get(result.review_id) || [];
      list.push(result);
      grouped.set(result.review_id, list);
    }

    return rows.map(row => ({
      id: row.id,
      file_name: row.file_name,
      image_url: row.storage_key ? getPublicUrl(row.storage_key) : null,
      status: row.status,
      error_message: row.error_message,
      created_at: toIso(row.created_at),
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      results: (grouped.get(row.id) || []).map(result => ({
        id: result.id,
        label: result.label,
        note: result.note,
        sort_order: result.sort_order,
      })),
    }));
  }
}
