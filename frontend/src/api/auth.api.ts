import client from './client';
import { ApiResponse, User } from '@/types';

interface AuthUser {
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'APPROVER' | 'USER';
  isProfileComplete: boolean;
  position?: string;
}

interface VerifyOtpResponse {
  token: string;
  user: AuthUser;
}

interface RequestOtpResponse {
  success: boolean;
  message: string;
}

export const authApi = {
  /**
   * Step 1: Request OTP for email
   */
  requestOtp: async (email: string) => {
    const response = await client.post<ApiResponse<RequestOtpResponse>>('/auth/request-otp', {
      email,
    });
    return response.data.data!;
  },

  /**
   * Step 2: Verify OTP and get token
   */
  verifyOtp: async (email: string, otp: string) => {
    const response = await client.post<ApiResponse<VerifyOtpResponse>>('/auth/verify-otp', {
      email,
      otp,
    });
    return response.data.data!;
  },

  /**
   * Logout and clear session cookie
   */
  logout: async () => {
    const response = await client.post<ApiResponse>('/auth/logout');
    return response.data;
  },

  /**
   * Get current user info
   */
  getCurrentUser: async () => {
    const response = await client.get<ApiResponse<User>>('/auth/me');
    return response.data.data!;
  },
};
