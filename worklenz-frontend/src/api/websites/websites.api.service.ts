import apiClient from '@api/api-client';
import { API_BASE_URL } from '@/shared/constants';
import { IServerResponse } from '@/types/common.types';
import { toQueryString } from '@/utils/toQueryString';
import {
  IWebsite,
  IWebsiteFilters,
  IWebsiteListItem,
  IWebsiteListQuery,
  IWebsitePayload,
  IWebsiteSettings,
  IWebsiteSummary,
  RenewalItem,
} from '@/types/websites/website.types';

const rootUrl = `${API_BASE_URL}/websites`;

export const websitesApiService = {
  async list(query: IWebsiteListQuery): Promise<IServerResponse<{ total: number; data: IWebsiteListItem[] }>> {
    const params: Record<string, string> = {
      index: String(query.index),
      size: String(query.size),
    };
    if (query.field) params.field = query.field;
    if (query.order) params.order = query.order;
    if (query.search) params.search = query.search;
    if (query.management && query.management !== 'all') params.management = query.management;
    if (query.expiry && query.expiry !== 'any') params.expiry = query.expiry;
    if (query.client_id) params.client_id = query.client_id;
    if (query.provider) params.provider = query.provider;
    if (query.dns_manager) params.dns_manager = query.dns_manager;
    if (query.status) params.status = query.status;
    if (query.include_archived) params.include_archived = 'true';
    const response = await apiClient.get<IServerResponse<{ total: number; data: IWebsiteListItem[] }>>(
      `${rootUrl}${toQueryString(params)}`
    );
    return response.data;
  },

  async summary(): Promise<IServerResponse<IWebsiteSummary>> {
    const response = await apiClient.get<IServerResponse<IWebsiteSummary>>(`${rootUrl}/summary`);
    return response.data;
  },

  async filters(): Promise<IServerResponse<IWebsiteFilters>> {
    const response = await apiClient.get<IServerResponse<IWebsiteFilters>>(`${rootUrl}/filters`);
    return response.data;
  },

  async getById(id: string): Promise<IServerResponse<IWebsite>> {
    const response = await apiClient.get<IServerResponse<IWebsite>>(`${rootUrl}/${id}`);
    return response.data;
  },

  async create(body: IWebsitePayload): Promise<IServerResponse<IWebsite>> {
    const response = await apiClient.post<IServerResponse<IWebsite>>(rootUrl, body);
    return response.data;
  },

  async update(id: string, body: IWebsitePayload): Promise<IServerResponse<IWebsite>> {
    const response = await apiClient.put<IServerResponse<IWebsite>>(`${rootUrl}/${id}`, body);
    return response.data;
  },

  async renew(id: string, body: { item: RenewalItem; new_expiry: string; note?: string }): Promise<IServerResponse<IWebsite>> {
    const response = await apiClient.post<IServerResponse<IWebsite>>(`${rootUrl}/${id}/renew`, body);
    return response.data;
  },

  async archive(id: string): Promise<IServerResponse<IWebsite>> {
    const response = await apiClient.post<IServerResponse<IWebsite>>(`${rootUrl}/${id}/archive`, {});
    return response.data;
  },

  async restore(id: string): Promise<IServerResponse<IWebsite>> {
    const response = await apiClient.post<IServerResponse<IWebsite>>(`${rootUrl}/${id}/restore`, {});
    return response.data;
  },

  async getSettings(): Promise<IServerResponse<IWebsiteSettings>> {
    const response = await apiClient.get<IServerResponse<IWebsiteSettings>>(`${rootUrl}/settings`);
    return response.data;
  },

  async updateSettings(body: { task_lead_days: number; intervals_days: number[] }): Promise<IServerResponse<IWebsiteSettings>> {
    const response = await apiClient.put<IServerResponse<IWebsiteSettings>>(`${rootUrl}/settings`, body);
    return response.data;
  },
};
