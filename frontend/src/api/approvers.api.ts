import client from './client';
import { ApiResponse } from '@/types';

export interface Approver {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  position: string | null;
  role: 'ADMIN' | 'APPROVER';
  department: { id: string; name: string } | null;
}

export const approversApi = {
  getAll: async () => {
    const response = await client.get<ApiResponse<Approver[]>>('/admin/approvers');
    return response.data.data!;
  },
};
