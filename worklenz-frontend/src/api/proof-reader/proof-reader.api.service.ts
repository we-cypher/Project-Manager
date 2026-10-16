import apiClient from '@api/api-client';
import { API_BASE_URL } from '@/shared/constants';
import { IServerResponse } from '@/types/common.types';

const rootUrl = `${API_BASE_URL}/proof-reader`;
const REVIEW_TIMEOUT_MS = 180_000;

export interface IProofReaderAccessMember {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  always_allowed: boolean;
  granted: boolean;
}

export interface IProofReaderSettings {
  main_prompt: string;
}

export interface IProofReaderSubPrompt {
  id: string;
  title: string;
  prompt: string;
  is_active: boolean;
  sort_order: number;
}

export interface IProofReaderResult {
  id: string;
  label: string;
  note: string;
  sort_order: number;
}

export type ProofReaderStatus = 'pending' | 'completed' | 'failed';

export interface IProofReaderReview {
  id: string;
  file_name: string;
  image_url: string | null;
  status: ProofReaderStatus;
  error_message: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string;
  results: IProofReaderResult[];
}

export interface IProofReaderSubPromptPayload {
  title: string;
  prompt: string;
  is_active?: boolean;
}

export const proofReaderApiService = {
  async getMyAccess(): Promise<IServerResponse<{ can_access: boolean }>> {
    const response = await apiClient.get<IServerResponse<{ can_access: boolean }>>(`${rootUrl}/access`);
    return response.data;
  },

  async getAccessMembers(): Promise<IServerResponse<IProofReaderAccessMember[]>> {
    const response = await apiClient.get<IServerResponse<IProofReaderAccessMember[]>>(
      `${rootUrl}/access/members`
    );
    return response.data;
  },

  async updateAccess(userIds: string[]): Promise<IServerResponse<IProofReaderAccessMember[]>> {
    const response = await apiClient.put<IServerResponse<IProofReaderAccessMember[]>>(`${rootUrl}/access`, {
      user_ids: userIds,
    });
    return response.data;
  },

  async getSettings(): Promise<IServerResponse<IProofReaderSettings>> {
    const response = await apiClient.get<IServerResponse<IProofReaderSettings>>(`${rootUrl}/settings`);
    return response.data;
  },

  async updateSettings(mainPrompt: string): Promise<IServerResponse<IProofReaderSettings>> {
    const response = await apiClient.put<IServerResponse<IProofReaderSettings>>(`${rootUrl}/settings`, {
      main_prompt: mainPrompt,
    });
    return response.data;
  },

  async getSubPrompts(): Promise<IServerResponse<IProofReaderSubPrompt[]>> {
    const response = await apiClient.get<IServerResponse<IProofReaderSubPrompt[]>>(`${rootUrl}/sub-prompts`);
    return response.data;
  },

  async createSubPrompt(
    body: IProofReaderSubPromptPayload
  ): Promise<IServerResponse<IProofReaderSubPrompt>> {
    const response = await apiClient.post<IServerResponse<IProofReaderSubPrompt>>(
      `${rootUrl}/sub-prompts`,
      body
    );
    return response.data;
  },

  async updateSubPrompt(
    id: string,
    body: IProofReaderSubPromptPayload
  ): Promise<IServerResponse<IProofReaderSubPrompt>> {
    const response = await apiClient.put<IServerResponse<IProofReaderSubPrompt>>(
      `${rootUrl}/sub-prompts/${id}`,
      body
    );
    return response.data;
  },

  async deleteSubPrompt(id: string): Promise<IServerResponse<{ id: string }>> {
    const response = await apiClient.delete<IServerResponse<{ id: string }>>(`${rootUrl}/sub-prompts/${id}`);
    return response.data;
  },

  async getReviews(): Promise<IServerResponse<IProofReaderReview[]>> {
    const response = await apiClient.get<IServerResponse<IProofReaderReview[]>>(rootUrl);
    return response.data;
  },

  async createReview(file: File): Promise<IServerResponse<IProofReaderReview>> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<IServerResponse<IProofReaderReview>>(rootUrl, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: REVIEW_TIMEOUT_MS,
    });
    return response.data;
  },
};
