import db from "../config/db";
import HandleExceptions from "../decorators/handle-exceptions";
import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import { ServerResponse } from "../models/server-response";
import WorklenzControllerBase from "./worklenz-controller-base";
import { ensureSalesAccessTable } from "../shared/ensure-sales-access-table";
import { hasTeamAdminPrivileges } from "../shared/team-permissions";
import { LOG_DESCRIPTIONS } from "../shared/constants";
import { generateProjectKey } from "../utils/generate-project-key";
import { getOrgBaseCurrency } from "../shared/org-currency";
import { DEFAULT_CURRENCY } from "../shared/brand";

const DEAL_TYPES = ["service", "saas"] as const;
const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
const SOURCES = ["website", "referral", "cold", "existing", "other"] as const;
const ACTIVITY_TYPES = ["call", "meeting", "task", "note", "reminder"] as const;
const PRODUCT_KINDS = ["service", "saas"] as const;
const ONBOARDING_TYPES = ["meeting", "task"] as const;

const DEAL_SELECT = `
  d.id,
  d.team_id,
  d.name,
  d.deal_type,
  d.stage,
  d.source,
  d.client_id,
  d.product_id,
  d.contact_name,
  d.contact_email,
  d.contact_phone,
  d.budget,
  d.amount,
  d.currency,
  d.owner_id,
  d.expected_close_date,
  d.lost_reason,
  d.notes,
  d.project_id,
  d.onboarding_applied,
  d.created_by,
  d.created_at,
  d.updated_at,
  c.name AS client_name,
  p.name AS product_name,
  p.kind AS product_kind,
  u.name AS owner_name,
  pr.name AS project_name,
  (
    SELECT a.due_at
    FROM sales_deal_activities a
    WHERE a.deal_id = d.id
      AND a.completed_at IS NULL
      AND a.due_at IS NOT NULL
    ORDER BY a.due_at ASC
    LIMIT 1
  ) AS next_due_at,
  (
    SELECT a.title
    FROM sales_deal_activities a
    WHERE a.deal_id = d.id
      AND a.completed_at IS NULL
      AND a.due_at IS NOT NULL
    ORDER BY a.due_at ASC
    LIMIT 1
  ) AS next_due_title
`;

