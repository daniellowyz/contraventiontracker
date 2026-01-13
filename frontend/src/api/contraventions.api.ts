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
  period?: string; // Format: "YYYY-MM-DD_YYYY-MM-DD" for fiscal year filtering
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateContraventionInput {
  employeeId: string;
  typeId: string;
  teamId?: string;  // Optional team for tracking
  vendor?: string;
  valueSgd?: number;
  description: string;
  justification: string;
  mitigation: string;
  summary?: string;
  incidentDate: string;
  evidenceUrls?: string[];
  authorizerEmail?: string; // Email of the approver to seek contravention approval
  approvalPdfUrl?: string; // URL of the uploaded approval PDF
}

export const contraventionsApi = {
  getAll: async (filters: ContraventionFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        // Handle period filter - convert to dateFrom/dateTo
        if (key === 'period' && typeof value === 'string') {
          const [dateFrom, dateTo] = value.split('_');
          if (dateFrom && dateTo) {
            params.append('dateFrom', dateFrom);
            params.append('dateTo', dateTo);
          }
        } else {
          params.append(key, String(value));
        }
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

  uploadApproval: async (id: string, approvalPdfUrl: string) => {
    const response = await client.post<ApiResponse<Contravention>>(`/contraventions/${id}/upload-approval`, { approvalPdfUrl });
    return response.data.data!;
  },

  markComplete: async (id: string, notes?: string) => {
    const response = await client.post<ApiResponse<Contravention>>(`/contraventions/${id}/complete`, { notes });
    return response.data.data!;
  },

  getTypes: async () => {
    const response = await client.get<ApiResponse<ContraventionType[]>>('/admin/types');
    return response.data.data!;
  },
};
