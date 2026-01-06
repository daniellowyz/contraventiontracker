import { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { User, Bell, Shield, Eye, EyeOff, Save, Check } from 'lucide-react';

type SettingsTab = 'profile' | 'notifications' | 'security';

export function SettingsPage() {
  const { user } = useAuthStore();
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

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ];

  return (
    <div>
      <Header
        title="Settings"
        subtitle="Manage your account settings and preferences"
      />

      <div className="p-8">
        <div className="flex gap-8 max-w-4xl">
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
                        value={user?.department?.name || 'Not assigned'}
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
          </div>
        </div>
      </div>
    </div>
  );
}
