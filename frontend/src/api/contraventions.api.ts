import client from './client';
import { ApiResponse, PaginatedResponse, Contravention, ContraventionType } from '@/types';

export interface ContraventionFilters {
  status?: string;
  typeId?: string;
  departmentId?: string;
  employeeId?: string;
  loggedById?: string;  // Filter by who logged the contravention
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
  teamId: string;  // Required team for tracking
  customTypeName?: string;  // For "Others" type - custom contravention name (required when type.isOthers)
  vendor?: string;
  valueSgd?: number;
  description: string;
  justification: string;
  mitigation: string;
  summary?: string;
  incidentDate: string;
  evidenceUrls?: string[];
  supportingDocs?: string[];  // Supporting documentation URLs
  authorizerEmail?: string; // Email of the approver to seek contravention approval
  approvalPdfUrl?: string; // URL of the uploaded approval PDF
  points?: number; // Admin can adjust points (especially for "Others" type)
}

// Input for users editing their own contraventions (more restrictive)
export interface UserUpdateContraventionInput {
  vendor?: string;
  valueSgd?: number;
  description?: string;
  justification?: string;
  mitigation?: string;
  summary?: string;
  evidenceUrls?: string[];
  supportingDocs?: string[];
  authorizerEmail?: string;
}

// Input for resubmitting a rejected contravention
export interface ResubmitContraventionInput {
  vendor?: string;
  valueSgd?: number;
  description: string;
  justification: string;
  mitigation: string;
  summary?: string;
  evidenceUrls?: string[];
  supportingDocs?: string[];
  authorizerEmail?: string;
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

  // User edit - for editing own contraventions (before approval or when rejected)
  userUpdate: async (id: string, data: UserUpdateContraventionInput) => {
    const response = await client.patch<ApiResponse<Contravention>>(`/contraventions/${id}/user-edit`, data);
    return response.data.data!;
  },

  // Resubmit - for resubmitting rejected contraventions
  resubmit: async (id: string, data: ResubmitContraventionInput) => {
    const response = await client.post<ApiResponse<Contravention>>(`/contraventions/${id}/resubmit`, data);
    return response.data.data!;
  },

  getTypes: async () => {
    const response = await client.get<ApiResponse<ContraventionType[]>>('/admin/types');
    return response.data.data!;
  },

  // Admin: Promote a custom "Others" type name to a permanent type
  promoteToType: async (customTypeName: string, name: string, category: string, defaultPoints: number) => {
    const response = await client.post<ApiResponse<ContraventionType>>('/admin/types/promote', {
      customTypeName,
      name,
      category,
      defaultPoints,
    });
    return response.data.data!;
  },

  // Admin: Delete a contravention type
  deleteType: async (typeId: string) => {
    const response = await client.delete<ApiResponse>(`/admin/types/${typeId}`);
    return response.data;
  },
};
