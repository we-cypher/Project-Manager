import { CronJob } from "cron";
import moment from "moment-timezone";

import db from "../config/db";
import { LOG_DESCRIPTIONS } from "../shared/constants";
import { sendEmail } from "../shared/email";
import { FRONTEND_URL } from "../shared/brand";
import { NotificationsService } from "../services/notifications/notifications.service";
import { daysBefore, nearerExpiry } from "../shared/website-renewals";
import { log_error, sanitizePlainText } from "../shared/utils";
import { generateProjectKey } from "../utils/generate-project-key";

const ADVISORY_LOCK_ID = 900310;
const DEFAULT_INTERVALS = [60, 30, 14, 7, 1, 0];
const log = (value: string) => console.log("website-expiry-job:", value);

interface AdminMember {
  team_member_id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  socket_id: string | null;
  team_name: string;
}

interface WebsiteRow {
  id: string;
  name: string;
  domain: string;
  status: string;
  client_name: string;
  domain_expiry: string | null;
  hosting_expiry: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function tableExists(): Promise<boolean> {
  const result = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'websites'
     ) AS exists`
  );
  return result.rows[0]?.exists === true;
}

async function teamTimezone(teamId: string): Promise<string> {
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
  return moment.tz.zone(candidate) ? candidate : "UTC";
}

async function loadAdmins(teamId: string): Promise<AdminMember[]> {
  const result = await db.query(
    `SELECT tm.id AS team_member_id, u.id AS user_id, u.email, u.name, u.socket_id, t.name AS team_name
     FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            JOIN roles r ON r.id = tm.role_id
            JOIN teams t ON t.id = tm.team_id
     WHERE tm.team_id = $1
       AND COALESCE(tm.active, TRUE) = TRUE
       AND (COALESCE(r.owner, FALSE) OR r.name IN ('Owner', 'Admin'))`,
    [teamId]
  );
  return result.rows;
}

async function ensureRenewalsProject(teamId: string, admins: AdminMember[]): Promise<string | null> {
  const owner = admins[0];
  if (!owner) return null;

  const settings = await db.query(
    `INSERT INTO website_reminder_settings (team_id)
     VALUES ($1)
     ON CONFLICT (team_id) DO UPDATE SET team_id = EXCLUDED.team_id
     RETURNING task_project_id`,
    [teamId]
  );
  const existingId = settings.rows[0]?.task_project_id as string | null;
  if (existingId) {
    const stillThere = await db.query(`SELECT id FROM projects WHERE id = $1 AND team_id = $2`, [existingId, teamId]);
    if (stillThere.rowCount) {
      await ensureMembers(existingId, admins);
      return existingId;
    }
  }

  const named = await db.query(
    `SELECT id FROM projects WHERE team_id = $1 AND LOWER(name) = 'renewals' LIMIT 1`,
    [teamId]
  );
  if (named.rows[0]?.id) {
    await db.query(
      `UPDATE website_reminder_settings SET task_project_id = $2, updated_at = CURRENT_TIMESTAMP WHERE team_id = $1`,
      [teamId, named.rows[0].id]
    );
    await ensureMembers(named.rows[0].id, admins);
    return named.rows[0].id;
  }

  const keys = (await db.query(`SELECT key FROM projects WHERE team_id = $1`, [teamId])).rows.map((row: { key: string }) => row.key);
  const status = await db.query(`SELECT id FROM sys_project_statuses ORDER BY sort_order ASC NULLS LAST LIMIT 1`);
  const health = await db.query(`SELECT id FROM sys_project_healths LIMIT 1`);
  const body = {
    name: "Renewals",
    notes: "Tasks created when a website domain or hosting is due for renewal.",
    color_code: "#70a6f3",
    team_id: teamId,
    user_id: owner.user_id,
    status_id: status.rows[0]?.id || null,
    health_id: health.rows[0]?.id || null,
    key: generateProjectKey("Renewals", keys),
    project_created_log: LOG_DESCRIPTIONS.PROJECT_CREATED,
  };

  try {
    const created = await db.query(`SELECT create_project($1) AS project`, [JSON.stringify(body)]);
    const projectId = created.rows[0]?.project?.id as string | undefined;
    if (!projectId) return null;
    await db.query(
      `UPDATE website_reminder_settings SET task_project_id = $2, updated_at = CURRENT_TIMESTAMP WHERE team_id = $1`,
      [teamId, projectId]
    );
    await ensureMembers(projectId, admins);
    return projectId;
  } catch (error) {
    log_error(error);
    return null;
  }
}

async function ensureMembers(projectId: string, admins: AdminMember[]): Promise<void> {
  for (const admin of admins) {
    await db.query(
      `INSERT INTO project_members (team_member_id, project_access_level_id, project_id, role_id)
       SELECT tm.id, (SELECT id FROM project_access_levels WHERE key = 'ADMIN' LIMIT 1), $2, tm.role_id
       FROM team_members tm
       WHERE tm.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM project_members WHERE project_id = $2 AND team_member_id = tm.id
         )`,
      [admin.team_member_id, projectId]
    );
  }
}

async function createRenewalTask(
  teamId: string,
  website: WebsiteRow,
  item: "domain" | "hosting",
  expiryDate: string,
  projectId: string,
  admins: AdminMember[],
  today: string
): Promise<void> {
  const existing = await db.query(
    `SELECT 1 FROM website_renewal_tasks WHERE website_id = $1 AND item = $2 AND expiry_date = $3`,
    [website.id, item, expiryDate]
  );
  if (existing.rowCount) return;

  const label = item === "domain" ? "domain" : "hosting";
  const name = `Renew ${label}: ${website.domain}`.slice(0, 250);
  const description = [
    `${website.name} (${website.client_name})`,
    `${label[0].toUpperCase()}${label.slice(1)} expires on ${expiryDate}.`,
    `${FRONTEND_URL}/renewals/${website.id}`,
  ].join("\n");

  const numbers = await db.query(
    `SELECT COALESCE(MAX(task_no), 0) + 1 AS next_no,
            COALESCE(MAX(sort_order), 0) + 1 AS next_sort
     FROM tasks WHERE project_id = $1`,
    [projectId]
  );
  const status = await db.query(
    `SELECT ts.id
     FROM task_statuses ts
            JOIN sys_task_status_categories c ON c.id = ts.category_id
     WHERE ts.project_id = $1 AND c.is_todo IS TRUE
     ORDER BY ts.sort_order ASC
     LIMIT 1`,
    [projectId]
  );
  const priority = await db.query(
    `SELECT id FROM task_priorities WHERE LOWER(name) = 'medium' LIMIT 1`
  );
  const priorityFallback = priority.rowCount
    ? priority
    : await db.query(`SELECT id FROM task_priorities ORDER BY value ASC LIMIT 1`);
  const statusId = status.rows[0]?.id;
  const priorityId = priorityFallback.rows[0]?.id;
  const reporterId = admins[0]?.user_id;
  if (!statusId || !priorityId || !reporterId) return;

  const nextNo = numbers.rows[0].next_no;
  const nextSort = numbers.rows[0].next_sort;
  const start = `${today}T12:00:00.000Z`;
  const end = `${expiryDate}T12:00:00.000Z`;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO tasks (
         name, description, task_no, start_date, end_date, priority_id, project_id, reporter_id, status_id,
         sort_order, roadmap_sort_order, status_sort_order, priority_sort_order, phase_sort_order, member_sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10,$10,$10,$10)
       RETURNING id`,
      [name, description, nextNo, start, end, priorityId, projectId, reporterId, statusId, nextSort]
    );
    const taskId = inserted.rows[0].id as string;
    await client.query(`UPDATE projects SET tasks_counter = GREATEST(tasks_counter, $2) WHERE id = $1`, [projectId, nextNo]);

    const members = await client.query(
      `SELECT id, team_member_id FROM project_members WHERE project_id = $1`,
      [projectId]
    );
    for (const member of members.rows) {
      const isAdmin = admins.some(admin => admin.team_member_id === member.team_member_id);
      if (!isAdmin) continue;
      await client.query(
        `INSERT INTO tasks_assignees (task_id, project_member_id, team_member_id, assigned_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [taskId, member.id, member.team_member_id, reporterId]
      );
    }

    await client.query(
      `INSERT INTO website_renewal_tasks (website_id, item, expiry_date, task_id)
       VALUES ($1, $2, $3, $4)`,
      [website.id, item, expiryDate, taskId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    const code = (error as { code?: string }).code;
    if (code !== "23505") log_error(error);
  } finally {
    client.release();
  }
}

async function notifyAdmins(
  website: WebsiteRow,
  teamId: string,
  item: "domain" | "hosting",
  expiryDate: string,
  days: number,
  admins: AdminMember[]
): Promise<void> {
  const inserted = await db.query(
    `INSERT INTO website_reminder_log (website_id, item, expiry_date, days_before)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (website_id, item, expiry_date, days_before) DO NOTHING
     RETURNING id`,
    [website.id, item, expiryDate, days]
  );
  if (!inserted.rowCount) return;

  const safeDomain = sanitizePlainText(website.domain);
  const when = days === 0 ? "today" : days === 1 ? "in 1 day" : `in ${days} days`;
  const message = `<b>${safeDomain}</b> ${item} expires ${when} (${expiryDate}).`;
  const link = `${FRONTEND_URL}/renewals/${website.id}`;

  for (const admin of admins) {
    await db.query(
      `INSERT INTO user_notifications (message, user_id, team_id, website_id)
       VALUES ($1, $2, $3, $4)`,
      [message, admin.user_id, teamId, website.id]
    );
    if (admin.socket_id) {
      NotificationsService.sendNotification({
        receiver_socket_id: admin.socket_id,
        team: admin.team_name,
        team_id: teamId,
        message,
        url: `/renewals/${website.id}`,
      });
    }
    if (admin.email) {
      const html = `
        <p>${escapeHtml(admin.name || "there")},</p>
        <p><strong>${escapeHtml(website.domain)}</strong> ${item} expires ${escapeHtml(when)} (${escapeHtml(expiryDate)}).</p>
        <p><a href="${escapeHtml(link)}">Open the renewal</a></p>
      `;
      try {
        await sendEmail({
          to: [admin.email],
          subject: `${website.domain} ${item} expires ${when}`,
          html,
        });
      } catch (error) {
        log_error(error);
      }
    }
  }
}

async function processTeam(teamId: string): Promise<void> {
  const timezone = await teamTimezone(teamId);
  const now = moment.tz(timezone);
  const force = process.env.WEBSITE_EXPIRY_FORCE === "true";
  if (!force && now.hour() !== 8) return;
  const today = now.format("YYYY-MM-DD");

  const settings = await db.query(
    `SELECT task_lead_days, intervals_days FROM website_reminder_settings WHERE team_id = $1`,
    [teamId]
  );
  const leadDays = Number(settings.rows[0]?.task_lead_days ?? 30);
  const intervals: number[] = settings.rows[0]?.intervals_days?.length
    ? settings.rows[0].intervals_days.map(Number)
    : DEFAULT_INTERVALS;

  const websites = await db.query(
    `SELECT w.id, w.name, w.domain, w.status, c.name AS client_name, w.domain_expiry, w.hosting_expiry
     FROM websites w
            JOIN clients c ON c.id = w.client_id
     WHERE w.team_id = $1 AND w.archived_at IS NULL AND w.status <> 'archived'`,
    [teamId]
  );

  const admins = await loadAdmins(teamId);
  let projectId: string | null = null;

  for (const website of websites.rows as WebsiteRow[]) {
    const sooner = nearerExpiry(website.domain_expiry, website.hosting_expiry);
    if (sooner && daysBefore(sooner, today) <= 0 && website.status === "active") {
      await db.query(
        `UPDATE websites SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'active'`,
        [website.id]
      );
    }

    for (const item of ["domain", "hosting"] as const) {
      const expiryDate = item === "domain" ? website.domain_expiry : website.hosting_expiry;
      if (!expiryDate) continue;
      const remaining = daysBefore(expiryDate, today);

      if (intervals.includes(remaining)) {
        await notifyAdmins(website, teamId, item, expiryDate, remaining, admins);
      }

      if (remaining >= 0 && remaining <= leadDays) {
        if (!projectId) projectId = await ensureRenewalsProject(teamId, admins);
        if (projectId) {
          await createRenewalTask(teamId, website, item, expiryDate, projectId, admins, today);
        }
      }
    }
  }
}

export async function runWebsiteExpiryJob(): Promise<void> {
  if (!(await tableExists())) {
    log("websites table is not migrated yet, skipping.");
    return;
  }
  const teams = await db.query(
    `SELECT DISTINCT team_id FROM websites WHERE archived_at IS NULL AND status <> 'archived'`
  );
  for (const team of teams.rows) {
    try {
      await processTeam(team.team_id);
    } catch (error) {
      log_error(error);
    }
  }
}

export function startWebsiteExpiryJob() {
  const cron = new CronJob("0 * * * *", async () => {
    const client = await db.pool.connect();
    let locked = false;
    try {
      const lock = await client.query(`SELECT pg_try_advisory_lock($1) AS acquired`, [ADVISORY_LOCK_ID]);
      locked = lock.rows[0]?.acquired === true;
      if (!locked) return;
      await runWebsiteExpiryJob();
    } catch (error) {
      log_error(error);
    } finally {
      if (locked) {
        await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_ID]).catch(log_error);
      }
      client.release();
    }
  }, null, true, "UTC");
  cron.start();
  log("scheduled hourly.");
}
