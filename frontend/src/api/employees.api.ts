import client from './client';
import { ApiResponse, User, Contravention, EmployeePointsSummary, Escalation, TrainingRecord } from '@/types';

export interface EmployeeListItem {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  department?: { id: string; name: string };
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  points: number;
  currentLevel: string | null;
  contraventionCount: number;
}

export const employeesApi = {
  getAll: async () => {
    const response = await client.get<ApiResponse<EmployeeListItem[]>>('/employees');
    return response.data.data!;
  },

  getById: async (id: string) => {
    const response = await client.get<ApiResponse<User>>(`/employees/${id}`);
    return response.data.data!;
  },

  getPoints: async (id: string) => {
    const response = await client.get<ApiResponse<EmployeePointsSummary>>(`/employees/${id}/points`);
    return response.data.data!;
  },

  getContraventions: async (id: string) => {
    const response = await client.get<ApiResponse<Contravention[]>>(`/employees/${id}/contraventions`);
    return response.data.data!;
  },

  getEscalations: async (id: string) => {
    const response = await client.get<ApiResponse<Escalation[]>>(`/employees/${id}/escalations`);
    return response.data.data!;
  },

  getTraining: async (id: string) => {
    const response = await client.get<ApiResponse<TrainingRecord[]>>(`/employees/${id}/training`);
    return response.data.data!;
  },

  update: async (id: string, data: Partial<{ name: string; email: string; departmentId: string; role: string; isActive: boolean }>) => {
    const response = await client.patch<ApiResponse<User>>(`/employees/${id}`, data);
    return response.data.data!;
  },
};
