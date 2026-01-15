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

export interface ApproverRequest {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  position: string | null;
  role: 'USER';
  createdAt: string;
  isProfileComplete: boolean;
}

export const approversApi = {
  getAll: async () => {
    const response = await client.get<ApiResponse<Approver[]>>('/admin/approvers');
    return response.data.data!;
  },

  // Get pending approver role requests
  getPendingRequests: async () => {
    const response = await client.get<ApiResponse<ApproverRequest[]>>('/admin/approver-requests');
    return response.data.data!;
  },

  // Get count of pending approver role requests (for sidebar badge)
  getPendingRequestsCount: async () => {
    const response = await client.get<ApiResponse<{ count: number }>>('/admin/approver-requests/count');
    return response.data.data!.count;
  },

  // Approve an approver role request
  approveRequest: async (userId: string) => {
    const response = await client.post<ApiResponse<Approver>>(`/admin/approver-requests/${userId}/approve`);
    return response.data.data!;
  },

  // Reject an approver role request
  rejectRequest: async (userId: string, reason?: string) => {
    const response = await client.post<ApiResponse<Approver>>(`/admin/approver-requests/${userId}/reject`, { reason });
    return response.data.data!;
  },
};
