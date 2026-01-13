import client from './client';
import { ApiResponse } from '@/types';

export interface Team {
  id: string;
  name: string;
  description?: string;
  isPersonal: boolean;
  contraventionCount: number;
  memberCount: number;
}

export const teamsApi = {
  getAll: async () => {
    const response = await client.get<ApiResponse<Team[]>>('/admin/teams');
    return response.data.data!;
  },

  // Get only teams that have contraventions (for reports/filters)
  getWithContraventions: async () => {
    const response = await client.get<ApiResponse<Team[]>>('/admin/teams/with-contraventions');
    return response.data.data!;
  },

  create: async (data: { name: string; description?: string; isPersonal?: boolean }) => {
    const response = await client.post<ApiResponse<Team>>('/admin/teams', data);
    return response.data.data!;
  },

  update: async (id: string, data: { name?: string; description?: string; isActive?: boolean }) => {
    const response = await client.patch<ApiResponse<Team>>(`/admin/teams/${id}`, data);
    return response.data.data!;
  },

  seedPersonalTeam: async () => {
    const response = await client.post<ApiResponse<Team>>('/admin/teams/seed-personal');
    return response.data.data!;
  },

  // Seed all 59 OGP teams from master list
  seedAllTeams: async () => {
    const response = await client.post<ApiResponse<{ created: number; existing: number; teams: string[] }>>('/admin/teams/seed-all');
    return response.data;
  },
};
