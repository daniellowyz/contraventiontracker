import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ContraventionsListPage } from '@/pages/contraventions/ContraventionsListPage';
import { EmployeesListPage } from '@/pages/employees/EmployeesListPage';
import { EmployeeProfilePage } from '@/pages/employees/EmployeeProfilePage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { useAuthStore } from '@/stores/authStore';

// Placeholder pages
function EscalationsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Escalations</h1>
      <p className="text-gray-500">Escalations management coming soon...</p>
    </div>
  );
}

function TrainingPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Training</h1>
      <p className="text-gray-500">Training management coming soon...</p>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <p className="text-gray-500">Settings page coming soon...</p>
    </div>
  );
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
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
          <Route path="/employees" element={<EmployeesListPage />} />
          <Route path="/employees/:id" element={<EmployeeProfilePage />} />
          <Route path="/escalations" element={<EscalationsPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
