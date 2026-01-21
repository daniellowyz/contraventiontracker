import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { approvalsApi } from '@/api/approvals.api';
import { approversApi } from '@/api/approvers.api';
import { contraventionsApi } from '@/api/contraventions.api';
import {
  LayoutDashboard,
  FileWarning,
  Users,
  AlertTriangle,
  GraduationCap,
  BarChart3,
  Settings,
  LogOut,
  ClipboardCheck,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: FileWarning, label: 'Contraventions', href: '/contraventions' },
  { icon: Users, label: 'Employees', href: '/employees' },
  { icon: AlertTriangle, label: 'Escalations', href: '/escalations' },
  { icon: GraduationCap, label: 'Training', href: '/training' },
  { icon: BarChart3, label: 'Reports', href: '/reports' },
];

const approverItems = [
  { icon: ClipboardCheck, label: 'Approvals', href: '/approvals' },
];

const adminItems = [
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export function Sidebar() {
  const location = useLocation();
  const { user, isAdmin, isApprover, logout } = useAuthStore();

  // Fetch pending approvals count for approvers
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pendingApprovalsCount'],
    queryFn: approvalsApi.getPendingCount,
    enabled: isApprover,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch pending approver role requests count for admins
  const { data: pendingApproverRequestsCount = 0 } = useQuery({
    queryKey: ['pendingApproverRequestsCount'],
    queryFn: approversApi.getPendingRequestsCount,
    enabled: isAdmin,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch rejected contraventions count for users (contraventions they logged that were rejected)
  const { data: myRejectedCount = 0 } = useQuery({
    queryKey: ['myRejectedCount'],
    queryFn: contraventionsApi.getMyRejectedCount,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Contravention</h1>
            <p className="text-xs text-gray-500">Tracker</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));

          // Show rejected badge on Contraventions link for users who have rejected contraventions
          const showRejectedBadge = item.href === '/contraventions' && myRejectedCount > 0;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary-50 text-primary-700 border-l-3 border-primary-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:translate-x-0.5'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1">{item.label}</span>
              {showRejectedBadge && (
                <span className="bg-red-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center" title="Rejected - action required">
                  {myRejectedCount > 99 ? '99+' : myRejectedCount}
                </span>
              )}
            </Link>
          );
        })}

        {isApprover && (
          <>
            <div className="pt-4 mt-4 border-t border-gray-100">
              <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Approver</p>
            </div>
            {approverItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-primary-50 text-primary-700 border-l-3 border-primary-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:translate-x-0.5'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </>
        )}

        {isAdmin && (
          <>
            <div className="pt-4 mt-4 border-t border-gray-100">
              <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Admin</p>
            </div>
            {adminItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-primary-50 text-primary-700 border-l-3 border-primary-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:translate-x-0.5'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {pendingApproverRequestsCount > 0 && (
                    <span className="bg-orange-500 text-white text-xs font-medium px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingApproverRequestsCount > 99 ? '99+' : pendingApproverRequestsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-primary-700">
              {user?.name?.charAt(0) || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500">{isAdmin ? 'Admin' : isApprover ? 'Approver' : 'User'}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
