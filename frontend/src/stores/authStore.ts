import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role } from '@/types';

interface AuthUser {
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  role: Role;
  isProfileComplete: boolean;
  position?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isApprover: boolean;
  needsProfileCompletion: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isApprover: false,
      needsProfileCompletion: false,

      setAuth: (token, user) =>
        set({
          token,
          user,
          isAuthenticated: true,
          isAdmin: user.role === 'ADMIN',
          isApprover: user.role === 'APPROVER' || user.role === 'ADMIN',
          needsProfileCompletion: !user.isProfileComplete,
        }),

      updateUser: (updates) =>
        set((state) => {
          if (!state.user) return state;
          const updatedUser = { ...state.user, ...updates };
          return {
            user: updatedUser,
            isAdmin: updatedUser.role === 'ADMIN',
            isApprover: updatedUser.role === 'APPROVER' || updatedUser.role === 'ADMIN',
            needsProfileCompletion: !updatedUser.isProfileComplete,
          };
        }),

      logout: () =>
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          isAdmin: false,
          isApprover: false,
          needsProfileCompletion: false,
        }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
