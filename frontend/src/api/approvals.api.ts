import client from './client';
import { ApiResponse } from '@/types';

export const approvalsApi = {
  getPendingCount: async () => {
    const response = await client.get<ApiResponse<{ count: number }>>('/approvals/pending-count');
    return response.data.data!.count;
  },
};
