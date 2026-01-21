import client from './client';
import { ApiResponse } from '@/types';

export interface ReviewApprovalInput {
  status: 'APPROVED' | 'REJECTED';
  notes?: string;
}

export const approvalsApi = {
  getPendingCount: async () => {
    const response = await client.get<ApiResponse<{ count: number }>>('/approvals/pending-count');
    return response.data.data!.count;
  },

  // Review an approval request (approve or reject)
  reviewApproval: async (approvalId: string, data: ReviewApprovalInput) => {
    const response = await client.post<ApiResponse>(`/approvals/${approvalId}/review`, data);
    return response.data;
  },
};
