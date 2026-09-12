import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import db from "../config/db";
import { ServerResponse } from "../models/server-response";
import WorklenzControllerBase from "./worklenz-controller-base";
import HandleExceptions from "../decorators/handle-exceptions";
import { getColor } from "../shared/utils";
import Excel from "exceljs";


export default class FinanceOverviewController extends WorklenzControllerBase {

  @HandleExceptions()
  public static async getPortfolioFinance(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;

    if (!teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Missing team context"));
    }

    /**
     * One row per project visible to this team.
     *
     * fixed_cost    = SUM of tasks.fixed_cost          (manual fixed costs)
     * time_based_cost = SUM of task_work_log.time_spent × member hourly rate
     *                   (actual cost from time logs via rate card)
     * actual_cost   = fixed_cost + time_based_cost
     * estimated_hours = SUM of tasks.total_minutes / 60
     *
     * These are the exact same fields the per-project Finance tab aggregates,
     * so numbers always reconcile between Overview and the per-project tab.
     */
    const q = `
  SELECT
    p.id,
    p.name,
    COALESCE(p.color_code, '#1890ff')   AS color_code,
    c.name                               AS client_name,
    COALESCE(p.budget, 0)::FLOAT         AS budget,
    COALESCE(p.currency, 'USD')          AS currency,

    -- Fixed cost: sum of task-level fixed costs (non-time costs)
    COALESCE(
      (
        SELECT SUM(COALESCE(t.fixed_cost, 0))
        FROM tasks t
        WHERE t.project_id = p.id
          AND t.archived = false
      ), 0
    )::FLOAT AS fixed_cost,

    -- Time-based cost: actual cost from logged hours × member rate
    COALESCE(
      (
        SELECT SUM(
          (COALESCE(wl.time_spent, 0)::FLOAT / 3600.0)
          * COALESCE(fprr.rate, 0)::FLOAT
        )
        FROM tasks t
        JOIN task_work_log wl ON wl.task_id = t.id
        LEFT JOIN project_members pm
          ON pm.project_id = t.project_id
         AND pm.team_member_id = wl.user_id
        LEFT JOIN team_members tm
          ON tm.id = wl.user_id
         AND tm.team_id = p.team_id
        LEFT JOIN finance_project_rate_card_roles fprr
          ON fprr.project_id = t.project_id
         AND fprr.job_title_id = tm.job_title_id
        WHERE t.project_id = p.id
          AND t.archived = false
      ), 0
    )::FLOAT AS time_based_cost,

    -- Estimated hours: sum of task time estimates (top-level tasks only)
    COALESCE(
      (
        SELECT SUM(COALESCE(t.total_minutes, 0))::FLOAT / 60.0
        FROM tasks t
        WHERE t.project_id = p.id
          AND t.archived = false
          AND t.parent_task_id IS NULL
      ), 0
    )::FLOAT AS estimated_hours

  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE p.team_id = $1
    AND NOT EXISTS (
      SELECT 1 FROM archived_projects ap
      WHERE ap.project_id = p.id
        AND ap.user_id = $2
    )
  ORDER BY p.name ASC;
`;


    const result = await db.query(q, [teamId, userId]);

    // Compute actual_cost on the backend so the frontend never has to
    const projects = result.rows.map((row: any) => ({
      ...row,
      actual_cost: (row.fixed_cost ?? 0) + (row.time_based_cost ?? 0),
    }));

    return res.status(200).send(new ServerResponse(true, { projects }));
  }

  @HandleExceptions()
  public static async exportPortfolioFinance(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Missing team context"));
    }

