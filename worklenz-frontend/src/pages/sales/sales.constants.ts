import type { SalesDealStage } from '@/types/sales/sales.types';

export const STAGE_COLORS: Record<SalesDealStage, string> = {
  new: '#8c8c8c',
  contacted: '#1677ff',
  qualified: '#13c2c2',
  proposal: '#722ed1',
  won: '#52c41a',
  lost: '#ff4d4f',
};

export const formatMoney = (value: number | string | null | undefined, currency = 'USD'): string => {
  const amount = Number(value || 0);
  return `${currency} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)}`;
};
