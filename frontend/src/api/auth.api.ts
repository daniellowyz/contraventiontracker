import client from './client';
import { ApiResponse, User } from '@/types';

interface LoginResponse {
  token: string;
  user: {
    userId: string;
    employeeId: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'USER';
  };
}

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await client.post<ApiResponse<LoginResponse>>('/auth/login', {
      email,
      password,
    });
    return response.data.data!;
  },

  getCurrentUser: async () => {
    const response = await client.get<ApiResponse<User>>('/auth/me');
    return response.data.data!;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await client.post<ApiResponse>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },
};
