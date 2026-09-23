export type InvitationFailureReason = "expired" | "revoked" | "limit" | "invalid";

export function classifyInvitationError(message?: string | null): InvitationFailureReason {
  const text = (message || "").toLowerCase();
  if (text.includes("expired") || text.includes("no longer valid")) return "expired";
  if (text.includes("no longer active") || text.includes("revoked")) return "revoked";
  if (text.includes("usage limit")) return "limit";
  return "invalid";
}