const DEFAULT_PRODUCTS: Array<{
  name: string;
  kind: "saas" | "service";
  steps: Array<{ title: string; activity_type: "meeting" | "task" }>;
}> = [
  {
    name: "Product A",
    kind: "saas",
    steps: [
      { title: "Kickoff call", activity_type: "meeting" },
      { title: "Create tenant", activity_type: "task" },
      { title: "Invite admin", activity_type: "task" },
      { title: "Walkthrough", activity_type: "meeting" },
    ],
  },
  {
    name: "Product B",
    kind: "saas",
    steps: [
      { title: "Kickoff", activity_type: "meeting" },
      { title: "Pick plan", activity_type: "task" },
      { title: "Data import", activity_type: "task" },
      { title: "Training", activity_type: "meeting" },
    ],
  },
  {
    name: "Custom build",
    kind: "service",
    steps: [],
  },
];

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function parseMoney(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export default class SalesController extends WorklenzControllerBase {
  private static async ensureDefaultProducts(teamId: string): Promise<void> {
    const existing = await db.query(
      `SELECT COUNT(*)::INTEGER AS count FROM sales_deal_products WHERE team_id = $1`,
      [teamId]
    );
    if ((existing.rows[0]?.count ?? 0) > 0) return;

    for (const product of DEFAULT_PRODUCTS) {
      const inserted = await db.query(
        `INSERT INTO sales_deal_products (team_id, name, kind)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [teamId, product.name, product.kind]
      );
      const productId = inserted.rows[0]?.id as string | undefined;
      if (!productId) continue;
      for (let index = 0; index < product.steps.length; index++) {
        const step = product.steps[index];
        await db.query(
          `INSERT INTO sales_onboarding_steps (product_id, title, activity_type, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [productId, step.title, step.activity_type, index]
        );
      }
    }
  }

  private static async getDealRow(dealId: string, teamId: string) {
    const result = await db.query(
      `SELECT ${DEAL_SELECT}
       FROM sales_deals d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN sales_deal_products p ON p.id = d.product_id
       LEFT JOIN users u ON u.id = d.owner_id
       LEFT JOIN projects pr ON pr.id = d.project_id
       WHERE d.id = $1 AND d.team_id = $2`,
      [dealId, teamId]
    );
    return result.rows[0] || null;
  }

  private static async resolveClientId(
    teamId: string,
    clientId: string | null,
    contactName: string | null,
    contactEmail: string | null,
    contactPhone: string | null
  ): Promise<string | null> {
    if (clientId) {
      const existing = await db.query(
        `SELECT id FROM clients WHERE id = $1 AND team_id = $2`,
        [clientId, teamId]
      );
      if (existing.rows[0]?.id) return existing.rows[0].id as string;
    }

    const name = contactName?.trim();
    if (!name) return clientId;

    const found = await db.query(
      `SELECT id FROM clients WHERE team_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [teamId, name]
    );
    if (found.rows[0]?.id) return found.rows[0].id as string;

    const created = await db.query(
      `INSERT INTO clients (name, team_id, email, phone, contact_person, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [name, teamId, contactEmail, contactPhone, name]
    );
    return (created.rows[0]?.id as string) || null;
  }

  @HandleExceptions()
  public static async getDeals(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const search = ((req.query.search as string) || "").trim();
    const stage = req.query.stage as string | undefined;
    const dealType = req.query.deal_type as string | undefined;
    const productId = req.query.product_id as string | undefined;

    const params: Array<string> = [teamId];
    const filters: string[] = ["d.team_id = $1"];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(d.name ILIKE $${params.length} OR c.name ILIKE $${params.length} OR d.contact_name ILIKE $${params.length})`);
    }
    if (stage && isOneOf(stage, STAGES)) {
      params.push(stage);
      filters.push(`d.stage = $${params.length}`);
    }
    if (dealType && isOneOf(dealType, DEAL_TYPES)) {
      params.push(dealType);
      filters.push(`d.deal_type = $${params.length}`);
    }
    if (productId) {
      params.push(productId);
      filters.push(`d.product_id = $${params.length}`);
    }

    const result = await db.query(
      `SELECT ${DEAL_SELECT}
       FROM sales_deals d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN sales_deal_products p ON p.id = d.product_id
       LEFT JOIN users u ON u.id = d.owner_id
       LEFT JOIN projects pr ON pr.id = d.project_id
       WHERE ${filters.join(" AND ")}
       ORDER BY d.updated_at DESC`,
      params
    );

    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async getDealById(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    if (!deal) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));
    return res.status(200).send(new ServerResponse(true, deal));
  }

  @HandleExceptions()
  public static async createDeal(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id || null;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const name = emptyToNull(req.body.name);
    if (!name) return res.status(400).send(new ServerResponse(false, null, "Deal name is required"));

    const dealType = isOneOf(req.body.deal_type, DEAL_TYPES) ? req.body.deal_type : "service";
    const stage = isOneOf(req.body.stage, STAGES) ? req.body.stage : "new";
    const source = isOneOf(req.body.source, SOURCES) ? req.body.source : "other";
    const contactName = emptyToNull(req.body.contact_name);
    const contactEmail = emptyToNull(req.body.contact_email);
    const contactPhone = emptyToNull(req.body.contact_phone);
    const productId = emptyToNull(req.body.product_id);

    if (dealType === "saas" && !productId) {
      return res.status(400).send(new ServerResponse(false, null, "A product is required for SaaS deals"));
    }

    const clientId = await SalesController.resolveClientId(
      teamId,
      emptyToNull(req.body.client_id),
      contactName,
      contactEmail,
      contactPhone
    );

    const result = await db.query(
      `INSERT INTO sales_deals (
         team_id, name, deal_type, stage, source, client_id, product_id,
         contact_name, contact_email, contact_phone, budget, amount, currency,
         owner_id, expected_close_date, notes, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17
       ) RETURNING id`,
      [
        teamId,
        name,
        dealType,
        stage,
        source,
        clientId,
        productId,
        contactName,
        contactEmail,
        contactPhone,
        parseMoney(req.body.budget),
        parseMoney(req.body.amount),
        emptyToNull(req.body.currency) || (await getOrgBaseCurrency(teamId)),
        emptyToNull(req.body.owner_id) || userId,
        emptyToNull(req.body.expected_close_date),
        emptyToNull(req.body.notes),
        userId,
      ]
    );

    const deal = await SalesController.getDealRow(result.rows[0].id, teamId);
    return res.status(200).send(new ServerResponse(true, deal));
  }

  @HandleExceptions()
  public static async updateDeal(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const existing = await SalesController.getDealRow(req.params.id, teamId);
    if (!existing) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));

    const name = emptyToNull(req.body.name) || existing.name;
    const dealType = isOneOf(req.body.deal_type, DEAL_TYPES) ? req.body.deal_type : existing.deal_type;
    const source = isOneOf(req.body.source, SOURCES) ? req.body.source : existing.source;
    const contactName = req.body.contact_name !== undefined ? emptyToNull(req.body.contact_name) : existing.contact_name;
    const contactEmail = req.body.contact_email !== undefined ? emptyToNull(req.body.contact_email) : existing.contact_email;
    const contactPhone = req.body.contact_phone !== undefined ? emptyToNull(req.body.contact_phone) : existing.contact_phone;
    const productId = req.body.product_id !== undefined ? emptyToNull(req.body.product_id) : existing.product_id;

    if (dealType === "saas" && !productId) {
      return res.status(400).send(new ServerResponse(false, null, "A product is required for SaaS deals"));
    }

    const clientId = await SalesController.resolveClientId(
      teamId,
      req.body.client_id !== undefined ? emptyToNull(req.body.client_id) : existing.client_id,
      contactName,
      contactEmail,
      contactPhone
    );

    await db.query(
      `UPDATE sales_deals
       SET name = $3,
           deal_type = $4,
           source = $5,
           client_id = $6,
           product_id = $7,
           contact_name = $8,
           contact_email = $9,
           contact_phone = $10,
           budget = $11,
           amount = $12,
           currency = $13,
           owner_id = $14,
           expected_close_date = $15,
           notes = $16,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2`,
      [
        req.params.id,
        teamId,
        name,
        dealType,
        source,
        clientId,
        productId,
        contactName,
        contactEmail,
        contactPhone,
        req.body.budget !== undefined ? parseMoney(req.body.budget) : existing.budget,
        req.body.amount !== undefined ? parseMoney(req.body.amount) : existing.amount,
        emptyToNull(req.body.currency) || existing.currency || (await getOrgBaseCurrency(teamId)),
        req.body.owner_id !== undefined ? emptyToNull(req.body.owner_id) : existing.owner_id,
        req.body.expected_close_date !== undefined
          ? emptyToNull(req.body.expected_close_date)
          : existing.expected_close_date,
        req.body.notes !== undefined ? emptyToNull(req.body.notes) : existing.notes,
      ]
    );

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    return res.status(200).send(new ServerResponse(true, deal));
  }

  @HandleExceptions()
  public static async updateDealStage(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const stage = req.body.stage;
    if (!isOneOf(stage, STAGES)) {
      return res.status(400).send(new ServerResponse(false, null, "Invalid stage"));
    }

    const existing = await SalesController.getDealRow(req.params.id, teamId);
    if (!existing) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));

    const lostReason = stage === "lost" ? emptyToNull(req.body.lost_reason) : null;

    await db.query(
      `UPDATE sales_deals
       SET stage = $3,
           lost_reason = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2`,
      [req.params.id, teamId, stage, lostReason]
    );

    if (stage === "won" && existing.deal_type === "saas" && !existing.onboarding_applied) {
      await SalesController.cloneOnboardingSteps(req.params.id, teamId, existing.product_id, req.user?.id || null);
    }

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    return res.status(200).send(new ServerResponse(true, deal));
  }

  @HandleExceptions()
  public static async deleteDeal(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    if (!hasTeamAdminPrivileges(req.user)) {
      return res.status(403).send(new ServerResponse(false, null, "Only owners or admins can delete deals"));
    }

    const result = await db.query(
      `DELETE FROM sales_deals WHERE id = $1 AND team_id = $2 RETURNING id`,
      [req.params.id, teamId]
    );
    if (!result.rows[0]) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));
    return res.status(200).send(new ServerResponse(true, { id: req.params.id }));
  }

  @HandleExceptions()
  public static async getActivities(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    if (!deal) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));

    const result = await db.query(
      `SELECT a.id,
              a.deal_id,
              a.team_id,
              a.type,
              a.title,
              a.description,
              a.due_at,
              a.completed_at,
              a.assigned_to,
              a.created_by,
              a.created_at,
              a.updated_at,
              u.name AS assigned_to_name,
              c.name AS created_by_name
       FROM sales_deal_activities a
       LEFT JOIN users u ON u.id = a.assigned_to
       LEFT JOIN users c ON c.id = a.created_by
       WHERE a.deal_id = $1 AND a.team_id = $2
       ORDER BY
         CASE WHEN a.completed_at IS NULL THEN 0 ELSE 1 END,
         a.due_at NULLS LAST,
         a.created_at DESC`,
      [req.params.id, teamId]
    );

    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async createActivity(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id || null;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    if (!deal) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));

    const title = emptyToNull(req.body.title);
    if (!title) return res.status(400).send(new ServerResponse(false, null, "Title is required"));

    const type = isOneOf(req.body.type, ACTIVITY_TYPES) ? req.body.type : "task";

    const result = await db.query(
      `INSERT INTO sales_deal_activities (
         deal_id, team_id, type, title, description, due_at, assigned_to, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.params.id,
        teamId,
        type,
        title,
        emptyToNull(req.body.description),
        emptyToNull(req.body.due_at),
        emptyToNull(req.body.assigned_to) || userId,
        userId,
      ]
    );

    const created = await db.query(
      `SELECT a.*, u.name AS assigned_to_name, c.name AS created_by_name
       FROM sales_deal_activities a
       LEFT JOIN users u ON u.id = a.assigned_to
       LEFT JOIN users c ON c.id = a.created_by
       WHERE a.id = $1`,
      [result.rows[0].id]
    );

    return res.status(200).send(new ServerResponse(true, created.rows[0]));
  }

  @HandleExceptions()
  public static async updateActivity(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const existing = await db.query(
      `SELECT * FROM sales_deal_activities WHERE id = $1 AND team_id = $2`,
      [req.params.activityId, teamId]
    );
    const row = existing.rows[0];
    if (!row) return res.status(404).send(new ServerResponse(false, null, "Activity not found"));

    const completed =
      req.body.completed === true
        ? new Date().toISOString()
        : req.body.completed === false
          ? null
          : row.completed_at;

    await db.query(
      `UPDATE sales_deal_activities
       SET title = $3,
           description = $4,
           type = $5,
           due_at = $6,
           assigned_to = $7,
           completed_at = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2`,
      [
        req.params.activityId,
        teamId,
        emptyToNull(req.body.title) || row.title,
        req.body.description !== undefined ? emptyToNull(req.body.description) : row.description,
        isOneOf(req.body.type, ACTIVITY_TYPES) ? req.body.type : row.type,
        req.body.due_at !== undefined ? emptyToNull(req.body.due_at) : row.due_at,
        req.body.assigned_to !== undefined ? emptyToNull(req.body.assigned_to) : row.assigned_to,
        completed,
      ]
    );

    const updated = await db.query(
      `SELECT a.*, u.name AS assigned_to_name, c.name AS created_by_name
       FROM sales_deal_activities a
       LEFT JOIN users u ON u.id = a.assigned_to
       LEFT JOIN users c ON c.id = a.created_by
       WHERE a.id = $1`,
      [req.params.activityId]
    );

    return res.status(200).send(new ServerResponse(true, updated.rows[0]));
  }

  @HandleExceptions()
  public static async deleteActivity(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(
      `DELETE FROM sales_deal_activities WHERE id = $1 AND team_id = $2 RETURNING id`,
      [req.params.activityId, teamId]
    );
    if (!result.rows[0]) return res.status(404).send(new ServerResponse(false, null, "Activity not found"));
    return res.status(200).send(new ServerResponse(true, { id: req.params.activityId }));
  }

  private static async cloneOnboardingSteps(
    dealId: string,
    teamId: string,
    productId: string | null,
    userId: string | null
  ): Promise<number> {
    if (!productId) return 0;

    const already = await db.query(
      `SELECT onboarding_applied FROM sales_deals WHERE id = $1 AND team_id = $2`,
      [dealId, teamId]
    );
    if (already.rows[0]?.onboarding_applied) return 0;

    const steps = await db.query(
      `SELECT title, activity_type, sort_order
       FROM sales_onboarding_steps
       WHERE product_id = $1
       ORDER BY sort_order ASC`,
      [productId]
    );

    for (const step of steps.rows) {
      await db.query(
        `INSERT INTO sales_deal_activities (deal_id, team_id, type, title, assigned_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [dealId, teamId, step.activity_type, step.title, userId, userId]
      );
    }

    await db.query(
      `UPDATE sales_deals
       SET onboarding_applied = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2`,
      [dealId, teamId]
    );

    return steps.rows.length;
  }

  @HandleExceptions()
  public static async applyOnboarding(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    if (!deal) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));
    if (deal.deal_type !== "saas") {
      return res.status(400).send(new ServerResponse(false, null, "Onboarding applies to SaaS deals only"));
    }
    if (!deal.product_id) {
      return res.status(400).send(new ServerResponse(false, null, "Select a product first"));
    }

    const count = await SalesController.cloneOnboardingSteps(
      req.params.id,
      teamId,
      deal.product_id,
      req.user?.id || null
    );
    const updated = await SalesController.getDealRow(req.params.id, teamId);
    return res.status(200).send(new ServerResponse(true, { deal: updated, steps_added: count }));
  }

  @HandleExceptions()
  public static async createProjectFromDeal(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId || !userId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    if (!deal) return res.status(404).send(new ServerResponse(false, null, "Deal not found"));
    if (deal.project_id) {
      return res.status(200).send(new ServerResponse(true, deal, "Project already linked"));
    }

    const existingKeys = (
      await db.query(`SELECT key FROM projects WHERE team_id = $1`, [teamId])
    ).rows.map((row: { key: string }) => row.key).filter(Boolean);

    const statusResult = await db.query(
      `SELECT id FROM sys_project_statuses ORDER BY sort_order ASC NULLS LAST LIMIT 1`
    );
    const healthResult = await db.query(`SELECT id FROM sys_project_healths LIMIT 1`);

    const body = {
      name: emptyToNull(req.body.name) || deal.name,
      notes: deal.notes || "",
      color_code: "#70a6f3",
      team_id: teamId,
      user_id: userId,
      client_name: deal.client_name || deal.contact_name || null,
      status_id: statusResult.rows[0]?.id || null,
      health_id: healthResult.rows[0]?.id || null,
      key: generateProjectKey(emptyToNull(req.body.name) || deal.name, existingKeys),
      project_created_log: LOG_DESCRIPTIONS.PROJECT_CREATED,
      project_member_added_log: LOG_DESCRIPTIONS.PROJECT_MEMBER_ADDED,
    };

    const created = await db.query(`SELECT create_project($1) AS project`, [JSON.stringify(body)]);
    const project = created.rows[0]?.project;
    if (!project?.id) {
      return res.status(400).send(new ServerResponse(false, null, "Could not create project"));
    }

    await db.query(
      `UPDATE projects
       SET budget = $2,
           currency = $3,
           client_id = COALESCE($4, client_id)
       WHERE id = $1`,
      [project.id, parseMoney(deal.budget), deal.currency || DEFAULT_CURRENCY, deal.client_id]
    );

    await db.query(
      `UPDATE sales_deals
       SET project_id = $3,
           stage = 'won',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2`,
      [req.params.id, teamId, project.id]
    );

    const updated = await SalesController.getDealRow(req.params.id, teamId);
    return res.status(200).send(new ServerResponse(true, { deal: updated, project }));
  }

  @HandleExceptions()
  public static async linkProject(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const projectId = emptyToNull(req.body.project_id);
    if (!projectId) return res.status(400).send(new ServerResponse(false, null, "Project is required"));

    const project = await db.query(
      `SELECT id FROM projects WHERE id = $1 AND team_id = $2`,
      [projectId, teamId]
    );
    if (!project.rows[0]) return res.status(404).send(new ServerResponse(false, null, "Project not found"));

    await db.query(
      `UPDATE sales_deals
       SET project_id = $3,
           stage = 'won',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2`,
      [req.params.id, teamId, projectId]
    );

    const deal = await SalesController.getDealRow(req.params.id, teamId);
    return res.status(200).send(new ServerResponse(true, deal));
  }

  @HandleExceptions()
  public static async getProducts(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(
      `SELECT p.id,
              p.team_id,
              p.name,
              p.kind,
              p.created_at,
              p.updated_at,
              COALESCE(
                (
                  SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', s.id,
                    'title', s.title,
                    'activity_type', s.activity_type,
                    'sort_order', s.sort_order
                  ) ORDER BY s.sort_order)
                  FROM sales_onboarding_steps s
                  WHERE s.product_id = p.id
                ),
                '[]'::JSON
              ) AS onboarding_steps
       FROM sales_deal_products p
       WHERE p.team_id = $1
       ORDER BY p.kind DESC, p.name ASC`,
      [teamId]
    );

    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async updateProduct(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const name = emptyToNull(req.body.name);
    if (!name) return res.status(400).send(new ServerResponse(false, null, "Product name is required"));

    const kind = isOneOf(req.body.kind, PRODUCT_KINDS) ? req.body.kind : undefined;

    const result = await db.query(
      `UPDATE sales_deal_products
       SET name = $3,
           kind = COALESCE($4, kind),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_id = $2
       RETURNING id, team_id, name, kind, created_at, updated_at`,
      [req.params.id, teamId, name, kind || null]
    );
    if (!result.rows[0]) return res.status(404).send(new ServerResponse(false, null, "Product not found"));
    return res.status(200).send(new ServerResponse(true, result.rows[0]));
  }

  @HandleExceptions()
  public static async createProduct(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const kind = isOneOf(req.body.kind, PRODUCT_KINDS) ? req.body.kind : "saas";
    const name = emptyToNull(req.body.name) || (kind === "saas" ? "New SaaS product" : "New service");

    const result = await db.query(
      `INSERT INTO sales_deal_products (team_id, name, kind)
       VALUES ($1, $2, $3)
       RETURNING id, team_id, name, kind, created_at, updated_at`,
      [teamId, name, kind]
    );

    return res.status(200).send(new ServerResponse(true, { ...result.rows[0], onboarding_steps: [] }));
  }

  @HandleExceptions()
  public static async deleteProduct(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(
      `DELETE FROM sales_deal_products WHERE id = $1 AND team_id = $2 RETURNING id`,
      [req.params.id, teamId]
    );
    if (!result.rows[0]) return res.status(404).send(new ServerResponse(false, null, "Product not found"));
    return res.status(200).send(new ServerResponse(true, { id: req.params.id }));
  }

  @HandleExceptions()
  public static async replaceOnboardingSteps(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const product = await db.query(
      `SELECT id FROM sales_deal_products WHERE id = $1 AND team_id = $2`,
      [req.params.id, teamId]
    );
    if (!product.rows[0]) return res.status(404).send(new ServerResponse(false, null, "Product not found"));

    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];

    await db.query(`DELETE FROM sales_onboarding_steps WHERE product_id = $1`, [req.params.id]);

    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      const title = emptyToNull(step?.title);
      if (!title) continue;
      const activityType = isOneOf(step?.activity_type, ONBOARDING_TYPES) ? step.activity_type : "task";
      await db.query(
        `INSERT INTO sales_onboarding_steps (product_id, title, activity_type, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, title, activityType, index]
      );
    }

    const saved = await db.query(
      `SELECT id, title, activity_type, sort_order
       FROM sales_onboarding_steps
       WHERE product_id = $1
       ORDER BY sort_order ASC`,
      [req.params.id]
    );

    return res.status(200).send(new ServerResponse(true, saved.rows));
  }

  @HandleExceptions()
  public static async getOwners(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const result = await db.query(
      `SELECT u.id, u.name, u.email
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
         AND COALESCE(tm.active, TRUE) = TRUE
         AND u.is_deleted = FALSE
       ORDER BY u.name ASC`,
      [teamId]
    );

    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async getProjectsLookup(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId || !userId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const search = ((req.query.search as string) || "").trim();
    const params: Array<string> = [teamId, userId];
    let searchSql = "";
    if (search) {
      params.push(`%${search}%`);
      searchSql = `AND p.name ILIKE $3`;
    }

    const result = await db.query(
      `SELECT p.id, p.name
       FROM projects p
       WHERE p.team_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM archived_projects ap
           WHERE ap.project_id = p.id AND ap.user_id = $2
         )
         ${searchSql}
       ORDER BY p.name ASC
       LIMIT 50`,
      params
    );

    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  private static readonly SALES_ACCESS_MEMBERS_SQL = `
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
          FROM sales_access sa
          WHERE sa.team_id = tm.team_id
            AND sa.user_id = u.id
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

  @HandleExceptions()
  public static async getMyAccess(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId || !userId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    await ensureSalesAccessTable();

    if (hasTeamAdminPrivileges(req.user)) {
      return res.status(200).send(new ServerResponse(true, { can_access: true }));
    }

    const result = await db.query(
      `SELECT EXISTS(
         SELECT 1 FROM sales_access WHERE team_id = $1::UUID AND user_id = $2::UUID
       ) AS granted`,
      [teamId, userId]
    );

    return res.status(200).send(new ServerResponse(true, { can_access: !!result.rows[0]?.granted }));
  }

  @HandleExceptions()
  public static async getAccessMembers(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    await ensureSalesAccessTable();
    const result = await db.query(SalesController.SALES_ACCESS_MEMBERS_SQL, [teamId]);
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async updateAccess(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    await ensureSalesAccessTable();

    const rawIds = req.body?.user_ids;
    if (!Array.isArray(rawIds)) {
      return res.status(400).send(new ServerResponse(false, null, "user_ids must be an array"));
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const userIds = [...new Set(rawIds.map((id: unknown) => String(id)))];
    if (userIds.some(id => !uuidPattern.test(id))) {
      return res.status(400).send(new ServerResponse(false, null, "user_ids must be UUIDs"));
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM sales_access WHERE team_id = $1`, [teamId]);
      if (userIds.length) {
        await client.query(
          `INSERT INTO sales_access (team_id, user_id)
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

    const result = await db.query(SalesController.SALES_ACCESS_MEMBERS_SQL, [teamId]);
    return res.status(200).send(new ServerResponse(true, result.rows));
  }
}
