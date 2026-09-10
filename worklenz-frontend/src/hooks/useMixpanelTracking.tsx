/**
 * Mixpanel tracking hook - DISABLED
 * Analytics tracking has been removed for independence.
 */

import { useCallback } from 'react';

export const useMixpanelTracking = () => {
  const setIdentity = useCallback((_user: unknown) => {
    // No-op: Mixpanel disabled
  }, []);

  const reset = useCallback(() => {
    // No-op: Mixpanel disabled
  }, []);

  const trackMixpanelEvent = useCallback((_event: string, _properties?: Record<string, unknown>) => {
    // No-op: Mixpanel disabled
  }, []);

  return {
    setIdentity,
    reset,
    trackMixpanelEvent,
  };
};
