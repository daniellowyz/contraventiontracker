import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireApprover?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, requireApprover = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, isApprover, needsProfileCompletion } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect users with incomplete profiles to complete their profile
  if (needsProfileCompletion) {
    return <Navigate to="/complete-profile" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireApprover && !isApprover && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
