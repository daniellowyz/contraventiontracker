import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import client from '@/api/client';
import {
  User,
  Bell,
  Shield,
  Eye,
  EyeOff,
  Save,
  Check,
  Settings,
  Download,
  Clock,
  Mail,
  Calendar,
  FileText,
  AlertTriangle,
  RefreshCw,
  Users,
  Search,
  ShieldCheck,
  UserCog,
} from 'lucide-react';

type SettingsTab = 'profile' | 'notifications' | 'security' | 'users' | 'admin';

interface FiscalYearStatus {
  currentFiscalYear: string;
  fiscalYearStart: string;
  fiscalYearEnd: string;
  daysUntilReset: number;
  employeesWithPoints: Array<{
    employeeId: string;
    employeeName: string;
    totalPoints: number;
    level: string | null;
  }>;
}

interface EmailStatus {
  enabled: boolean;
  sandboxEmail: string;
  emailProviderConfigured: boolean;
}

interface UserData {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  department: { id: string; name: string } | null;
  createdAt: string;
}

export function SettingsPage() {
  const { user, isAdmin } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile form state
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    employeeId: user?.employeeId || '',
  });

  // Password form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Notification preferences state
  const [notifications, setNotifications] = useState({
    emailNewContravention: true,
    emailDispute: true,
    emailEscalation: true,
    emailTraining: true,
    browserNotifications: false,
  });

  // User management state
  const [userSearch, setUserSearch] = useState('');

  // Admin: Email status query
  const { data: emailStatus } = useQuery({
    queryKey: ['email-status'],
    queryFn: async () => {
      const response = await client.get('/admin/email-status');
      return response.data.data as EmailStatus;
    },
    enabled: isAdmin,
  });

  // Admin: Fiscal year status query
  const { data: fiscalYearStatus, refetch: refetchFiscalYear } = useQuery({
    queryKey: ['fiscal-year-status'],
    queryFn: async () => {
      const response = await client.get('/admin/points/fiscal-year-status');
      return response.data.data as FiscalYearStatus;
    },
    enabled: isAdmin,
  });

  // Admin: Reset points for new fiscal year mutation
  const resetPointsMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/admin/points/fiscal-year-reset');
      return response.data;
    },
    onSuccess: (data) => {
      refetchFiscalYear();
      alert(`Fiscal year reset complete!\nFiscal Year: ${data.data.fiscalYear}\nEmployees reset: ${data.data.reset}\nTotal points reset: ${data.data.totalPointsReset}`);
    },
    onError: () => {
      alert('Failed to reset points');
    },
  });

  // Admin: Users list query
  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users', userSearch],
    queryFn: async () => {
      const params = userSearch ? `?search=${encodeURIComponent(userSearch)}` : '';
      const response = await client.get(`/admin/users${params}`);
      return response.data.data as UserData[];
    },
    enabled: isAdmin && activeTab === 'users',
  });

  // Admin: Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'ADMIN' | 'USER' }) => {
      const response = await client.patch(`/admin/users/${userId}/role`, { role });
      return response.data;
    },
    onSuccess: () => {
      refetchUsers();
    },
    onError: (error: Error) => {
      alert(error.message || 'Failed to update user role');
    },
  });

  const handleProfileSave = () => {
    // In a real app, this would call an API
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePasswordSave = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match');
      return;
    }
    // In a real app, this would call an API
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleNotificationSave = () => {
    // In a real app, this would call an API
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExportContraventions = async () => {
    try {
      const response = await client.get('/contraventions?limit=1000');
      const data = response.data.data;

      // Convert to CSV
      const headers = ['Reference No', 'Employee', 'Type', 'Severity', 'Points', 'Status', 'Date', 'Value (SGD)'];
      const rows = data.map((c: { referenceNo: string; employee?: { name: string }; type?: { name: string }; severity: string; points: number; status: string; incidentDate: string; valueSgd?: number }) => [
        c.referenceNo,
        c.employee?.name || 'N/A',
        c.type?.name || 'N/A',
        c.severity,
        c.points,
        c.status,
        new Date(c.incidentDate).toLocaleDateString(),
        c.valueSgd || 0,
      ]);

      const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contraventions-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    }
  };

  const handleExportTraining = async () => {
    try {
      const response = await client.get('/admin/training');
      const data = response.data.data;

      // Convert to CSV
      const headers = ['Employee', 'Course', 'Status', 'Assigned Date', 'Due Date', 'Completed Date', 'Points Credited'];
      const rows = data.map((t: { employee?: { name: string }; course?: { name: string }; status: string; assignedDate: string; dueDate: string; completedDate?: string; pointsCredited: boolean }) => [
        t.employee?.name || 'N/A',
        t.course?.name || 'N/A',
        t.status,
        new Date(t.assignedDate).toLocaleDateString(),
        new Date(t.dueDate).toLocaleDateString(),
        t.completedDate ? new Date(t.completedDate).toLocaleDateString() : '-',
        t.pointsCredited ? 'Yes' : 'No',
      ]);

      const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    }
  };

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
    ...(isAdmin ? [{ id: 'users' as const, label: 'User Management', icon: Users }] : []),
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin Tools', icon: Settings }] : []),
  ];

  return (
    <div>
      <Header
        title="Settings"
        subtitle="Manage your account settings and preferences"
      />

      <div className="p-8">
        <div className="flex gap-8 max-w-5xl">
          {/* Sidebar */}
          <div className="w-48 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <Card>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Profile Information</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <Input
                        type="text"
                        value={profileData.name}
                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                        placeholder="Enter your name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <Input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        placeholder="Enter your email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employee ID
                      </label>
                      <Input
                        type="text"
                        value={profileData.employeeId}
                        disabled
                        className="bg-gray-50"
                      />
                      <p className="text-xs text-gray-500 mt-1">Employee ID cannot be changed</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department
                      </label>
                      <Input
                        type="text"
                        value="Not assigned"
                        disabled
                        className="bg-gray-50"
                      />
                      <p className="text-xs text-gray-500 mt-1">Contact HR to change department</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role
                      </label>
                      <Input
                        type="text"
                        value={user?.role || 'USER'}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <Button onClick={handleProfileSave}>
                      {saved ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <Card>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Notification Preferences</h2>

                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-700">Email Notifications</h3>

                    <label className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-sm text-gray-900">New Contravention</span>
                        <p className="text-xs text-gray-500">Receive email when a new contravention is logged against you</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications.emailNewContravention}
                        onChange={(e) => setNotifications({ ...notifications, emailNewContravention: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </label>

                    <label className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-sm text-gray-900">Dispute Updates</span>
                        <p className="text-xs text-gray-500">Receive email when there are updates to your disputes</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications.emailDispute}
                        onChange={(e) => setNotifications({ ...notifications, emailDispute: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </label>

                    <label className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-sm text-gray-900">Escalation Alerts</span>
                        <p className="text-xs text-gray-500">Receive email when you reach a new escalation level</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications.emailEscalation}
                        onChange={(e) => setNotifications({ ...notifications, emailEscalation: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </label>

                    <label className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-sm text-gray-900">Training Reminders</span>
                        <p className="text-xs text-gray-500">Receive email reminders for upcoming and overdue training</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications.emailTraining}
                        onChange={(e) => setNotifications({ ...notifications, emailTraining: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </label>

                    <div className="pt-4 border-t border-gray-200">
                      <h3 className="text-sm font-medium text-gray-700 mb-4">Browser Notifications</h3>

                      <label className="flex items-center justify-between py-2">
                        <div>
                          <span className="text-sm text-gray-900">Enable Browser Notifications</span>
                          <p className="text-xs text-gray-500">Show desktop notifications for important updates</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={notifications.browserNotifications}
                          onChange={(e) => setNotifications({ ...notifications, browserNotifications: e.target.checked })}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <Button onClick={handleNotificationSave}>
                      {saved ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Preferences
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <Card>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Change Password</h2>

                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                          placeholder="Enter current password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <Input
                          type={showNewPassword ? 'text' : 'password'}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <Input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <Button onClick={handlePasswordSave}>
                      {saved ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Password Updated
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Update Password
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Session Information</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-900">Current Session</p>
                          <p className="text-xs text-gray-500">Logged in from this browser</p>
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* User Management Tab */}
            {activeTab === 'users' && isAdmin && (
              <Card>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <UserCog className="w-5 h-5 text-blue-500" />
                      <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-4">
                    Manage system administrators. Admins can log contraventions, manage training, and access all admin tools.
                  </p>

                  {/* Search */}
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search by name, email, or employee ID..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Users Table */}
                  {usersData && usersData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {usersData.map((userData) => (
                            <tr key={userData.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div>
                                  <p className="font-medium text-gray-900">{userData.name}</p>
                                  <p className="text-xs text-gray-500">{userData.employeeId}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700">{userData.email}</td>
                              <td className="px-4 py-3 text-gray-700">{userData.department?.name || '-'}</td>
                              <td className="px-4 py-3">
                                {userData.role === 'ADMIN' ? (
                                  <Badge className="bg-purple-100 text-purple-800">
                                    <ShieldCheck className="w-3 h-3 mr-1" />
                                    Admin
                                  </Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-800">User</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {userData.id === user?.userId ? (
                                  <span className="text-xs text-gray-400">Current user</span>
                                ) : userData.role === 'ADMIN' ? (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm(`Remove admin privileges from ${userData.name}?`)) {
                                        updateRoleMutation.mutate({ userId: userData.id, role: 'USER' });
                                      }
                                    }}
                                    disabled={updateRoleMutation.isPending}
                                  >
                                    Remove Admin
                                  </Button>
                                ) : (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm(`Grant admin privileges to ${userData.name}?`)) {
                                        updateRoleMutation.mutate({ userId: userData.id, role: 'ADMIN' });
                                      }
                                    }}
                                    disabled={updateRoleMutation.isPending}
                                  >
                                    Make Admin
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500">
                      <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p>No users found</p>
                    </div>
                  )}

                  {/* Admin Summary */}
                  {usersData && (
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>
                          Total Users: <strong>{usersData.length}</strong>
                        </span>
                        <span>
                          Admins: <strong>{usersData.filter(u => u.role === 'ADMIN').length}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Admin Tools Tab */}
            {activeTab === 'admin' && isAdmin && (
              <div className="space-y-6">
                {/* Email Status */}
                <Card>
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Mail className="w-5 h-5 text-blue-500" />
                      <h2 className="text-lg font-semibold text-gray-900">Email Configuration</h2>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-yellow-800">Sandbox Mode Active</p>
                          <p className="text-sm text-yellow-700 mt-1">
                            All emails are being redirected to: <strong>{emailStatus?.sandboxEmail || 'daniellow@open.gov.sg'}</strong>
                          </p>
                          <p className="text-xs text-yellow-600 mt-2">
                            To disable sandbox mode, set EMAIL_SANDBOX_MODE=false in environment variables.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">Email Provider</p>
                        <p className="text-sm font-medium text-gray-900">
                          {emailStatus?.emailProviderConfigured ? 'Postmark (Configured)' : 'Console Log (Development)'}
                        </p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">Sandbox Mode</p>
                        <Badge className={emailStatus?.enabled ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}>
                          {emailStatus?.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Data Export */}
                <Card>
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Download className="w-5 h-5 text-green-500" />
                      <h2 className="text-lg font-semibold text-gray-900">Data Export</h2>
                    </div>

                    <p className="text-sm text-gray-600 mb-4">
                      Export data to CSV format for reporting and analysis.
                    </p>

                    <div className="flex flex-wrap gap-3">
                      <Button variant="secondary" onClick={handleExportContraventions}>
                        <FileText className="w-4 h-4 mr-2" />
                        Export Contraventions
                      </Button>
                      <Button variant="secondary" onClick={handleExportTraining}>
                        <FileText className="w-4 h-4 mr-2" />
                        Export Training Records
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Fiscal Year Points Reset */}
                <Card>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-purple-500" />
                        <h2 className="text-lg font-semibold text-gray-900">Fiscal Year Points Reset</h2>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (confirm('Are you sure you want to reset ALL employee points to 0? This action cannot be undone.')) {
                            resetPointsMutation.mutate();
                          }
                        }}
                        disabled={resetPointsMutation.isPending}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${resetPointsMutation.isPending ? 'animate-spin' : ''}`} />
                        {resetPointsMutation.isPending ? 'Resetting...' : 'Reset All Points'}
                      </Button>
                    </div>

                    {fiscalYearStatus && (
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div className="p-3 bg-purple-50 rounded-lg">
                          <p className="text-xs text-purple-600">Current Fiscal Year</p>
                          <p className="text-lg font-bold text-purple-900">{fiscalYearStatus.currentFiscalYear}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-xs text-blue-600">Period</p>
                          <p className="text-sm font-medium text-blue-900">
                            {new Date(fiscalYearStatus.fiscalYearStart).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })} - {new Date(fiscalYearStatus.fiscalYearEnd).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-lg">
                          <p className="text-xs text-orange-600">Days Until Reset</p>
                          <p className="text-lg font-bold text-orange-900">{fiscalYearStatus.daysUntilReset}</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-xs text-red-600">Employees with Points</p>
                          <p className="text-lg font-bold text-red-900">{fiscalYearStatus.employeesWithPoints.length}</p>
                        </div>
                      </div>
                    )}

                    <p className="text-sm text-gray-600 mb-4">
                      All employee points reset to 0 at the start of each fiscal year (April 1st).
                      Use the reset button to manually trigger this process.
                    </p>

                    {fiscalYearStatus && fiscalYearStatus.employeesWithPoints.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Current Points</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Escalation Level</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {fiscalYearStatus.employeesWithPoints.map((emp) => (
                              <tr key={emp.employeeId} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium text-gray-900">{emp.employeeName}</td>
                                <td className="px-4 py-2 text-gray-700">{emp.totalPoints} pts</td>
                                <td className="px-4 py-2">
                                  {emp.level ? (
                                    <Badge className="bg-red-100 text-red-800">{emp.level.replace('_', ' ')}</Badge>
                                  ) : (
                                    <Badge className="bg-gray-100 text-gray-800">None</Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p>No employees currently have points</p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
