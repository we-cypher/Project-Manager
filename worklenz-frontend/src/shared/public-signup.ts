/**
 * Public self-signup is off unless VITE_DISABLE_PUBLIC_SIGNUP is explicitly "false".
 * Invitation links still open /auth/signup with team + user query params.
 */
export function isPublicSignupDisabled(): boolean {
  const value = String(import.meta.env.VITE_DISABLE_PUBLIC_SIGNUP ?? "true").toLowerCase();
  return value !== "false" && value !== "0";
}
