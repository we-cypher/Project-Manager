import db from "../config/db";

export type InvitationFailureReason = "expired" | "revoked" | "limit" | "invalid";

export interface InvitationLinkValidation {
  is_valid: boolean;
  link_id: string | null;
  team_id: string | null;
  project_id: string | null;
  expires_at: Date | null;
  max_usage: number | null;
  usage_count: number | null;
  job_title_id: string | null;
  role_name: string | null;
  is_admin: boolean | null;
  access_level: string | null;
  error_message: string | null;
}

export function classifyInvitationError(message?: string | null): InvitationFailureReason {
  const text = (message || "").toLowerCase();
  if (text.includes("expired") || text.includes("no longer valid")) return "expired";
  if (text.includes("no longer active") || text.includes("revoked")) return "revoked";
  if (text.includes("usage limit")) return "limit";
  return "invalid";
}

function invalidResult(message: string): InvitationLinkValidation {
  return {
    is_valid: false,
    link_id: null,
    team_id: null,
    project_id: null,
    expires_at: null,
    max_usage: null,
    usage_count: null,
    job_title_id: null,
    role_name: null,
    is_admin: null,
    access_level: null,
    error_message: message,
  };
}

export async function validateInvitationLink(
  token: string,
  linkType: "team" | "project"
): Promise<InvitationLinkValidation> {
  const table = linkType === "team" ? "team_invitation_links" : "project_invitation_links";
  const extraSelect = linkType === "project" ? "project_id, access_level" : "NULL::uuid AS project_id, NULL::varchar AS access_level";

  const result = await db.query(
    `SELECT
        id,
        team_id,
        ${extraSelect},
        expires_at,
        max_usage,
        usage_count,
        job_title_id,
        role_name,
        is_admin,
        status
     FROM ${table}
     WHERE token = $1
     LIMIT 1`,
    [token]
  );

  if (!result.rowCount) {
    return invalidResult("Invalid invitation link");
  }

  const row = result.rows[0];
  if (row.status !== "active") {
    return {
      ...mapRow(row),
      is_valid: false,
      error_message: "Invitation link is no longer active",
    };
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return {
      ...mapRow(row),
      is_valid: false,
      error_message: "Invitation link has expired",
    };
  }
  if (row.max_usage != null && Number(row.usage_count) >= Number(row.max_usage)) {
    return {
      ...mapRow(row),
      is_valid: false,
      error_message: "Invitation link usage limit reached",
    };
  }

  return {
    ...mapRow(row),
    is_valid: true,
    error_message: null,
  };
}

function mapRow(row: any): InvitationLinkValidation {
  return {
    is_valid: true,
    link_id: row.id,
    team_id: row.team_id,
    project_id: row.project_id || null,
    expires_at: row.expires_at || null,
    max_usage: row.max_usage ?? null,
    usage_count: row.usage_count ?? 0,
    job_title_id: row.job_title_id || null,
    role_name: row.role_name || null,
    is_admin: row.is_admin ?? false,
    access_level: row.access_level || null,
    error_message: null,
  };
}

export async function hasActiveEmailInvite(teamId: string, teamMemberId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1
     FROM email_invitations
     WHERE team_id = $1
       AND team_member_id = $2
     UNION ALL
     SELECT 1
     FROM team_members
     WHERE team_id = $1
       AND id = $2
     LIMIT 1`,
    [teamId, teamMemberId]
  );
  return Boolean(result.rowCount);
}
