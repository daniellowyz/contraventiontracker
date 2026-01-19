import client from './client';
import { ApiResponse, DashboardStats } from '@/types';

export interface DepartmentBreakdown {
  id: string;
  name: string;
  employeeCount: number;
  contraventionCount: number;
  totalPoints: number;
  byPoints: {
    '1-2': number;
    '3-4': number;
    '5+': number;
  };
}

export interface TypeBreakdown {
  id: string;
  name: string;
  category: string;
  count: number;
  totalValue: number;
}

export interface RepeatOffender {
  id: string;
  name: string;
  department: string;
  contraventionCount: number;
  totalPoints: number;
  currentLevel: string | null;
  recentContraventions: {
    id: string;
    referenceNo: string;
    points: number;
    incidentDate: string;
    type: { name: string };
  }[];
}

export const reportsApi = {
  getDashboard: async () => {
    const response = await client.get<ApiResponse<DashboardStats>>('/reports/dashboard');
    return response.data.data!;
  },

  getByDepartment: async () => {
    const response = await client.get<ApiResponse<DepartmentBreakdown[]>>('/reports/by-department');
    return response.data.data!;
  },

  getByType: async () => {
    const response = await client.get<ApiResponse<TypeBreakdown[]>>('/reports/by-type');
    return response.data.data!;
  },

  getRepeatOffenders: async () => {
    const response = await client.get<ApiResponse<RepeatOffender[]>>('/reports/repeat-offenders');
    return response.data.data!;
  },

  exportExcel: async () => {
    const response = await client.get('/reports/export', {
      responseType: 'blob',
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `contraventions-export-${new Date().toISOString().split('T')[0]}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
