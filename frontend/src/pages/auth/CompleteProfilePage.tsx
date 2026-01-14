import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Masthead } from '@/components/layout/Masthead';
import { Footer } from '@/components/layout/Footer';
import api from '@/api/client';

interface CompleteProfileInput {
  name: string;
  position: string;
  requestApprover: boolean;
}

interface CompleteProfileResponse {
  user: {
    userId: string;
    employeeId: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'APPROVER' | 'USER';
    isProfileComplete: boolean;
    position?: string;
  };
  token: string;
}

export function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser, token, logout } = useAuthStore();

  const handleBackToLogin = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const [formData, setFormData] = useState({
    name: user?.name || '',
    position: '',
    requestApprover: false,
  });
  const [error, setError] = useState('');

  const completeProfileMutation = useMutation({
    mutationFn: async (data: CompleteProfileInput) => {
      const response = await api.post<{ success: boolean; data: CompleteProfileResponse }>(
        '/auth/complete-profile',
        data
      );
      return response.data.data;
    },
    onSuccess: (data) => {
      // Update the auth store with the new user data
      updateUser({
        name: data.user.name,
        position: data.user.position,
        isProfileComplete: data.user.isProfileComplete,
        role: data.user.role,
      });

      // Redirect to dashboard
      navigate('/', { replace: true });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to complete profile');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (!formData.position.trim()) {
      setError('Please enter your position in the organization');
      return;
    }

    completeProfileMutation.mutate(formData);
  };

  if (!user || !token) {
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Masthead />
      <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4">
        <Card className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
            <p className="text-gray-500 mt-2">
              Please provide your details to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="text-center text-sm text-gray-600 mb-4 p-3 bg-blue-50 rounded-lg">
              <p>Signed in as</p>
              <p className="font-medium text-gray-900">{user.email}</p>
            </div>

            <Input
              id="name"
              type="text"
              label="Full Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter your full name"
              required
              autoFocus
            />

            <Input
              id="position"
              type="text"
              label="Position in Organization"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              placeholder="e.g., Software Engineer, Product Manager"
              required
            />

            <div className="border-t border-gray-200 pt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requestApprover}
                  onChange={(e) => setFormData({ ...formData, requestApprover: e.target.checked })}
                  className="w-5 h-5 mt-0.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    Request Approver role
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    Approvers can review and approve contraventions assigned to them.
                    Your request will be reviewed by an admin.
                  </p>
                </div>
              </label>
            </div>

            {formData.requestApprover && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <p className="font-medium">Note:</p>
                <p>
                  Your approver request will be reviewed by an admin. In the meantime,
                  you will have regular user access to the system.
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              isLoading={completeProfileMutation.isPending}
            >
              Complete Profile
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center text-sm text-gray-500">
            <p>All OGP/Tech employees can view contraventions</p>
            <p className="mt-1">Approver role requires admin approval</p>
          </div>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Sign out and return to login
          </button>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
