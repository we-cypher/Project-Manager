import db from "../config/db";
import HandleExceptions from "../decorators/handle-exceptions";
import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import { ServerResponse } from "../models/server-response";
import {
  ManagedBy,
  parseIntervals,
  parseManagedBy,
  parseOptionalDate,
  parseOptionalEmail,
  parseStatus,
  RenewalItem,
  normalizeDomain,
  WebsiteStatus,
} from "../shared/website-renewals";
import WorklenzControllerBase from "./worklenz-controller-base";

const SORT_FIELDS: Record<string, string> = {
  name: "name",
  domain: "domain",
  client_name: "client_name",
  domain_managed_by: "domain_managed_by",
  domain_expiry: "domain_expiry",
  hosting_managed_by: "hosting_managed_by",
  hosting_provider: "hosting_provider",
  hosting_expiry: "hosting_expiry",
  dns_manager: "dns_manager",
  status: "status",
  days_remaining: "days_remaining",
  nearest_expiry: "nearest_expiry",
};

const DEFAULT_INTERVALS = [60, 30, 14, 7, 1, 0];

interface WebsiteInput {
  name: string;
  domain: string;
  clientId: string | null;
  projectId: string | null;
  status: WebsiteStatus;
  domainManagedBy: ManagedBy;
  domainProvider: string | null;
  domainAccountEmail: string | null;
  domainExpiry: string | null;
  hostingManagedBy: ManagedBy;
  hostingProvider: string | null;
  hostingPlan: string | null;
  hostingExpiry: string | null;
  dnsManager: string | null;
  notes: string | null;
  credentialsRef: string | null;
}

const WEBSITE_COLUMNS = `
  w.id, w.team_id, w.client_id, w.project_id, w.name, w.domain, w.status,
  w.domain_managed_by, w.domain_provider, w.domain_account_email, w.domain_expiry,
  w.hosting_managed_by, w.hosting_provider, w.hosting_plan, w.hosting_expiry,
  w.dns_manager, w.notes, w.credentials_ref, w.created_by, w.created_at, w.updated_at, w.archived_at,
  c.name AS client_name,
  p.name AS project_name
`;

export default class WebsitesController extends WorklenzControllerBase {
  private static teamId(req: IWorkLenzRequest): string | null {
    return req.user?.team_id || null;
  }

