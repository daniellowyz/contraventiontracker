import client from './client';
import { ApiResponse } from '@/types';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  channel: string;
  status: string;
  sentAt?: string;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  getAll: async () => {
    const response = await client.get<ApiResponse<Notification[]>>('/notifications');
    return response.data.data!;
  },

  getUnreadCount: async () => {
    const response = await client.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
    return response.data.data!.count;
  },

  markAsRead: async (id: string) => {
    const response = await client.patch<ApiResponse<Notification>>(`/notifications/${id}/read`);
    return response.data.data!;
  },

  markAllAsRead: async () => {
    const response = await client.patch<ApiResponse>('/notifications/read-all');
    return response.data;
  },
};
