import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role } from '@/types';

interface AuthUser {
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isAdmin: false,

      setAuth: (token, user) =>
        set({
          token,
          user,
          isAuthenticated: true,
          isAdmin: user.role === 'ADMIN',
        }),

      logout: () =>
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          isAdmin: false,
        }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