  private static text(value: unknown, max = 500): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
  }

  private static async resolveTimezone(teamId: string): Promise<string> {
    const result = await db.query(
      `SELECT COALESCE(s.timezone, tz.name, 'UTC') AS timezone
       FROM teams t
              LEFT JOIN website_reminder_settings s ON s.team_id = t.id
              LEFT JOIN users u ON u.id = t.user_id
              LEFT JOIN timezones tz ON tz.id = u.timezone_id
       WHERE t.id = $1`,
      [teamId]
    );
    const candidate = result.rows[0]?.timezone || "UTC";
    const known = await db.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [candidate]);
    return known.rowCount ? candidate : "UTC";
  }

  private static async parseBody(teamId: string, body: Record<string, unknown>): Promise<WebsiteInput | string> {
    const name = WebsitesController.text(body.name, 200);
    const domain = normalizeDomain(body.domain);
    const clientId = typeof body.client_id === "string" && body.client_id ? body.client_id : null;
    const projectId = body.project_id ? String(body.project_id) : null;
    const status = body.status == null || body.status === "" ? "active" : parseStatus(body.status);
    const domainManagedBy = parseManagedBy(body.domain_managed_by);
    const hostingManagedBy = parseManagedBy(body.hosting_managed_by);
    const domainExpiry = parseOptionalDate(body.domain_expiry);
    const hostingExpiry = parseOptionalDate(body.hosting_expiry);
    const domainAccountEmail = parseOptionalEmail(body.domain_account_email);

    if (!name) return "Website name is required";
    if (!domain) return "Enter a valid domain name";
    if (!status) return "Status is invalid";
    if (!domainManagedBy || !hostingManagedBy) return "Managed by must be Wecypher or client";
    if (domainExpiry === undefined || hostingExpiry === undefined) return "Enter a valid expiry date";
    if (domainAccountEmail === undefined) return "Enter a valid account email";

    if (clientId) {
      const client = await db.query(`SELECT id FROM clients WHERE id = $1 AND team_id = $2`, [clientId, teamId]);
      if (!client.rowCount) return "Client was not found on this team";
    }

    if (projectId) {
      const project = await db.query(
        `SELECT id, client_id FROM projects WHERE id = $1 AND team_id = $2`,
        [projectId, teamId]
      );
      if (!project.rowCount) return "Project was not found on this team";
      const projectClientId = project.rows[0].client_id as string | null;
      if (projectClientId && clientId && projectClientId !== clientId) {
        return "That project belongs to a different client";
      }
    }

    return {
      name,
      domain,
      clientId,
      projectId,
      status,
      domainManagedBy,
      domainProvider: WebsitesController.text(body.domain_provider, 200),
      domainAccountEmail,
      domainExpiry,
      hostingManagedBy,
      hostingProvider: WebsitesController.text(body.hosting_provider, 200),
      hostingPlan: WebsitesController.text(body.hosting_plan, 200),
      hostingExpiry,
      dnsManager: WebsitesController.text(body.dns_manager, 200),
      notes: WebsitesController.text(body.notes, 5000),
      credentialsRef: WebsitesController.text(body.credentials_ref, 500),
    };
  }

  private static duplicateMessage(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
  }

  private static async getRow(id: string, teamId: string) {
    const result = await db.query(
      `SELECT ${WEBSITE_COLUMNS}
       FROM websites w
              LEFT JOIN clients c ON c.id = w.client_id
              LEFT JOIN projects p ON p.id = w.project_id
       WHERE w.id = $1 AND w.team_id = $2`,
      [id, teamId]
    );
    return result.rows[0] || null;
  }

  @HandleExceptions()
  public static async list(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const timezone = await WebsitesController.resolveTimezone(teamId);
    const size = Math.min(Math.max(Number(req.query.size) || 20, 1), 100);
    const index = Math.max(Number(req.query.index) || 1, 1);
    const offset = (index - 1) * size;
    const sortColumn = SORT_FIELDS[String(req.query.field || "nearest_expiry")] || SORT_FIELDS.nearest_expiry;
    const direction = String(req.query.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const search = String(req.query.search || "").trim();
    const management = String(req.query.management || "all");
    const expiry = String(req.query.expiry || "any");
    const clientId = String(req.query.client_id || "");
    const provider = String(req.query.provider || "");
    const dnsManager = String(req.query.dns_manager || "");
    const status = String(req.query.status || "");
    const includeArchived = req.query.include_archived === "true" || status === "archived";

    const where = ["w.team_id = $1"];
    const params: unknown[] = [teamId, timezone];
    if (!includeArchived) where.push(`w.archived_at IS NULL AND w.status <> 'archived'`);
    if (search) {
      params.push(`%${search}%`);
      where.push(`(w.name ILIKE $${params.length} OR w.domain ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (management === "both_us") where.push(`w.domain_managed_by = 'us' AND w.hosting_managed_by = 'us'`);
    if (management === "hosting_us") where.push(`w.domain_managed_by = 'client' AND w.hosting_managed_by = 'us'`);
    if (management === "domain_us") where.push(`w.domain_managed_by = 'us' AND w.hosting_managed_by = 'client'`);
    if (management === "client") where.push(`w.domain_managed_by = 'client' AND w.hosting_managed_by = 'client'`);
    if (clientId) {
      params.push(clientId);
      where.push(`w.client_id = $${params.length}`);
    }
    if (provider) {
      params.push(provider);
      where.push(`(w.domain_provider = $${params.length} OR w.hosting_provider = $${params.length})`);
    }
    if (dnsManager) {
      params.push(dnsManager);
      where.push(`w.dns_manager = $${params.length}`);
    }
    if (status && parseStatus(status)) {
      params.push(status);
      where.push(`w.status = $${params.length}`);
    }

    let expirySql = "TRUE";
    if (expiry === "7" || expiry === "10" || expiry === "30" || expiry === "60") {
      expirySql = `days_remaining IS NOT NULL AND days_remaining >= 0 AND days_remaining <= ${Number(expiry)}`;
    } else if (expiry === "expired") {
      expirySql = `days_remaining IS NOT NULL AND days_remaining < 0`;
    }

    params.push(size, offset);
    const result = await db.query(
      `WITH today AS (
         SELECT (CURRENT_TIMESTAMP AT TIME ZONE $2)::date AS day
       ),
       listed AS (
         SELECT w.id, w.name, w.domain, w.status, w.client_id, c.name AS client_name,
                w.domain_managed_by, w.domain_expiry, w.hosting_managed_by, w.hosting_provider,
                w.hosting_expiry, w.dns_manager, w.project_id,
                LEAST(w.domain_expiry, w.hosting_expiry) AS nearest_expiry,
                CASE
                  WHEN w.domain_expiry IS NULL AND w.hosting_expiry IS NULL THEN NULL
                  ELSE (LEAST(w.domain_expiry, w.hosting_expiry) - (SELECT day FROM today))::int
                END AS days_remaining
         FROM websites w
                LEFT JOIN clients c ON c.id = w.client_id
         WHERE ${where.join(" AND ")}
       )
       SELECT *, COUNT(*) OVER() AS total_count
       FROM listed
       WHERE ${expirySql}
       ORDER BY ${sortColumn} ${direction} NULLS LAST, name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
    const data = result.rows.map(row => {
      const copy = { ...row, days_remaining: row.days_remaining == null ? null : Number(row.days_remaining) };
      delete copy.total_count;
      return copy;
    });
    return res.status(200).send(new ServerResponse(true, { total, data }));
  }

  @HandleExceptions()
  public static async summary(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const timezone = await WebsitesController.resolveTimezone(teamId);
    const result = await db.query(
      `WITH today AS (
         SELECT (CURRENT_TIMESTAMP AT TIME ZONE $2)::date AS day
       ),
       listed AS (
         SELECT w.domain_managed_by, w.hosting_managed_by,
                CASE
                  WHEN w.domain_expiry IS NULL AND w.hosting_expiry IS NULL THEN NULL
                  ELSE (LEAST(w.domain_expiry, w.hosting_expiry) - (SELECT day FROM today))::int
                END AS days_remaining
         FROM websites w
         WHERE w.team_id = $1 AND w.archived_at IS NULL AND w.status <> 'archived'
       )
       SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE days_remaining IS NOT NULL AND days_remaining >= 0 AND days_remaining <= 30)::int AS expiring_30,
              COUNT(*) FILTER (WHERE days_remaining IS NOT NULL AND days_remaining < 0)::int AS expired,
              COUNT(*) FILTER (WHERE days_remaining IS NOT NULL AND days_remaining >= 0 AND days_remaining <= 10)::int AS expiring_10,
              COUNT(*) FILTER (WHERE domain_managed_by = 'us' AND hosting_managed_by = 'us')::int AS both_us,
              COUNT(*) FILTER (WHERE domain_managed_by = 'client' AND hosting_managed_by = 'us')::int AS hosting_us,
              COUNT(*) FILTER (WHERE domain_managed_by = 'us' AND hosting_managed_by = 'client')::int AS domain_us,
              COUNT(*) FILTER (WHERE domain_managed_by = 'client' AND hosting_managed_by = 'client')::int AS client_managed
       FROM listed`,
      [teamId, timezone]
    );
    return res.status(200).send(new ServerResponse(true, result.rows[0]));
  }

  @HandleExceptions()
  public static async filters(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    const [clients, projects, providers, dns] = await Promise.all([
      db.query(`SELECT id, name FROM clients WHERE team_id = $1 ORDER BY name ASC`, [teamId]),
      db.query(`SELECT id, name, client_id FROM projects WHERE team_id = $1 ORDER BY name ASC`, [teamId]),
      db.query(
        `SELECT DISTINCT provider FROM (
           SELECT domain_provider AS provider FROM websites WHERE team_id = $1 AND domain_provider IS NOT NULL AND domain_provider <> ''
           UNION
           SELECT hosting_provider FROM websites WHERE team_id = $1 AND hosting_provider IS NOT NULL AND hosting_provider <> ''
         ) names ORDER BY provider ASC`,
        [teamId]
      ),
      db.query(
        `SELECT DISTINCT dns_manager FROM websites
         WHERE team_id = $1 AND dns_manager IS NOT NULL AND dns_manager <> ''
         ORDER BY dns_manager ASC`,
        [teamId]
      ),
    ]);

    return res.status(200).send(new ServerResponse(true, {
      clients: clients.rows,
      projects: projects.rows,
      providers: providers.rows.map(row => row.provider),
      dns_managers: dns.rows.map(row => row.dns_manager),
    }));
  }

  @HandleExceptions()
  public static async getById(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const website = await WebsitesController.getRow(req.params.id, teamId);
    if (!website) return res.status(404).send(new ServerResponse(false, null, "Website not found"));

    const [renewals, tasks] = await Promise.all([
      db.query(
        `SELECT r.id, r.item, r.previous_expiry, r.new_expiry, r.renewed_at, r.note, u.name AS renewed_by_name
         FROM website_renewals r
                LEFT JOIN users u ON u.id = r.renewed_by
         WHERE r.website_id = $1
         ORDER BY r.renewed_at DESC`,
        [website.id]
      ),
      db.query(
        `SELECT wrt.item, wrt.expiry_date, wrt.task_id, t.name AS task_name, t.project_id
         FROM website_renewal_tasks wrt
                JOIN tasks t ON t.id = wrt.task_id
         WHERE wrt.website_id = $1
         ORDER BY wrt.created_at DESC`,
        [website.id]
      ),
    ]);

    return res.status(200).send(new ServerResponse(true, {
      ...website,
      renewals: renewals.rows,
      tasks: tasks.rows,
    }));
  }

  @HandleExceptions()
  public static async create(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const parsed = await WebsitesController.parseBody(teamId, req.body || {});
    if (typeof parsed === "string") return res.status(400).send(new ServerResponse(false, null, parsed));

    try {
      const inserted = await db.query(
        `INSERT INTO websites (
           team_id, client_id, project_id, name, domain, status,
           domain_managed_by, domain_provider, domain_account_email, domain_expiry,
           hosting_managed_by, hosting_provider, hosting_plan, hosting_expiry,
           dns_manager, notes, credentials_ref, created_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
         ) RETURNING id`,
        [
          teamId, parsed.clientId, parsed.projectId, parsed.name, parsed.domain, parsed.status,
          parsed.domainManagedBy, parsed.domainProvider, parsed.domainAccountEmail, parsed.domainExpiry,
          parsed.hostingManagedBy, parsed.hostingProvider, parsed.hostingPlan, parsed.hostingExpiry,
          parsed.dnsManager, parsed.notes, parsed.credentialsRef, req.user?.id || null,
        ]
      );
      const website = await WebsitesController.getRow(inserted.rows[0].id, teamId);
      return res.status(200).send(new ServerResponse(true, website));
    } catch (error) {
      if (WebsitesController.duplicateMessage(error)) {
        return res.status(409).send(new ServerResponse(false, null, "A website with this domain already exists"));
      }
      throw error;
    }
  }

  @HandleExceptions()
  public static async importRows(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const rawRows = Array.isArray(req.body?.rows) ? req.body.rows as unknown[] : null;
    if (!rawRows) return res.status(400).send(new ServerResponse(false, null, "Upload a CSV with a header row"));
    if (rawRows.length > 500) {
      return res.status(400).send(new ServerResponse(false, null, "Import up to 500 websites at a time"));
    }

    const clients = await db.query(`SELECT id, lower(name) AS name FROM clients WHERE team_id = $1`, [teamId]);
    const clientIds = new Map<string, string[]>();
    for (const row of clients.rows as { id: string; name: string }[]) {
      const matches = clientIds.get(row.name) || [];
      matches.push(row.id);
      clientIds.set(row.name, matches);
    }
    const projects = await db.query(
      `SELECT id, lower(name) AS name, client_id FROM projects WHERE team_id = $1`,
      [teamId]
    );
    const projectIds = new Map<string, { id: string; client_id: string | null }[]>();
    for (const row of projects.rows as { id: string; name: string; client_id: string | null }[]) {
      const matches = projectIds.get(row.name) || [];
      matches.push({ id: row.id, client_id: row.client_id });
      projectIds.set(row.name, matches);
    }

    const seen = new Set<string>();
    const failed: { row: number; domain: string; message: string }[] = [];
    let created = 0;
    let updated = 0;

    for (let index = 0; index < rawRows.length; index++) {
      const source = rawRows[index];
      const rowNumber = index + 2;
      if (!source || typeof source !== "object") {
        failed.push({ row: rowNumber, domain: "", message: "Row is empty" });
        continue;
      }
      const mapped = WebsitesController.mapImportRow(source as Record<string, unknown>);
      if (!mapped.name && !mapped.domain) continue;

      let clientId = "";
      if (mapped.client) {
        const matches = clientIds.get(mapped.client.toLowerCase()) || [];
        if (matches.length !== 1) {
          failed.push({
            row: rowNumber,
            domain: mapped.domain,
            message: matches.length === 0 ? "Client was not found on this team" : "More than one client has this name",
          });
          continue;
        }
        clientId = matches[0];
      }

      let projectId: string | null = null;
      if (mapped.project) {
        const matches = projectIds.get(mapped.project.toLowerCase()) || [];
        if (matches.length !== 1) {
          failed.push({
            row: rowNumber,
            domain: mapped.domain,
            message: matches.length === 0 ? "Project was not found on this team" : "More than one project has this name",
          });
          continue;
        }
        projectId = matches[0].id;
      }

      const parsed = await WebsitesController.parseBody(teamId, {
        name: mapped.name,
        domain: mapped.domain,
        client_id: clientId,
        project_id: projectId,
        status: mapped.status || "active",
        domain_managed_by: mapped.domain_managed_by || "wecypher",
        domain_provider: mapped.domain_provider,
        domain_account_email: mapped.domain_account_email,
        domain_expiry: WebsitesController.normalizeImportDate(mapped.domain_expiry),
        hosting_managed_by: mapped.hosting_managed_by || "wecypher",
        hosting_provider: mapped.hosting_provider,
        hosting_plan: mapped.hosting_plan,
        hosting_expiry: WebsitesController.normalizeImportDate(mapped.hosting_expiry),
        dns_manager: mapped.dns_manager,
        credentials_ref: mapped.credentials_ref,
        notes: mapped.notes,
      });
      if (typeof parsed === "string") {
        failed.push({ row: rowNumber, domain: mapped.domain, message: parsed });
        continue;
      }
      if (seen.has(parsed.domain)) {
        failed.push({ row: rowNumber, domain: parsed.domain, message: "This domain is repeated in the file" });
        continue;
      }
      seen.add(parsed.domain);

      const existing = await db.query(
        `SELECT id FROM websites WHERE team_id = $1 AND domain = $2 AND archived_at IS NULL`,
        [teamId, parsed.domain]
      );
      const present = new Set(Object.keys(mapped));
      try {
        if (existing.rowCount) {
          await WebsitesController.applyImportUpdate(existing.rows[0].id as string, parsed, present);
          updated += 1;
        } else {
          await db.query(
            `INSERT INTO websites (
               team_id, client_id, project_id, name, domain, status,
               domain_managed_by, domain_provider, domain_account_email, domain_expiry,
               hosting_managed_by, hosting_provider, hosting_plan, hosting_expiry,
               dns_manager, notes, credentials_ref, created_by
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
             )`,
            [
              teamId, parsed.clientId, parsed.projectId, parsed.name, parsed.domain, parsed.status,
              parsed.domainManagedBy, parsed.domainProvider, parsed.domainAccountEmail, parsed.domainExpiry,
              parsed.hostingManagedBy, parsed.hostingProvider, parsed.hostingPlan, parsed.hostingExpiry,
              parsed.dnsManager, parsed.notes, parsed.credentialsRef, req.user?.id || null,
            ]
          );
          created += 1;
        }
      } catch (error) {
        if (WebsitesController.duplicateMessage(error)) {
          failed.push({ row: rowNumber, domain: parsed.domain, message: "A website with this domain already exists" });
          continue;
        }
        throw error;
      }
    }

    return res.status(200).send(new ServerResponse(true, { created, updated, failed }));
  }

  private static async applyImportUpdate(
    id: string,
    parsed: WebsiteInput,
    present: Set<string>
  ): Promise<void> {
    const assignments = ["name = $2", "updated_at = CURRENT_TIMESTAMP"];
    const params: unknown[] = [id, parsed.name];
    const set = (column: string, value: unknown) => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };
    if (present.has("client")) set("client_id", parsed.clientId);
    if (present.has("project")) set("project_id", parsed.projectId);
    if (present.has("status")) set("status", parsed.status);
    if (present.has("domain_managed_by")) set("domain_managed_by", parsed.domainManagedBy);
    if (present.has("domain_provider")) set("domain_provider", parsed.domainProvider);
    if (present.has("domain_account_email")) set("domain_account_email", parsed.domainAccountEmail);
    if (present.has("domain_expiry")) set("domain_expiry", parsed.domainExpiry);
    if (present.has("hosting_managed_by")) set("hosting_managed_by", parsed.hostingManagedBy);
    if (present.has("hosting_provider")) set("hosting_provider", parsed.hostingProvider);
    if (present.has("hosting_plan")) set("hosting_plan", parsed.hostingPlan);
    if (present.has("hosting_expiry")) set("hosting_expiry", parsed.hostingExpiry);
    if (present.has("dns_manager")) set("dns_manager", parsed.dnsManager);
    if (present.has("notes")) set("notes", parsed.notes);
    if (present.has("credentials_ref")) set("credentials_ref", parsed.credentialsRef);
    await db.query(`UPDATE websites SET ${assignments.join(", ")} WHERE id = $1`, params);
  }

  private static mapImportRow(source: Record<string, unknown>): Record<string, string> {
    const aliases: Record<string, string> = {
      website: "name",
      website_name: "name",
      name: "name",
      domain: "domain",
      client: "client",
      client_name: "client",
      project: "project",
      project_name: "project",
      status: "status",
      domain_managed_by: "domain_managed_by",
      hosting_managed_by: "hosting_managed_by",
      domain_provider: "domain_provider",
      registrar: "domain_provider",
      domain_account_email: "domain_account_email",
      account_email: "domain_account_email",
      domain_expiry: "domain_expiry",
      hosting_provider: "hosting_provider",
      hosting_plan: "hosting_plan",
      plan: "hosting_plan",
      hosting_expiry: "hosting_expiry",
      dns_manager: "dns_manager",
      credentials_ref: "credentials_ref",
      credentials_location: "credentials_ref",
      notes: "notes",
    };
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
      const normalized = key.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/[\s/-]+/g, "_");
      const field = aliases[normalized];
      if (!field) continue;
      mapped[field] = value == null ? "" : String(value).trim();
    }
    return mapped;
  }

  private static normalizeImportDate(value: string): string {
    const match = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(value.trim());
    if (!match) return value.trim();
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  @HandleExceptions()
  public static async update(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const existing = await WebsitesController.getRow(req.params.id, teamId);
    if (!existing) return res.status(404).send(new ServerResponse(false, null, "Website not found"));
    const parsed = await WebsitesController.parseBody(teamId, req.body || {});
    if (typeof parsed === "string") return res.status(400).send(new ServerResponse(false, null, parsed));

    const archivedAt = parsed.status === "archived" ? existing.archived_at || new Date().toISOString() : null;
    try {
      await db.query(
        `UPDATE websites SET
           client_id = $3, project_id = $4, name = $5, domain = $6, status = $7,
           domain_managed_by = $8, domain_provider = $9, domain_account_email = $10, domain_expiry = $11,
           hosting_managed_by = $12, hosting_provider = $13, hosting_plan = $14, hosting_expiry = $15,
           dns_manager = $16, notes = $17, credentials_ref = $18,
           archived_at = $19, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND team_id = $2`,
        [
          existing.id, teamId, parsed.clientId, parsed.projectId, parsed.name, parsed.domain, parsed.status,
          parsed.domainManagedBy, parsed.domainProvider, parsed.domainAccountEmail, parsed.domainExpiry,
          parsed.hostingManagedBy, parsed.hostingProvider, parsed.hostingPlan, parsed.hostingExpiry,
          parsed.dnsManager, parsed.notes, parsed.credentialsRef, archivedAt,
        ]
      );
      const website = await WebsitesController.getRow(existing.id, teamId);
      return res.status(200).send(new ServerResponse(true, website));
    } catch (error) {
      if (WebsitesController.duplicateMessage(error)) {
        return res.status(409).send(new ServerResponse(false, null, "A website with this domain already exists"));
      }
      throw error;
    }
  }

  @HandleExceptions()
  public static async remove(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const deleted = await db.query(
      `DELETE FROM websites WHERE id = $1 AND team_id = $2 RETURNING id`,
      [req.params.id, teamId]
    );
    if (!deleted.rowCount) return res.status(404).send(new ServerResponse(false, null, "Website not found"));
    return res.status(200).send(new ServerResponse(true, null, "Website deleted"));
  }

  @HandleExceptions()
  public static async removeMany(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));

    if (req.body?.all === true) {
      const deleted = await db.query(
        `DELETE FROM websites WHERE team_id = $1 AND archived_at IS NULL RETURNING id`,
        [teamId]
      );
      return res.status(200).send(new ServerResponse(true, { deleted: deleted.rowCount || 0 }));
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown) => typeof id === "string") : [];
    if (!ids.length || ids.length > 500) {
      return res.status(400).send(new ServerResponse(false, null, "Choose websites to delete"));
    }
    const deleted = await db.query(
      `DELETE FROM websites WHERE team_id = $1 AND id = ANY($2::uuid[]) RETURNING id`,
      [teamId, ids]
    );
    return res.status(200).send(new ServerResponse(true, { deleted: deleted.rowCount || 0 }));
  }

  @HandleExceptions()
  public static async renew(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const item = req.body?.item as RenewalItem;
    if (item !== "domain" && item !== "hosting") {
      return res.status(400).send(new ServerResponse(false, null, "Choose domain or hosting"));
    }
    const newExpiry = parseOptionalDate(req.body?.new_expiry);
    if (!newExpiry) return res.status(400).send(new ServerResponse(false, null, "Enter the new expiry date"));
    const note = WebsitesController.text(req.body?.note, 1000);

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT id, status, domain_expiry, hosting_expiry FROM websites WHERE id = $1 AND team_id = $2 FOR UPDATE`,
        [req.params.id, teamId]
      );
      const row = current.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return res.status(404).send(new ServerResponse(false, null, "Website not found"));
      }
      const previous = item === "domain" ? row.domain_expiry : row.hosting_expiry;
      const column = item === "domain" ? "domain_expiry" : "hosting_expiry";
      await client.query(
        `UPDATE websites
         SET ${column} = $3,
             status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND team_id = $2`,
        [row.id, teamId, newExpiry]
      );
      await client.query(
        `INSERT INTO website_renewals (website_id, team_id, item, previous_expiry, new_expiry, renewed_by, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, teamId, item, previous, newExpiry, req.user?.id || null, note]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const website = await WebsitesController.getById(req, res);
    return website;
  }

  @HandleExceptions()
  public static async archive(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    return WebsitesController.setArchived(req, res, true);
  }

  @HandleExceptions()
  public static async restore(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    return WebsitesController.setArchived(req, res, false);
  }

  private static async setArchived(req: IWorkLenzRequest, res: IWorkLenzResponse, archived: boolean): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const existing = await WebsitesController.getRow(req.params.id, teamId);
    if (!existing) return res.status(404).send(new ServerResponse(false, null, "Website not found"));

    let status: WebsiteStatus = "active";
    if (archived) {
      status = "archived";
    } else {
      const timezone = await WebsitesController.resolveTimezone(teamId);
      const today = await db.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS day`, [timezone]);
      const day = today.rows[0]?.day as string;
      const sooner = [existing.domain_expiry, existing.hosting_expiry].filter(Boolean).sort()[0] as string | undefined;
      status = sooner && sooner <= day ? "expired" : "active";
    }

    try {
      await db.query(
        `UPDATE websites
         SET status = $3,
             archived_at = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND team_id = $2`,
        [existing.id, teamId, status, archived]
      );
    } catch (error) {
      if (WebsitesController.duplicateMessage(error)) {
        return res.status(409).send(new ServerResponse(false, null, "A website with this domain already exists"));
      }
      throw error;
    }
    const website = await WebsitesController.getRow(existing.id, teamId);
    return res.status(200).send(new ServerResponse(true, website));
  }

  @HandleExceptions()
  public static async getSettings(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    await db.query(
      `INSERT INTO website_reminder_settings (team_id) VALUES ($1) ON CONFLICT (team_id) DO NOTHING`,
      [teamId]
    );
    const result = await db.query(
      `SELECT team_id, task_lead_days, intervals_days, task_project_id, timezone
       FROM website_reminder_settings WHERE team_id = $1`,
      [teamId]
    );
    const row = result.rows[0] || { task_lead_days: 30, intervals_days: DEFAULT_INTERVALS };
    return res.status(200).send(new ServerResponse(true, row));
  }

  @HandleExceptions()
  public static async updateSettings(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const teamId = WebsitesController.teamId(req);
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Team not found"));
    const leadDays = Number(req.body?.task_lead_days);
    const intervals = parseIntervals(req.body?.intervals_days);
    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) {
      return res.status(400).send(new ServerResponse(false, null, "Lead days must be between 0 and 365"));
    }
    if (!intervals) {
      return res.status(400).send(new ServerResponse(false, null, "Enter at least one reminder day between 0 and 365"));
    }
    await db.query(
      `INSERT INTO website_reminder_settings (team_id, task_lead_days, intervals_days, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (team_id) DO UPDATE
         SET task_lead_days = EXCLUDED.task_lead_days,
             intervals_days = EXCLUDED.intervals_days,
             updated_at = CURRENT_TIMESTAMP`,
      [teamId, leadDays, intervals]
    );
    return WebsitesController.getSettings(req, res);
  }
}