    // Reuse the same query as getPortfolioFinance
    const q = `
    SELECT
      p.id, p.name,
      COALESCE(p.color_code, '#1890ff') AS color_code,
      c.name AS client_name,
      COALESCE(p.budget, 0)::FLOAT AS budget,
      COALESCE(p.currency, 'USD') AS currency,
      COALESCE((
        SELECT SUM(COALESCE(t.fixed_cost, 0))
        FROM tasks t WHERE t.project_id = p.id AND t.archived = false
      ), 0)::FLOAT AS fixed_cost,
      COALESCE((
        SELECT SUM(
          (COALESCE(wl.time_spent, 0)::FLOAT / 3600.0)
          * COALESCE(fprr.rate, 0)::FLOAT
        )
        FROM tasks t
        JOIN task_work_log wl ON wl.task_id = t.id
        LEFT JOIN team_members tm ON tm.id = wl.user_id AND tm.team_id = p.team_id
        LEFT JOIN finance_project_rate_card_roles fprr
          ON fprr.project_id = t.project_id AND fprr.job_title_id = tm.job_title_id
        WHERE t.project_id = p.id AND t.archived = false
      ), 0)::FLOAT AS time_based_cost,
      COALESCE((
        SELECT SUM(COALESCE(t.total_minutes, 0))::FLOAT / 60.0
        FROM tasks t WHERE t.project_id = p.id AND t.archived = false AND t.parent_task_id IS NULL
      ), 0)::FLOAT AS estimated_hours
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.team_id = $1
      AND NOT EXISTS (SELECT 1 FROM archived_projects ap WHERE ap.project_id = p.id AND ap.user_id = $2)
    ORDER BY p.name ASC;
  `;

    const result = await db.query(q, [teamId, userId]);

    const workbook = new Excel.Workbook();
    const sheet = workbook.addWorksheet("Finance Overview");

    sheet.columns = [
      { header: "Project", key: "name", width: 30 },
      { header: "Client", key: "client_name", width: 20 },
      { header: "Manual Budget", key: "budget", width: 18 },
      { header: "Actual Cost", key: "actual_cost", width: 18 },
      { header: "Variance", key: "variance", width: 18 },
      { header: "Budget Utilization %", key: "utilization", width: 22 },
      { header: "Est. Hours", key: "estimated_hours", width: 15 },
      { header: "Currency", key: "currency", width: 10 },
    ];

