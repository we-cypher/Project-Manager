export type ManagedBy = 'us' | 'client';
export type WebsiteStatus = 'active' | 'suspended' | 'expired' | 'archived';
export type RenewalItem = 'domain' | 'hosting';

export interface IWebsiteListItem {
  id: string;
  name: string;
  domain: string;
  status: WebsiteStatus;
  client_id: string | null;
  client_name: string | null;
  project_id?: string | null;
  domain_managed_by: ManagedBy;
  domain_expiry: string | null;
  hosting_managed_by: ManagedBy;
  hosting_provider: string | null;
  hosting_expiry: string | null;
  dns_manager: string | null;
  nearest_expiry: string | null;
  days_remaining: number | null;
}

export interface IWebsiteRenewal {
  id: string;
  item: RenewalItem;
  previous_expiry: string | null;
  new_expiry: string;
  renewed_at: string;
  note: string | null;
  renewed_by_name: string | null;
}

export interface IWebsiteTaskLink {
  item: RenewalItem;
  expiry_date: string;
  task_id: string;
  task_name: string;
  project_id: string;
}

export interface IWebsite extends IWebsiteListItem {
  team_id: string;
  domain_provider: string | null;
  domain_account_email: string | null;
  hosting_plan: string | null;
  notes: string | null;
  credentials_ref: string | null;
  project_name?: string | null;
  archived_at?: string | null;
  renewals?: IWebsiteRenewal[];
  tasks?: IWebsiteTaskLink[];
}

export interface IWebsitePayload {
  name: string;
  domain: string;
  client_id?: string | null;
  project_id?: string | null;
  status: WebsiteStatus;
  domain_managed_by: ManagedBy;
  domain_provider?: string | null;
  domain_account_email?: string | null;
  domain_expiry?: string | null;
  hosting_managed_by: ManagedBy;
  hosting_provider?: string | null;
  hosting_plan?: string | null;
  hosting_expiry?: string | null;
  dns_manager?: string | null;
  notes?: string | null;
  credentials_ref?: string | null;
}

export interface IWebsiteSummary {
  total: number;
  expiring_30: number;
  expired: number;
  expiring_10: number;
  both_us: number;
  hosting_us: number;
  domain_us: number;
  client_managed: number;
}

export interface IWebsiteFilters {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; client_id: string | null }[];
  providers: string[];
  dns_managers: string[];
}

export interface IWebsiteSettings {
  team_id: string;
  task_lead_days: number;
  intervals_days: number[];
  task_project_id: string | null;
  timezone: string | null;
}

export interface IWebsiteImportFailure {
  row: number;
  domain: string;
  message: string;
}

export interface IWebsiteImportResult {
  created: number;
  failed: IWebsiteImportFailure[];
}

export interface IWebsiteListQuery {
  index: number;
  size: number;
  field?: string;
  order?: 'asc' | 'desc';
  search?: string;
  management?: string;
  expiry?: string;
  client_id?: string;
  provider?: string;
  dns_manager?: string;
  status?: string;
  include_archived?: boolean;
}
