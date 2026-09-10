/**
 * Sentry configuration - DISABLED
 * Error tracking has been disabled for independence.
 * To re-enable, install @sentry/react and configure your own DSN.
 */

export const initSentry = () => {
  // No-op: Sentry disabled
};

export const captureException = (_error: Error, _context?: Record<string, unknown>) => {
  // No-op: Sentry disabled
};

export const captureMessage = (
  _message: string,
  _level: string = 'info',
  _context?: Record<string, unknown>
) => {
  // No-op: Sentry disabled
};

export const setUser = (_user: unknown) => {
  // No-op: Sentry disabled
};

export const setTag = (_key: string, _value: string) => {
  // No-op: Sentry disabled
};

export const addBreadcrumb = (_breadcrumb: Record<string, unknown>) => {
  // No-op: Sentry disabled
};

export const startSpan = (
  _name: string,
  _op: string = 'navigation',
  fn: () => void | Promise<void>
) => {
  return fn();
};

export const measurePerformance = (_name: string, fn: () => void | Promise<void>) => {
  return fn();
};

export default {};
