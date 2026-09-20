import { useEffect } from 'react';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import { fetchOrgConfig } from '@/features/org-config/org-config.slice';
import { DEFAULT_CURRENCY } from '@/shared/currencies';

export const useOrgCurrency = (): string => {
  const dispatch = useAppDispatch();
  const baseCurrency = useAppSelector(state => state.orgConfigReducer.base_currency);
  const isInitialized = useAppSelector(state => state.orgConfigReducer.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      void dispatch(fetchOrgConfig());
    }
  }, [dispatch, isInitialized]);

  return (baseCurrency || DEFAULT_CURRENCY).toUpperCase();
};
