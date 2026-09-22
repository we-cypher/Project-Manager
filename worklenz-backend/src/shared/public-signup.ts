/**
 * Public self-signup creates a new organization. This fork is invite-only
 * unless DISABLE_PUBLIC_SIGNUP is explicitly set to "false".
 */
export function isPublicSignupDisabled(): boolean {
  const value = (process.env.DISABLE_PUBLIC_SIGNUP || "true").trim().toLowerCase();
  return value !== "false" && value !== "0";
}

export function hasInviteSignupIds(teamId?: unknown, teamMemberId?: unknown): boolean {
  return typeof teamId === "string" && teamId.length > 0
    && typeof teamMemberId === "string" && teamMemberId.length > 0;
}

export const PUBLIC_SIGNUP_DISABLED_MESSAGE =
  "Public registration is disabled. Use an invitation link to join the organization.";
