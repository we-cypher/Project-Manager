/**
 * Sentry integration hook - DISABLED
 * Error tracking has been disabled for independence.
 */

export const useSentryIntegration = () => {
  // No-op: Sentry disabled
};

export const trackAnalyticsEvent = (_eventName: string, _properties?: Record<string, unknown>) => {
  // No-op
};

export const trackPerformance = (_operationName: string, _startTime: number, _endTime?: number) => {
  // No-op
};

export const trackApiError = (_error: unknown, _endpoint: string, _method: string, _payload?: unknown) => {
  // No-op
};

export const trackFeatureUsage = (
  _featureName: string,
  _action: string,
  _properties?: Record<string, unknown>
) => {
  // No-op
};

export default useSentryIntegration;
