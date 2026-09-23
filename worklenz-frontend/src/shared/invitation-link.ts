export type InvitationFailureReason = 'expired' | 'revoked' | 'limit' | 'invalid';

export function classifyInvitationError(
  message?: string | null,
  reason?: string | null
): InvitationFailureReason {
  if (reason === 'expired' || reason === 'revoked' || reason === 'limit' || reason === 'invalid') {
    return reason;
  }

  const text = (message || '').toLowerCase();
  if (text.includes('expired') || text.includes('no longer valid')) return 'expired';
  if (text.includes('no longer active') || text.includes('revoked')) return 'revoked';
  if (text.includes('usage limit')) return 'limit';
  return 'invalid';
}

export function isExpiredInvitation(
  message?: string | null,
  reason?: string | null
): boolean {
  return classifyInvitationError(message, reason) === 'expired';
}
