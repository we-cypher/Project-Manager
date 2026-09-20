export type SalesDealType = 'service' | 'saas';
export type SalesDealStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
export type SalesDealSource = 'website' | 'referral' | 'cold' | 'existing' | 'other';
export type SalesActivityType = 'call' | 'meeting' | 'task' | 'note' | 'reminder';
export type SalesProductKind = 'service' | 'saas';

export interface ISalesOnboardingStep {
  id?: string;
  title: string;
  activity_type: 'meeting' | 'task';
  sort_order?: number;
}

export interface ISalesProduct {
  id: string;
  team_id?: string;
  name: string;
  kind: SalesProductKind;
  onboarding_steps?: ISalesOnboardingStep[];
  created_at?: string;
  updated_at?: string;
}

export interface ISalesDeal {
  id: string;
  team_id?: string;
  name: string;
  deal_type: SalesDealType;
  stage: SalesDealStage;
  source: SalesDealSource;
  client_id?: string | null;
  client_name?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  product_kind?: SalesProductKind | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  budget?: number | string | null;
  amount?: number | string | null;
  currency?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  expected_close_date?: string | null;
  lost_reason?: string | null;
  notes?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  onboarding_applied?: boolean;
  next_due_at?: string | null;
  next_due_title?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ISalesDealPayload {
  name: string;
  deal_type: SalesDealType;
  stage?: SalesDealStage;
  source?: SalesDealSource;
  client_id?: string | null;
  product_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  budget?: number;
  amount?: number;
  currency?: string;
  owner_id?: string | null;
  expected_close_date?: string | null;
  notes?: string | null;
}

export interface ISalesActivity {
  id: string;
  deal_id: string;
  team_id?: string;
  type: SalesActivityType;
  title: string;
  description?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ISalesOwner {
  id: string;
  name: string;
  email?: string;
}

export interface ISalesProjectLookup {
  id: string;
  name: string;
}

export const SALES_STAGES: SalesDealStage[] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost',
];

export const SALES_SOURCES: SalesDealSource[] = [
  'website',
  'referral',
  'cold',
  'existing',
  'other',
];

export const SALES_ACTIVITY_TYPES: SalesActivityType[] = [
  'call',
  'meeting',
  'task',
  'note',
  'reminder',
];
