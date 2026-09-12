import { ISUBSCRIPTION_TYPE } from '@/shared/constants';
import { ILocalSession } from '@/types/auth/local-session.types';

/**
 * Checks if user has access to business features (client portal, project finance).
 * Self-hosted: all features unlocked unconditionally.
 */
export const hasBusinessFeatureAccess = (_session: ILocalSession | null): boolean => {
  return true;
};

/**
 * Checks if user is on a business plan specifically.
 * Self-hosted: always true.
 */
export const isBusinessPlan = (_session: ILocalSession | null): boolean => {
  return true;
};

/**
 * Checks if user is on an enterprise plan specifically.
 * Self-hosted: always true.
 */
export const isEnterprisePlan = (_session: ILocalSession | null): boolean => {
  return true;
};

/**
 * Checks if user is on a free plan.
 * Self-hosted: never considered free.
 */
export const isFreeUser = (_session: ILocalSession | null): boolean => {
  return false;
};

/**
 * Get the subscription plan type for display purposes
 */
export const getSubscriptionPlanType = (session: ILocalSession | null): string => {
  if (!session) return 'Unknown';

  // Check for plan trials first
  if (session.subscription_type === 'BUSINESS_TRIAL') {
    return 'Business Trial';
  }
  if (session.subscription_type === 'ENTERPRISE_TRIAL') {
    return 'Enterprise Trial';
  }
  if (session.subscription_type === 'PLAN_TRIAL') {
    return `${session.trial_plan_display_name || 'Plan'} Trial`;
  }

  switch (session.subscription_type) {
    case ISUBSCRIPTION_TYPE.FREE:
      return 'Free';
    case ISUBSCRIPTION_TYPE.TRIAL:
      return 'Trial';
    case ISUBSCRIPTION_TYPE.LIFE_TIME_DEAL:
      return 'Lifetime Deal';
    case ISUBSCRIPTION_TYPE.CUSTOM:
      return 'Custom';
    case ISUBSCRIPTION_TYPE.CREDIT:
      return 'Credit';
    case ISUBSCRIPTION_TYPE.ANNUAL_PRO:
      return 'Annual Pro';
    case ISUBSCRIPTION_TYPE.ANNUAL_BUSINESS:
      return 'Annual Business';
    case ISUBSCRIPTION_TYPE.SELF_HOSTED:
      return 'Self Hosted';
    case ISUBSCRIPTION_TYPE.PADDLE:
      const planName = session.plan_name?.toLowerCase() || '';
      if (planName.includes('business')) return 'Business';
      if (planName.includes('enterprise')) return 'Enterprise';
      if (planName.includes('pro')) return 'Pro';
      return 'Paddle';
    default:
      return 'Unknown';
  }
};

/**
 * Checks if user is currently on a plan-specific trial
 */
export const isOnPlanTrial = (session: ILocalSession | null): boolean => {
  if (!session) return false;
  return Boolean(
    session.is_plan_trial || (session.active_plan_trial && session.plan_trial_end_date)
  );
};

/**
 * Gets the number of days remaining in a plan trial
 */
export const getPlanTrialDaysRemaining = (session: ILocalSession | null): number => {
  if (!session?.plan_trial_end_date) return 0;

  const endDate = new Date(session.plan_trial_end_date);
  const today = new Date();
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
};

/**
 * Checks if user is on a Business plan trial specifically
 */
export const isOnBusinessTrial = (session: ILocalSession | null): boolean => {
  if (!session) return false;
  return (
    session.subscription_type === 'BUSINESS_TRIAL' ||
    (session.active_plan_trial === 'BUSINESS_LARGE' && Boolean(session.plan_trial_end_date))
  );
};

/**
 * Gets trial expiration message
 */
export const getTrialExpirationMessage = (session: ILocalSession | null): string | null => {
  if (!isOnPlanTrial(session)) return null;

  const daysRemaining = getPlanTrialDaysRemaining(session);
  const planName = session?.trial_plan_display_name || 'Plan';

  if (daysRemaining === 0) {
    return `Your ${planName} trial expires today`;
  } else if (daysRemaining === 1) {
    return `Your ${planName} trial expires tomorrow`;
  } else if (daysRemaining <= 3) {
    return `Your ${planName} trial expires in ${daysRemaining} days`;
  }

  return null;
};

/**
 * Checks if user should be restricted from setting project health
 * NOTE: Project health is now available to all users regardless of subscription plan
 */
export const shouldRestrictProjectHealth = (session: ILocalSession | null): boolean => {
  // No restrictions - all users can access project health
  return false;
};

const LIFETIME_KEYWORDS = ['appsumo', 'life_time_deal', 'lifetime', 'life time'];

/**
 * Checks if a user is on an AppSumo / lifetime deal (LTD) plan.
 * Centralized detection used across layouts and promotional surfaces.
 */
export const isAppSumoUser = (
  session: ILocalSession | null,
  billingInfo?: { plan_name?: string; subscription_type?: string } | null
): boolean => {
  const fields = [
    billingInfo?.plan_name,
    billingInfo?.subscription_type,
    session?.subscription_type,
    session?.subscription_status,
  ].map(value => value?.toLowerCase() ?? '');

  return fields.some(field => LIFETIME_KEYWORDS.some(keyword => field.includes(keyword)));
};

// Once an AppSumo/LTD user redeems this many codes they're already on Business
// Plan (see deserialize_user's appsumo_business_eligible), same threshold used
// for the in-app "redeem more codes" prompt in CurrentPlanDetails.tsx.
const APPSUMO_BUSINESS_UNLOCK_CODE_COUNT = 5;

/**
 * Checks if an AppSumo/LTD user should still see promotional upsell surfaces
 * (the promo popup, the notification drawer banner) nudging them to upgrade
 * to Business Plan. Once a user has already redeemed enough codes to be on
 * Business Plan, that promo is backwards, so this excludes them even though
 * isAppSumoUser() (used elsewhere for LTD-specific UI, unrelated to this
 * promo) still correctly reports them as an LTD account.
 */
export const shouldShowAppSumoPromo = (
  session: ILocalSession | null,
  billingInfo?: {
    plan_name?: string;
    subscription_type?: string;
    redeemed_codes_count?: number;
  } | null
): boolean => {
  if (!isAppSumoUser(session, billingInfo)) return false;

  const redeemedCodesCount = billingInfo?.redeemed_codes_count ?? session?.redeemed_codes_count ?? 0;
  const planName = billingInfo?.plan_name ?? session?.plan_name;

  return redeemedCodesCount < APPSUMO_BUSINESS_UNLOCK_CODE_COUNT && planName !== 'Business Plan';
};

/**
 * Checks if user should be restricted from using the billable feature.
 * Self-hosted: no restrictions.
 */
export const shouldRestrictBillableFeature = (_session: ILocalSession | null): boolean => {
  return false;
};
