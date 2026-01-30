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
  BarChart3,
  Settings,
  LogOut,
  ClipboardCheck,
  X,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: FileWarning, label: 'Contraventions', href: '/contraventions' },
  { icon: Users, label: 'Employees', href: '/employees' },
  { icon: AlertTriangle, label: 'Escalations', href: '/escalations' },
  // { icon: GraduationCap, label: 'Training', href: '/training' },
  { icon: BarChart3, label: 'Reports', href: '/reports' },
];

const approverItems = [
  { icon: ClipboardCheck, label: 'Approvals', href: '/approvals' },
];

const adminItems = [
  { icon: Settings, label: 'Settings', href: '/settings' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, isAdmin, isApprover, logout } = useAuthStore();

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pendingApprovalsCount'],
    queryFn: approvalsApi.getPendingCount,
    enabled: isApprover,
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
  });

  const { data: pendingApproverRequestsCount = 0 } = useQuery({
    queryKey: ['pendingApproverRequestsCount'],
    queryFn: approversApi.getPendingRequestsCount,
    enabled: isAdmin,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const { data: myRejectedCount = 0 } = useQuery({
    queryKey: ['myRejectedCount'],
    queryFn: contraventionsApi.getMyRejectedCount,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const { data: pendingReviewCount = 0 } = useQuery({
    queryKey: ['pendingReviewCount'],
    queryFn: contraventionsApi.getPendingReviewCount,
    enabled: isAdmin,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const handleNavClick = () => {
    // Close mobile menu when navigating
    if (onClose) {
      onClose();
    }
  };

  const NavLink = ({ item, showBadge, badgeCount }: {
    item: typeof navItems[0],
    showBadge?: boolean,
    badgeCount?: number,
  }) => {
    const isActive = location.pathname === item.href ||
      (item.href !== '/' && location.pathname.startsWith(item.href));
    const Icon = item.icon;

    return (
      <Link
        to={item.href}
        onClick={handleNavClick}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
          isActive
            ? 'bg-neutral-100 text-neutral-900 border-l-4 border-orange-600'
            : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 border-l-4 border-transparent'
        )}
      >
        <Icon className={cn(
          "w-[18px] h-[18px]",
          isActive ? "text-orange-600" : "text-stone-400"
        )} />
        <span className="flex-1">{item.label}</span>
        {showBadge && badgeCount && badgeCount > 0 && (
          <span className="bg-orange-600 text-white text-[9px] font-semibold px-1.5 py-0.5 min-w-[16px] text-center">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Logo" className="w-6 h-6" />
          <span className="text-[13px] font-semibold text-neutral-900 tracking-tight">Contravention Tracker</span>
        </div>
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            showBadge={
              (item.href === '/contraventions' && myRejectedCount > 0) ||
              (item.href === '/contraventions' && isAdmin && pendingReviewCount > 0)
            }
            badgeCount={item.href === '/contraventions' ? (isAdmin ? pendingReviewCount : myRejectedCount) : undefined}
          />
        ))}

        {isApprover && (
          <>
            <div className="pt-6 pb-1 px-4">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                Approver
              </p>
            </div>
            {approverItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                showBadge={pendingCount > 0}
                badgeCount={pendingCount}
              />
            ))}
          </>
        )}

        {isAdmin && (
          <>
            <div className="pt-6 pb-1 px-4">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                Admin
              </p>
            </div>
            {adminItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                showBadge={pendingApproverRequestsCount > 0}
                badgeCount={pendingApproverRequestsCount}
              />
            ))}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="p-3 border-t-2 border-neutral-300">
        <div className="flex items-center gap-3 p-2 hover:bg-neutral-50 transition-colors">
          <div className="w-7 h-7 bg-neutral-900 flex items-center justify-center">
            <span className="text-[11px] font-medium text-white">
              {user?.name?.charAt(0) || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-neutral-900 truncate">{user?.name}</p>
            <p className="text-[10px] text-neutral-400">
              {isAdmin ? 'Admin' : isApprover ? 'Approver' : 'Staff'}
            </p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-all"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-56 bg-white flex-col h-full border-r-2 border-neutral-300">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 w-72 bg-white z-50 flex flex-col border-r-2 border-neutral-300 transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </div>
    </>
  );
}
