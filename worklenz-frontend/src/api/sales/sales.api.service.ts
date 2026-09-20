import apiClient from '@api/api-client';
import { API_BASE_URL } from '@/shared/constants';
import { IServerResponse } from '@/types/common.types';
import { toQueryString } from '@/utils/toQueryString';
import {
  ISalesActivity,
  ISalesDeal,
  ISalesDealPayload,
  ISalesDealStage,
  ISalesOnboardingStep,
  ISalesOwner,
  ISalesProduct,
  ISalesProjectLookup,
} from '@/types/sales/sales.types';

const rootUrl = `${API_BASE_URL}/sales`;

export interface ISalesDealListParams {
  search?: string;
  stage?: string;
  deal_type?: string;
  product_id?: string;
}

export const salesApiService = {
  async getDeals(params: ISalesDealListParams = {}): Promise<IServerResponse<ISalesDeal[]>> {
    const query = toQueryString({
      search: params.search || '',
      stage: params.stage || '',
      deal_type: params.deal_type || '',
      product_id: params.product_id || '',
    });
    const response = await apiClient.get<IServerResponse<ISalesDeal[]>>(`${rootUrl}/deals${query}`);
    return response.data;
  },

  async getDeal(id: string): Promise<IServerResponse<ISalesDeal>> {
    const response = await apiClient.get<IServerResponse<ISalesDeal>>(`${rootUrl}/deals/${id}`);
    return response.data;
  },

  async createDeal(body: ISalesDealPayload): Promise<IServerResponse<ISalesDeal>> {
    const response = await apiClient.post<IServerResponse<ISalesDeal>>(`${rootUrl}/deals`, body);
    return response.data;
  },

  async updateDeal(id: string, body: Partial<ISalesDealPayload>): Promise<IServerResponse<ISalesDeal>> {
    const response = await apiClient.put<IServerResponse<ISalesDeal>>(`${rootUrl}/deals/${id}`, body);
    return response.data;
  },

  async updateDealStage(
    id: string,
    stage: ISalesDealStage,
    lostReason?: string
  ): Promise<IServerResponse<ISalesDeal>> {
    const response = await apiClient.patch<IServerResponse<ISalesDeal>>(`${rootUrl}/deals/${id}/stage`, {
      stage,
      lost_reason: lostReason,
    });
    return response.data;
  },

  async deleteDeal(id: string): Promise<IServerResponse<{ id: string }>> {
    const response = await apiClient.delete<IServerResponse<{ id: string }>>(`${rootUrl}/deals/${id}`);
    return response.data;
  },

  async getActivities(dealId: string): Promise<IServerResponse<ISalesActivity[]>> {
    const response = await apiClient.get<IServerResponse<ISalesActivity[]>>(
      `${rootUrl}/deals/${dealId}/activities`
    );
    return response.data;
  },

  async createActivity(
    dealId: string,
    body: Partial<ISalesActivity> & { title: string }
  ): Promise<IServerResponse<ISalesActivity>> {
    const response = await apiClient.post<IServerResponse<ISalesActivity>>(
      `${rootUrl}/deals/${dealId}/activities`,
      body
    );
    return response.data;
  },

  async updateActivity(
    activityId: string,
    body: Partial<ISalesActivity> & { completed?: boolean }
  ): Promise<IServerResponse<ISalesActivity>> {
    const response = await apiClient.patch<IServerResponse<ISalesActivity>>(
      `${rootUrl}/activities/${activityId}`,
      body
    );
    return response.data;
  },

  async deleteActivity(activityId: string): Promise<IServerResponse<{ id: string }>> {
    const response = await apiClient.delete<IServerResponse<{ id: string }>>(
      `${rootUrl}/activities/${activityId}`
    );
    return response.data;
  },

  async createProject(
    dealId: string,
    name?: string
  ): Promise<IServerResponse<{ deal: ISalesDeal; project: { id: string; name: string } }>> {
    const response = await apiClient.post<
      IServerResponse<{ deal: ISalesDeal; project: { id: string; name: string } }>
    >(`${rootUrl}/deals/${dealId}/create-project`, { name });
    return response.data;
  },

  async linkProject(dealId: string, projectId: string): Promise<IServerResponse<ISalesDeal>> {
    const response = await apiClient.post<IServerResponse<ISalesDeal>>(
      `${rootUrl}/deals/${dealId}/link-project`,
      { project_id: projectId }
    );
    return response.data;
  },

  async applyOnboarding(
    dealId: string
  ): Promise<IServerResponse<{ deal: ISalesDeal; steps_added: number }>> {
    const response = await apiClient.post<IServerResponse<{ deal: ISalesDeal; steps_added: number }>>(
      `${rootUrl}/deals/${dealId}/apply-onboarding`
    );
    return response.data;
  },

  async getProducts(): Promise<IServerResponse<ISalesProduct[]>> {
    const response = await apiClient.get<IServerResponse<ISalesProduct[]>>(`${rootUrl}/products`);
    return response.data;
  },

  async createProduct(body: { name?: string; kind?: string }): Promise<IServerResponse<ISalesProduct>> {
    const response = await apiClient.post<IServerResponse<ISalesProduct>>(`${rootUrl}/products`, body);
    return response.data;
  },

  async updateProduct(
    id: string,
    body: { name: string; kind?: string }
  ): Promise<IServerResponse<ISalesProduct>> {
    const response = await apiClient.put<IServerResponse<ISalesProduct>>(
      `${rootUrl}/products/${id}`,
      body
    );
    return response.data;
  },

  async deleteProduct(id: string): Promise<IServerResponse<{ id: string }>> {
    const response = await apiClient.delete<IServerResponse<{ id: string }>>(`${rootUrl}/products/${id}`);
    return response.data;
  },

  async replaceOnboardingSteps(
    productId: string,
    steps: ISalesOnboardingStep[]
  ): Promise<IServerResponse<ISalesOnboardingStep[]>> {
    const response = await apiClient.put<IServerResponse<ISalesOnboardingStep[]>>(
      `${rootUrl}/products/${productId}/onboarding-steps`,
      { steps }
    );
    return response.data;
  },

  async getOwners(): Promise<IServerResponse<ISalesOwner[]>> {
    const response = await apiClient.get<IServerResponse<ISalesOwner[]>>(`${rootUrl}/owners`);
    return response.data;
  },

  async getProjectsLookup(search?: string): Promise<IServerResponse<ISalesProjectLookup[]>> {
    const query = toQueryString({ search: search || '' });
    const response = await apiClient.get<IServerResponse<ISalesProjectLookup[]>>(
      `${rootUrl}/projects-lookup${query}`
    );
    return response.data;
  },
};
