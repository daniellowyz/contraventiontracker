import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  UserCheck,
  UserCog,
  MessageSquare,
  Loader2,
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
  role: 'ADMIN' | 'APPROVER' | 'USER';
  isActive: boolean;
  department: { id: string; name: string } | null;
  createdAt: string;
}

interface ApproverRequest {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  position: string | null;
  role: string;
  requestedApprover: boolean;
  approverRequestStatus: string;
  createdAt: string;
}

interface SlackSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
  errors: string[];
}

interface DuplicateUser {
  ogpUser: {
    id: string;
    email: string;
    name: string;
    employeeId: string;
    contraventionCount: number;
  };
  openUser: {
    id: string;
    email: string;
    name: string;
    employeeId: string;
    contraventionCount: number;
  };
}

export function SettingsPage() {
  const { user, isAdmin } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saved, setSaved] = useState(false);

  // Get initial tab from URL or default to 'profile'
  const tabFromUrl = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabFromUrl && ['profile', 'notifications', 'security', 'users', 'admin'].includes(tabFromUrl)
      ? tabFromUrl
      : 'profile'
  );

  // Sync URL when tab changes
  useEffect(() => {
    if (activeTab !== 'profile') {
      setSearchParams({ tab: activeTab }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [activeTab, setSearchParams]);

  // Profile form state
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    employeeId: user?.employeeId || '',
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
  const [slackSyncResult, setSlackSyncResult] = useState<SlackSyncResult | null>(null);

  // Admin: Email status query - only load on admin tab
  const { data: emailStatus } = useQuery({
    queryKey: ['email-status'],
    queryFn: async () => {
      const response = await client.get('/admin/email-status');
      return response.data.data as EmailStatus;
    },
    enabled: isAdmin && activeTab === 'admin',
  });

  // Admin: Fiscal year status query - only load on admin tab
  const { data: fiscalYearStatus, refetch: refetchFiscalYear } = useQuery({
    queryKey: ['fiscal-year-status'],
    queryFn: async () => {
      const response = await client.get('/admin/points/fiscal-year-status');
      return response.data.data as FiscalYearStatus;
    },
    enabled: isAdmin && activeTab === 'admin',
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

  // Admin: Sync points from contraventions mutation
  const syncPointsMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/admin/points/sync');
      return response.data;
    },
    onSuccess: (data) => {
      refetchFiscalYear();
      const fixed = data.data.details.filter((d: { fixed: boolean }) => d.fixed);
      if (fixed.length > 0) {
        alert(`Points synced!\nEmployees fixed: ${data.data.employeesFixed}\n\nFixed employees:\n${fixed.map((d: { employeeName: string; previousPoints: number; newPoints: number }) => `- ${d.employeeName}: ${d.previousPoints} → ${d.newPoints} pts`).join('\n')}`);
      } else {
        alert('All employee points are already in sync!');
      }
    },
    onError: () => {
      alert('Failed to sync points');
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
    mutationFn: async ({ userId, role }: { userId: string; role: 'ADMIN' | 'APPROVER' | 'USER' }) => {
      const response = await client.patch(`/admin/users/${userId}/role`, { role });
      return response.data;
    },
    onSuccess: () => {
      refetchUsers();
      refetchApproverRequests();
    },
    onError: (error: Error) => {
      alert(error.message || 'Failed to update user role');
    },
  });

  // Admin: Fetch pending approver requests
  const { data: approverRequestsData, refetch: refetchApproverRequests } = useQuery({
    queryKey: ['approver-requests'],
    queryFn: async () => {
      const response = await client.get('/admin/approver-requests');
      return response.data.data as ApproverRequest[];
    },
    enabled: isAdmin && activeTab === 'users',
  });

  // Admin: Fetch pending approver requests count (for sidebar badge, always fetch if admin)
  const { data: pendingApproverRequestsCount = 0 } = useQuery({
    queryKey: ['pendingApproverRequestsCount'],
    queryFn: async () => {
      const response = await client.get('/admin/approver-requests/count');
      return response.data.data.count as number;
    },
    enabled: isAdmin,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Admin: Approve approver request mutation
  const approveApproverMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await client.post(`/admin/approver-requests/${userId}/approve`);
      return response.data;
    },
    onSuccess: () => {
      refetchUsers();
      refetchApproverRequests();
    },
    onError: (error: Error) => {
      alert(error.message || 'Failed to approve request');
    },
  });

  // Admin: Reject approver request mutation
  const rejectApproverMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const response = await client.post(`/admin/approver-requests/${userId}/reject`, { reason });
      return response.data;
    },
    onSuccess: () => {
      refetchApproverRequests();
    },
    onError: (error: Error) => {
      alert(error.message || 'Failed to reject request');
    },
  });

  // Admin: Sync users from Slack mutation
  const slackSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/admin/slack/sync');
      return response.data;
    },
    onSuccess: (data) => {
      setSlackSyncResult(data.data as SlackSyncResult);
      refetchUsers();
    },
    onError: (error: Error & { response?: { data?: { error?: string | { code?: string; message?: string } } } }) => {
      let message = 'Failed to sync from Slack';
      const errorData = error.response?.data?.error;
      if (typeof errorData === 'string') {
        message = errorData;
      } else if (errorData && typeof errorData === 'object') {
        message = errorData.message || errorData.code || JSON.stringify(errorData);
      } else if (error.message) {
        message = error.message;
      }
      setSlackSyncResult({
        created: 0,
        updated: 0,
        deactivated: 0,
        skipped: 0,
        errors: [message],
      });
    },
  });

  // Admin: Fetch duplicate users (ogp vs open)
  const { data: duplicatesData, refetch: refetchDuplicates } = useQuery({
    queryKey: ['user-duplicates'],
    queryFn: async () => {
      const response = await client.get('/admin/users/duplicates');
      return response.data.data as DuplicateUser[];
    },
    enabled: isAdmin && activeTab === 'users',
  });

  // Admin: Merge users mutation
  const mergeUsersMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const response = await client.post('/admin/users/merge', { sourceId, targetId });
      return response.data;
    },
    onSuccess: (data) => {
      alert(data.message);
      refetchUsers();
      refetchDuplicates();
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      alert(error.response?.data?.error || error.message || 'Failed to merge users');
    },
  });

  // Admin: Fetch inactive/deactivated users
  interface InactiveUser {
    id: string;
    email: string;
    name: string;
    employeeId: string;
    isActive: boolean;
    contraventionCount: number;
  }
  const { data: inactiveUsersData, refetch: refetchInactiveUsers } = useQuery({
    queryKey: ['inactive-users'],
    queryFn: async () => {
      const response = await client.get('/admin/users/inactive');
      return response.data.data as InactiveUser[];
    },
    enabled: isAdmin && activeTab === 'users',
  });

  // Admin: Reactivate user mutation
  const reactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await client.patch(`/admin/users/${userId}/status`, { isActive: true });
      return response.data;
    },
    onSuccess: (data) => {
      alert(`Successfully reactivated ${data.data.name}`);
      refetchUsers();
      refetchInactiveUsers();
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      alert(error.response?.data?.error || error.message || 'Failed to reactivate user');
    },
  });


  const handleProfileSave = () => {
    // In a real app, this would call an API
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
    { id: 'profile' as const, label: 'Profile', icon: User, badge: 0 },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell, badge: 0 },
    { id: 'security' as const, label: 'Security', icon: Shield, badge: 0 },
    ...(isAdmin ? [{ id: 'users' as const, label: 'User Management', icon: Users, badge: pendingApproverRequestsCount }] : []),
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin Tools', icon: Settings, badge: 0 }] : []),
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
                  <span className="flex-1 text-left">{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className="bg-orange-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
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
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Security</h2>
                  <p className="text-sm text-gray-600 mb-6">
                    Authentication is handled via OTP (One-Time Password) sent to your email.
                  </p>

                  <div className="pt-4 border-t border-gray-200">
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
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSlackSyncResult(null);
                        slackSyncMutation.mutate();
                      }}
                      disabled={slackSyncMutation.isPending}
                    >
                      {slackSyncMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Sync from Slack
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-sm text-gray-600 mb-4">
                    Manage system administrators. Admins can log contraventions, manage training, and access all admin tools.
                  </p>

                  {/* Slack Sync Results */}
                  {slackSyncResult && (
                    <div className={`mb-4 p-4 rounded-lg border ${slackSyncResult.errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <div className="flex items-start gap-3">
                        {slackSyncResult.errors.length > 0 ? (
                          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${slackSyncResult.errors.length > 0 ? 'text-red-800' : 'text-green-800'}`}>
                            Slack Sync Complete
                          </p>
                          <div className="mt-2 text-sm grid grid-cols-4 gap-2">
                            <div>
                              <span className="text-gray-600">Created:</span>{' '}
                              <strong className="text-green-700">{slackSyncResult.created}</strong>
                            </div>
                            <div>
                              <span className="text-gray-600">Updated:</span>{' '}
                              <strong className="text-blue-700">{slackSyncResult.updated}</strong>
                            </div>
                            <div>
                              <span className="text-gray-600">Deactivated:</span>{' '}
                              <strong className="text-orange-700">{slackSyncResult.deactivated}</strong>
                            </div>
                            <div>
                              <span className="text-gray-600">Skipped:</span>{' '}
                              <strong className="text-gray-700">{slackSyncResult.skipped}</strong>
                            </div>
                          </div>
                          {slackSyncResult.errors.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-red-700 font-medium">Errors:</p>
                              <ul className="text-xs text-red-600 list-disc list-inside">
                                {slackSyncResult.errors.map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setSlackSyncResult(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Duplicate Users Section */}
                  {duplicatesData && duplicatesData.length > 0 && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <h4 className="font-medium text-yellow-800">
                          Duplicate Users Found ({duplicatesData.length})
                        </h4>
                      </div>
                      <p className="text-sm text-yellow-700 mb-4">
                        The following users have both @ogp.gov.sg and @open.gov.sg accounts.
                        Merging will transfer all contraventions from the ogp account to the open account.
                      </p>
                      <div className="space-y-3">
                        {duplicatesData.map((dup, idx) => (
                          <div key={idx} className="bg-white p-3 rounded border border-yellow-200 flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-4 text-sm">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">{dup.ogpUser.name}</p>
                                  <p className="text-gray-600">{dup.ogpUser.email}</p>
                                  <p className="text-xs text-gray-500">
                                    {dup.ogpUser.contraventionCount} contravention(s)
                                  </p>
                                </div>
                                <div className="text-gray-400">→</div>
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">{dup.openUser.name}</p>
                                  <p className="text-green-600">{dup.openUser.email}</p>
                                  <p className="text-xs text-gray-500">
                                    {dup.openUser.contraventionCount} contravention(s)
                                  </p>
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Merge ${dup.ogpUser.email} into ${dup.openUser.email}?\n\nThis will transfer all contraventions and delete the ogp account.`)) {
                                  mergeUsersMutation.mutate({
                                    sourceId: dup.ogpUser.id,
                                    targetId: dup.openUser.id,
                                  });
                                }
                              }}
                              disabled={mergeUsersMutation.isPending}
                              className="ml-4"
                            >
                              {mergeUsersMutation.isPending ? 'Merging...' : 'Merge'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* OGP Users Management Section - hidden as remaining accounts have logged contraventions and cannot be deleted */}

                  {/* Deactivated Users Section */}
                  {inactiveUsersData && inactiveUsersData.length > 0 && (
                    <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-5 h-5 text-gray-500" />
                        <h4 className="font-medium text-gray-800">
                          Deactivated Users ({inactiveUsersData.length})
                        </h4>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        These users have been deactivated but their contravention records are preserved.
                        You can reactivate them if needed.
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {inactiveUsersData.map((inactiveUser) => (
                          <div key={inactiveUser.id} className="bg-white p-3 rounded border border-gray-200 flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{inactiveUser.name}</p>
                              <p className="text-sm text-gray-600">{inactiveUser.email}</p>
                              <p className="text-xs text-gray-500">
                                {inactiveUser.contraventionCount} contravention(s)
                              </p>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Reactivate ${inactiveUser.email}?\n\nThis user will be able to log in again.`)) {
                                  reactivateUserMutation.mutate(inactiveUser.id);
                                }
                              }}
                              disabled={reactivateUserMutation.isPending}
                              className="text-green-600 hover:text-green-700"
                            >
                              {reactivateUserMutation.isPending ? 'Reactivating...' : 'Reactivate'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending Approver Requests */}
                  {approverRequestsData && approverRequestsData.length > 0 && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <h3 className="text-sm font-semibold text-yellow-800">
                          Pending Approver Requests ({approverRequestsData.length})
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {approverRequestsData.map((request) => (
                          <div
                            key={request.id}
                            className="flex items-center justify-between bg-white p-3 rounded-lg border border-yellow-200"
                          >
                            <div>
                              <p className="font-medium text-gray-900">{request.name}</p>
                              <p className="text-sm text-gray-600">{request.email}</p>
                              {request.position && (
                                <p className="text-xs text-gray-500">{request.position}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Approve ${request.name} as an Approver?`)) {
                                    approveApproverMutation.mutate(request.id);
                                  }
                                }}
                                disabled={approveApproverMutation.isPending || rejectApproverMutation.isPending}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  const reason = prompt(`Please provide a reason for rejecting ${request.name}'s approver request:`);
                                  if (reason !== null) {
                                    if (reason.trim() === '') {
                                      alert('Please provide a reason for rejection');
                                      return;
                                    }
                                    rejectApproverMutation.mutate({ userId: request.id, reason: reason.trim() });
                                  }
                                }}
                                disabled={approveApproverMutation.isPending || rejectApproverMutation.isPending}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                                <p className="font-medium text-gray-900">{userData.name}</p>
                              </td>
                              <td className="px-4 py-3 text-gray-700">{userData.email}</td>
                              <td className="px-4 py-3 text-gray-700">{userData.department?.name || '-'}</td>
                              <td className="px-4 py-3">
                                {userData.role === 'ADMIN' ? (
                                  <Badge className="bg-purple-100 text-purple-800">
                                    <ShieldCheck className="w-3 h-3 mr-1" />
                                    Admin
                                  </Badge>
                                ) : userData.role === 'APPROVER' ? (
                                  <Badge className="bg-blue-100 text-blue-800">
                                    <UserCheck className="w-3 h-3 mr-1" />
                                    Approver
                                  </Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-800">User</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {userData.id === user?.userId ? (
                                  <span className="text-xs text-gray-400">Current user</span>
                                ) : userData.role === 'ADMIN' ? (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm(`Demote ${userData.name} to Approver?`)) {
                                          updateRoleMutation.mutate({ userId: userData.id, role: 'APPROVER' });
                                        }
                                      }}
                                      disabled={updateRoleMutation.isPending}
                                    >
                                      Demote to Approver
                                    </Button>
                                  </div>
                                ) : userData.role === 'APPROVER' ? (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm(`Promote ${userData.name} to Admin?`)) {
                                          updateRoleMutation.mutate({ userId: userData.id, role: 'ADMIN' });
                                        }
                                      }}
                                      disabled={updateRoleMutation.isPending}
                                    >
                                      Make Admin
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm(`Remove approver privileges from ${userData.name}?`)) {
                                          updateRoleMutation.mutate({ userId: userData.id, role: 'USER' });
                                        }
                                      }}
                                      disabled={updateRoleMutation.isPending}
                                    >
                                      Remove Approver
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm(`Grant approver privileges to ${userData.name}?`)) {
                                          updateRoleMutation.mutate({ userId: userData.id, role: 'APPROVER' });
                                        }
                                      }}
                                      disabled={updateRoleMutation.isPending}
                                    >
                                      Make Approver
                                    </Button>
                                    <Button
                                      variant="secondary"
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
                                  </div>
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
                        <span>
                          Approvers: <strong>{usersData.filter(u => u.role === 'APPROVER').length}</strong>
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
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => syncPointsMutation.mutate()}
                          disabled={syncPointsMutation.isPending}
                        >
                          <RefreshCw className={`w-4 h-4 mr-2 ${syncPointsMutation.isPending ? 'animate-spin' : ''}`} />
                          {syncPointsMutation.isPending ? 'Syncing...' : 'Sync Points'}
                        </Button>
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