    // Style header row
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: "FFE6F4FF" },
    };

    result.rows.forEach((row: any) => {
      const actual = (row.fixed_cost ?? 0) + (row.time_based_cost ?? 0);
      const variance = (row.budget ?? 0) - actual;
      const utilization = row.budget > 0
        ? Math.round((actual / row.budget) * 100)
        : 0;

      sheet.addRow({
        name: row.name,
        client_name: row.client_name ?? "",
        budget: row.budget,
        actual_cost: actual,
        variance: variance,
        utilization: utilization,
        estimated_hours: Math.round(row.estimated_hours ?? 0),
        currency: row.currency,
      });
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="finance-overview-${new Date().toISOString().split("T")[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    return res.end();
  }

  @HandleExceptions()
  public static async getTeamFixedCosts(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;

    if (!teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Missing team context"));
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size as string, 10) || 10));
    const offset = (page - 1) * pageSize;

    /**
     * One row per task that currently has a fixed cost set, across every
     * project in the active team. tasks.fixed_cost has no per-entry ledger
     * (see updateTaskFixedCost in project-finance-controller.ts) — it's a
     * single running total per task — so this lists each task's current
     * fixed cost, not a history of individual additions. updated_at is the
     * task's generic last-modified timestamp (also touched by unrelated
     * edits), used here as the best available "last updated" proxy.
     */
    const countQuery = `
      SELECT COUNT(*)::INT AS total
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE p.team_id = $1
        AND t.archived = false
        AND COALESCE(t.fixed_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM archived_projects ap
          WHERE ap.project_id = p.id AND ap.user_id = $2
        )
    `;
    const countResult = await db.query(countQuery, [teamId, userId]);
    const total = countResult.rows[0]?.total || 0;

    const dataQuery = `
      SELECT
        t.id AS task_id,
        t.name AS task_name,
        COALESCE(t.fixed_cost, 0)::FLOAT AS fixed_cost,
        t.updated_at,
        p.id AS project_id,
        p.name AS project_name,
        COALESCE(p.color_code, '#1890ff') AS project_color,
        COALESCE(p.currency, 'USD') AS currency,
        (SELECT get_task_assignees(t.id)) AS assignees
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE p.team_id = $1
        AND t.archived = false
        AND COALESCE(t.fixed_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM archived_projects ap
          WHERE ap.project_id = p.id AND ap.user_id = $2
        )
      ORDER BY t.updated_at DESC NULLS LAST
      LIMIT $3 OFFSET $4
    `;
    const result = await db.query(dataQuery, [teamId, userId, pageSize, offset]);

    const items = result.rows.map((row: any) => ({
      task_id: row.task_id,
      task_name: row.task_name,
      fixed_cost: Number(row.fixed_cost) || 0,
      updated_at: row.updated_at,
      project_id: row.project_id,
      project_name: row.project_name,
      project_color: row.project_color,
      currency: row.currency || "USD",
      // get_task_assignees() returns raw assignee rows with no color — every
      // other task-list-producing controller (tasks-controller-base.ts,
      // team-members-controller.ts) derives the avatar color from the
      // member's name the same way, so mirror that here instead of letting
      // the frontend fall back to plain gray.
      assignees: (row.assignees || []).map((assignee: any) => ({
        ...assignee,
        color_code: getColor(assignee.name),
      })),
    }));

    return res.status(200).send(new ServerResponse(true, {
      items,
      total,
      page,
      page_size: pageSize,
    }));
  }

  @HandleExceptions()
  public static async getBudgets(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Missing team context"));

    const q = `
      SELECT
        p.id, p.name,
        COALESCE(p.color_code, '#1890ff') AS color_code,
        c.name AS client_name,
        COALESCE(p.budget, 0)::FLOAT AS budget,
        COALESCE(p.currency, 'USD') AS currency,
        p.start_date, p.end_date,
        COALESCE((SELECT SUM(COALESCE(t.fixed_cost, 0)) FROM tasks t WHERE t.project_id = p.id AND t.archived = false), 0)::FLOAT AS fixed_cost,
        COALESCE((
          SELECT SUM((COALESCE(wl.time_spent, 0)::FLOAT / 3600.0) * COALESCE(fprr.rate, 0)::FLOAT)
          FROM tasks t
          JOIN task_work_log wl ON wl.task_id = t.id
          LEFT JOIN team_members tm ON tm.id = wl.user_id AND tm.team_id = p.team_id
          LEFT JOIN finance_project_rate_card_roles fprr ON fprr.project_id = t.project_id AND fprr.job_title_id = tm.job_title_id
          WHERE t.project_id = p.id AND t.archived = false
        ), 0)::FLOAT AS time_based_cost,
        COALESCE((SELECT SUM(COALESCE(t.total_minutes, 0))::FLOAT / 60.0 FROM tasks t WHERE t.project_id = p.id AND t.archived = false AND t.parent_task_id IS NULL), 0)::FLOAT AS estimated_hours,
        COALESCE((SELECT SUM(COALESCE(wl.time_spent, 0))::FLOAT / 3600.0 FROM tasks t JOIN task_work_log wl ON wl.task_id = t.id WHERE t.project_id = p.id AND t.archived = false), 0)::FLOAT AS logged_hours,
        (SELECT COUNT(*)::INT FROM tasks t WHERE t.project_id = p.id AND t.archived = false) AS total_tasks,
        (SELECT COUNT(*)::INT FROM tasks t JOIN task_statuses ts ON ts.id = t.status_id WHERE t.project_id = p.id AND t.archived = false AND ts.category = 2) AS completed_tasks
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.team_id = $1
        AND NOT EXISTS (SELECT 1 FROM archived_projects ap WHERE ap.project_id = p.id AND ap.user_id = $2)
      ORDER BY p.name ASC;
    `;
    const result = await db.query(q, [teamId, userId]);
    const projects = result.rows.map((row: any) => {
      const actual_cost = (row.fixed_cost ?? 0) + (row.time_based_cost ?? 0);
      const budget = row.budget ?? 0;
      return {
        ...row, actual_cost,
        variance: budget - actual_cost,
        utilization_pct: budget > 0 ? Math.round((actual_cost / budget) * 100) : 0,
        completion_pct: row.total_tasks > 0 ? Math.round((row.completed_tasks / row.total_tasks) * 100) : 0,
      };
    });

    const totals = projects.reduce(
      (acc: any, p: any) => ({
        total_budget: acc.total_budget + (p.budget ?? 0),
        total_actual: acc.total_actual + p.actual_cost,
        total_variance: acc.total_variance + p.variance,
        project_count: acc.project_count + 1,
        over_budget_count: acc.over_budget_count + (p.actual_cost > p.budget && p.budget > 0 ? 1 : 0),
        on_track_count: acc.on_track_count + (p.utilization_pct <= 80 && p.budget > 0 ? 1 : 0),
      }),
      { total_budget: 0, total_actual: 0, total_variance: 0, project_count: 0, over_budget_count: 0, on_track_count: 0 }
    );
    return res.status(200).send(new ServerResponse(true, { projects, totals }));
  }

  @HandleExceptions()
  public static async getBillableTime(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Missing team context"));

    const q = `
      SELECT
        p.id, p.name,
        COALESCE(p.color_code, '#1890ff') AS color_code,
        COALESCE(p.currency, 'USD') AS currency,
        COALESCE(SUM(CASE WHEN t.billable THEN wl.time_spent ELSE 0 END), 0)::FLOAT AS billable_seconds,
        COALESCE(SUM(CASE WHEN NOT t.billable THEN wl.time_spent ELSE 0 END), 0)::FLOAT AS non_billable_seconds,
        COALESCE(SUM(wl.time_spent), 0)::FLOAT AS total_seconds,
        COALESCE(SUM(CASE WHEN t.billable THEN (wl.time_spent::FLOAT / 3600.0) * COALESCE(fprr.rate, 0)::FLOAT ELSE 0 END), 0)::FLOAT AS billable_cost,
        COALESCE(SUM(CASE WHEN NOT t.billable THEN (wl.time_spent::FLOAT / 3600.0) * COALESCE(fprr.rate, 0)::FLOAT ELSE 0 END), 0)::FLOAT AS non_billable_cost
      FROM projects p
      JOIN tasks t ON t.project_id = p.id AND t.archived = false
      JOIN task_work_log wl ON wl.task_id = t.id
      LEFT JOIN team_members tm ON tm.id = wl.user_id AND tm.team_id = p.team_id
      LEFT JOIN finance_project_rate_card_roles fprr ON fprr.project_id = t.project_id AND fprr.job_title_id = tm.job_title_id
      WHERE p.team_id = $1
        AND NOT EXISTS (SELECT 1 FROM archived_projects ap WHERE ap.project_id = p.id AND ap.user_id = $2)
      GROUP BY p.id, p.name, p.color_code, p.currency
      ORDER BY p.name ASC;
    `;
    const result = await db.query(q, [teamId, userId]);
    const projects = result.rows.map((row: any) => ({
      ...row,
      billable_hours: row.billable_seconds / 3600,
      non_billable_hours: row.non_billable_seconds / 3600,
      total_hours: row.total_seconds / 3600,
      billable_pct: row.total_seconds > 0 ? Math.round((row.billable_seconds / row.total_seconds) * 100) : 0,
    }));

    const totals = projects.reduce(
      (acc: any, p: any) => ({
        billable_hours: acc.billable_hours + p.billable_hours,
        non_billable_hours: acc.non_billable_hours + p.non_billable_hours,
        total_hours: acc.total_hours + p.total_hours,
        billable_cost: acc.billable_cost + (p.billable_cost ?? 0),
        non_billable_cost: acc.non_billable_cost + (p.non_billable_cost ?? 0),
      }),
      { billable_hours: 0, non_billable_hours: 0, total_hours: 0, billable_cost: 0, non_billable_cost: 0 }
    );
    totals.billable_pct = totals.total_hours > 0 ? Math.round((totals.billable_hours / totals.total_hours) * 100) : 0;
    return res.status(200).send(new ServerResponse(true, { projects, totals }));
  }

  @HandleExceptions()
  public static async getProfitability(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Missing team context"));

    const q = `
      SELECT
        p.id, p.name,
        COALESCE(p.color_code, '#1890ff') AS color_code,
        c.name AS client_name,
        COALESCE(p.budget, 0)::FLOAT AS revenue,
        COALESCE(p.currency, 'USD') AS currency,
        COALESCE((SELECT SUM(COALESCE(t.fixed_cost, 0)) FROM tasks t WHERE t.project_id = p.id AND t.archived = false), 0)::FLOAT AS fixed_cost,
        COALESCE((
          SELECT SUM((COALESCE(wl.time_spent, 0)::FLOAT / 3600.0) * COALESCE(fprr.rate, 0)::FLOAT)
          FROM tasks t JOIN task_work_log wl ON wl.task_id = t.id
          LEFT JOIN team_members tm ON tm.id = wl.user_id AND tm.team_id = p.team_id
          LEFT JOIN finance_project_rate_card_roles fprr ON fprr.project_id = t.project_id AND fprr.job_title_id = tm.job_title_id
          WHERE t.project_id = p.id AND t.archived = false
        ), 0)::FLOAT AS time_based_cost
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.team_id = $1
        AND NOT EXISTS (SELECT 1 FROM archived_projects ap WHERE ap.project_id = p.id AND ap.user_id = $2)
      ORDER BY p.name ASC;
    `;
    const result = await db.query(q, [teamId, userId]);
    const projects = result.rows.map((row: any) => {
      const total_cost = (row.fixed_cost ?? 0) + (row.time_based_cost ?? 0);
      const revenue = row.revenue ?? 0;
      const profit = revenue - total_cost;
      return { ...row, total_cost, profit, margin_pct: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 };
    });

    const totals = projects.reduce(
      (acc: any, p: any) => ({
        total_revenue: acc.total_revenue + (p.revenue ?? 0),
        total_cost: acc.total_cost + p.total_cost,
        total_profit: acc.total_profit + p.profit,
      }),
      { total_revenue: 0, total_cost: 0, total_profit: 0 }
    );
    totals.margin_pct = totals.total_revenue > 0 ? Math.round((totals.total_profit / totals.total_revenue) * 100) : 0;
    return res.status(200).send(new ServerResponse(true, { projects, totals }));
  }

  @HandleExceptions()
  public static async getUtilization(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Missing team context"));

    const q = `
      SELECT
        tm.id AS member_id,
        u.name AS member_name,
        u.avatar_url,
        jt.name AS job_title,
        COALESCE(SUM(wl.time_spent), 0)::FLOAT AS total_logged_seconds,
        COALESCE(SUM(CASE WHEN t.billable THEN wl.time_spent ELSE 0 END), 0)::FLOAT AS billable_seconds,
        COALESCE(SUM(CASE WHEN NOT t.billable THEN wl.time_spent ELSE 0 END), 0)::FLOAT AS non_billable_seconds,
        COUNT(DISTINCT t.project_id)::INT AS project_count,
        COALESCE(SUM((wl.time_spent::FLOAT / 3600.0) * COALESCE(fprr.rate, 0)::FLOAT), 0)::FLOAT AS total_cost
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN job_titles jt ON jt.id = tm.job_title_id
      LEFT JOIN task_work_log wl ON wl.user_id = tm.id
      LEFT JOIN tasks t ON t.id = wl.task_id AND t.archived = false
      LEFT JOIN finance_project_rate_card_roles fprr ON fprr.project_id = t.project_id AND fprr.job_title_id = tm.job_title_id
      WHERE tm.team_id = $1 AND tm.active = true
      GROUP BY tm.id, u.name, u.avatar_url, jt.name
      ORDER BY total_logged_seconds DESC;
    `;
    const result = await db.query(q, [teamId]);
    const members = result.rows.map((row: any) => ({
      ...row,
      total_hours: row.total_logged_seconds / 3600,
      billable_hours: row.billable_seconds / 3600,
      non_billable_hours: row.non_billable_seconds / 3600,
      billable_pct: row.total_logged_seconds > 0 ? Math.round((row.billable_seconds / row.total_logged_seconds) * 100) : 0,
    }));

    const totals = members.reduce(
      (acc: any, m: any) => ({
        total_hours: acc.total_hours + m.total_hours,
        billable_hours: acc.billable_hours + m.billable_hours,
        non_billable_hours: acc.non_billable_hours + m.non_billable_hours,
        total_cost: acc.total_cost + (m.total_cost ?? 0),
        member_count: acc.member_count + 1,
      }),
      { total_hours: 0, billable_hours: 0, non_billable_hours: 0, total_cost: 0, member_count: 0 }
    );
    totals.billable_pct = totals.total_hours > 0 ? Math.round((totals.billable_hours / totals.total_hours) * 100) : 0;
    return res.status(200).send(new ServerResponse(true, { members, totals }));
  }

  @HandleExceptions()
  public static async getForecasts(
    req: IWorkLenzRequest,
    res: IWorkLenzResponse
  ): Promise<IWorkLenzResponse> {
    const teamId = req.user?.team_id;
    const userId = req.user?.id;
    if (!teamId) return res.status(400).send(new ServerResponse(false, null, "Missing team context"));

    const q = `
      SELECT
        p.id, p.name,
        COALESCE(p.color_code, '#1890ff') AS color_code,
        c.name AS client_name,
        COALESCE(p.budget, 0)::FLOAT AS budget,
        COALESCE(p.currency, 'USD') AS currency,
        p.start_date, p.end_date,
        COALESCE((SELECT SUM(COALESCE(t.fixed_cost, 0)) FROM tasks t WHERE t.project_id = p.id AND t.archived = false), 0)::FLOAT AS fixed_cost,
        COALESCE((
          SELECT SUM((COALESCE(wl.time_spent, 0)::FLOAT / 3600.0) * COALESCE(fprr.rate, 0)::FLOAT)
          FROM tasks t JOIN task_work_log wl ON wl.task_id = t.id
          LEFT JOIN team_members tm ON tm.id = wl.user_id AND tm.team_id = p.team_id
          LEFT JOIN finance_project_rate_card_roles fprr ON fprr.project_id = t.project_id AND fprr.job_title_id = tm.job_title_id
          WHERE t.project_id = p.id AND t.archived = false
        ), 0)::FLOAT AS time_based_cost,
        COALESCE((SELECT SUM(COALESCE(t.total_minutes, 0))::FLOAT / 60.0 FROM tasks t WHERE t.project_id = p.id AND t.archived = false AND t.parent_task_id IS NULL), 0)::FLOAT AS estimated_hours,
        COALESCE((SELECT SUM(COALESCE(wl.time_spent, 0))::FLOAT / 3600.0 FROM tasks t JOIN task_work_log wl ON wl.task_id = t.id WHERE t.project_id = p.id AND t.archived = false), 0)::FLOAT AS logged_hours,
        (SELECT COUNT(*)::INT FROM tasks t WHERE t.project_id = p.id AND t.archived = false) AS total_tasks,
        (SELECT COUNT(*)::INT FROM tasks t JOIN task_statuses ts ON ts.id = t.status_id WHERE t.project_id = p.id AND t.archived = false AND ts.category = 2) AS completed_tasks,
        (SELECT MIN(wl2.created_at) FROM tasks t2 JOIN task_work_log wl2 ON wl2.task_id = t2.id WHERE t2.project_id = p.id) AS first_log_date
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.team_id = $1
        AND NOT EXISTS (SELECT 1 FROM archived_projects ap WHERE ap.project_id = p.id AND ap.user_id = $2)
      ORDER BY p.name ASC;
    `;
    const result = await db.query(q, [teamId, userId]);
    const now = new Date();
    const projects = result.rows.map((row: any) => {
      const actual_cost = (row.fixed_cost ?? 0) + (row.time_based_cost ?? 0);
      const budget = row.budget ?? 0;
      const remaining_budget = Math.max(0, budget - actual_cost);
      const completion_pct = row.total_tasks > 0 ? Math.round((row.completed_tasks / row.total_tasks) * 100) : 0;
      const firstLogDate = row.first_log_date ? new Date(row.first_log_date) : null;
      const daysSinceStart = firstLogDate ? Math.max(1, Math.ceil((now.getTime() - firstLogDate.getTime()) / 86400000)) : 0;
      const daily_burn_rate = daysSinceStart > 0 ? actual_cost / daysSinceStart : 0;
      const days_remaining_at_rate = daily_burn_rate > 0 ? Math.ceil(remaining_budget / daily_burn_rate) : null;
      const estimated_total_cost = completion_pct > 0 ? Math.round(actual_cost / (completion_pct / 100)) : actual_cost;
      const projected_overrun = estimated_total_cost - budget;
      return {
        id: row.id, name: row.name, color_code: row.color_code, client_name: row.client_name,
        budget, currency: row.currency, actual_cost, remaining_budget, completion_pct,
        logged_hours: row.logged_hours, estimated_hours: row.estimated_hours,
        daily_burn_rate: Math.round(daily_burn_rate * 100) / 100,
        days_remaining_at_rate, estimated_total_cost: Math.round(estimated_total_cost),
        projected_overrun: Math.round(projected_overrun),
        start_date: row.start_date, end_date: row.end_date,
      };
    });
    const totals = projects.reduce(
      (acc: any, p: any) => ({
        total_budget: acc.total_budget + p.budget,
        total_actual: acc.total_actual + p.actual_cost,
        total_remaining: acc.total_remaining + p.remaining_budget,
        total_estimated: acc.total_estimated + p.estimated_total_cost,
        total_overrun: acc.total_overrun + p.projected_overrun,
      }),
      { total_budget: 0, total_actual: 0, total_remaining: 0, total_estimated: 0, total_overrun: 0 }
    );
    return res.status(200).send(new ServerResponse(true, { projects, totals }));
  }

}
