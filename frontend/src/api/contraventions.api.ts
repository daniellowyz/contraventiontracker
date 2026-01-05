import client from './client';
import { ApiResponse, PaginatedResponse, Contravention, ContraventionType } from '@/types';

export interface ContraventionFilters {
  status?: string;
  severity?: string;
  typeId?: string;
  departmentId?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateContraventionInput {
  employeeId: string;
  typeId: string;
  vendor?: string;
  valueSgd?: number;
  description: string;
  summary?: string;
  incidentDate: string;
  evidenceUrls?: string[];
}

export const contraventionsApi = {
  getAll: async (filters: ContraventionFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, String(value));
      }
    });
    const response = await client.get<PaginatedResponse<Contravention>>(`/contraventions?${params}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await client.get<ApiResponse<Contravention>>(`/contraventions/${id}`);
    return response.data.data!;
  },

  create: async (data: CreateContraventionInput) => {
    const response = await client.post<ApiResponse<Contravention>>('/contraventions', data);
    return response.data.data!;
  },

  update: async (id: string, data: Partial<CreateContraventionInput>) => {
    const response = await client.patch<ApiResponse<Contravention>>(`/contraventions/${id}`, data);
    return response.data.data!;
  },

  delete: async (id: string) => {
    const response = await client.delete<ApiResponse>(`/contraventions/${id}`);
    return response.data;
  },

  acknowledge: async (id: string, notes?: string) => {
    const response = await client.post<ApiResponse<Contravention>>(`/contraventions/${id}/acknowledge`, { notes });
    return response.data.data!;
  },

  submitDispute: async (id: string, reason: string, evidenceUrls?: string[]) => {
    const response = await client.post<ApiResponse>(`/contraventions/${id}/dispute`, {
      reason,
      evidenceUrls,
    });
    return response.data;
  },

  getTypes: async () => {
    const response = await client.get<ApiResponse<ContraventionType[]>>('/admin/types');
    return response.data.data!;
  },
};
