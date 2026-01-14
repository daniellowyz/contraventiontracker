import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { CompleteProfilePage } from '@/pages/auth/CompleteProfilePage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ContraventionsListPage } from '@/pages/contraventions/ContraventionsListPage';
import { ContraventionFormPage } from '@/pages/contraventions/ContraventionFormPage';
import { ContraventionDetailPage } from '@/pages/contraventions/ContraventionDetailPage';
import { EmployeesListPage } from '@/pages/employees/EmployeesListPage';
import { EmployeeProfilePage } from '@/pages/employees/EmployeeProfilePage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { TrainingPage } from '@/pages/training/TrainingPage';
import { EscalationsPage } from '@/pages/escalations/EscalationsPage';
import { ApprovalPendingPage } from '@/pages/approvals/ApprovalPendingPage';
import { useAuthStore } from '@/stores/authStore';

function App() {
  const { isAuthenticated, needsProfileCompletion } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />

        {/* Profile completion route - accessible when authenticated but profile incomplete */}
        <Route
          path="/complete-profile"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" replace />
            ) : !needsProfileCompletion ? (
              <Navigate to="/" replace />
            ) : (
              <CompleteProfilePage />
            )
          }
        />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/contraventions" element={<ContraventionsListPage />} />
          <Route path="/contraventions/new" element={<ContraventionFormPage />} />
          <Route path="/contraventions/:id" element={<ContraventionDetailPage />} />
          <Route path="/employees" element={<EmployeesListPage />} />
          <Route path="/employees/:id" element={<EmployeeProfilePage />} />
          <Route path="/escalations" element={<EscalationsPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/approvals" element={<ApprovalPendingPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
