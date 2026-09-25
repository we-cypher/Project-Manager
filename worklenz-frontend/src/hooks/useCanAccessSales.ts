import { useEffect, useState } from 'react';

import { salesApiService } from '@/api/sales/sales.api.service';
import { useAuthService } from '@/hooks/useAuth';

const accessCache = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();

const fetchCanAccessSales = (
  teamId: string | undefined,
  userId: string | undefined,
  isOwnerOrAdmin: boolean
): Promise<boolean> => {
  if (isOwnerOrAdmin) return Promise.resolve(true);
  if (!teamId || !userId) return Promise.resolve(false);

  const key = `${teamId}:${userId}`;
  const cached = accessCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = salesApiService
    .getMyAccess()
    .then(response => {
      if (!response.done) return false;
      const allowed = Boolean(response.body?.can_access);
      accessCache.set(key, allowed);
      return allowed;
    })
    .catch(() => false)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
};

export const useCanAccessSales = () => {
  const authService = useAuthService();
  const session = authService.getCurrentSession();
  const isOwnerOrAdmin = authService.isOwnerOrAdmin();
  const [canAccess, setCanAccess] = useState(isOwnerOrAdmin);
  const [isLoading, setIsLoading] = useState(!isOwnerOrAdmin);

  useEffect(() => {
    let cancelled = false;

    if (isOwnerOrAdmin) {
      setCanAccess(true);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    void fetchCanAccessSales(session?.team_id, session?.id, false).then(allowed => {
      if (cancelled) return;
      setCanAccess(allowed);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOwnerOrAdmin, session?.id, session?.team_id]);

  return { canAccess, isLoading };
};
