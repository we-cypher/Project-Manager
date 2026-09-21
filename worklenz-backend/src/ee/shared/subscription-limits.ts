interface ISubscriptionDataForLimits {
  effective_user_limit?: number | string | null;
  quantity?: number | string | null;
  is_ltd?: boolean | null;
  ltd_users?: number | string | null;
}

const parsePositiveInt = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

/**
 * Whether team-member seat caps should be enforced.
 * Self-hosted: never enforce (same policy as Business feature gates).
 * Also honors organizations.team_member_limit_override when that flag is set.
 */
export const shouldEnforceTeamMemberSeatLimits = (
  _subscriptionData?: { team_member_limit_override?: unknown } | null,
): boolean => {
  // Self-hosted policy: never cap seats. The DB override is still set TRUE
  // so older builds and other code paths that still read the flag stay unlocked.
  return false;
};

export const getTeamMemberSeatLimit = (
  subscriptionData: ISubscriptionDataForLimits | null | undefined,
  defaultLimit = 25,
): number => {
  const effectiveUserLimit = parsePositiveInt(
    subscriptionData?.effective_user_limit,
  );
  const quantityLimit = parsePositiveInt(subscriptionData?.quantity);

  // Lifetime/AppSumo codes can grant extra member capacity; keep that entitlement
  // even when the org is on an active paid subscription.
  const ltdLimit =
    subscriptionData?.is_ltd === true
      ? parsePositiveInt(subscriptionData?.ltd_users)
      : 0;

  return Math.max(defaultLimit, effectiveUserLimit, quantityLimit, ltdLimit);
};

