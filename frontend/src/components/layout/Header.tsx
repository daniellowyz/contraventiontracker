import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ExternalLink } from 'lucide-react';
import { notificationsApi, Notification } from '@/api/notifications.api';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.getAll,
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: notificationsApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter((n: Notification) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      setShowNotifications(false);
      navigate(notification.link);
    }
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  return (
    <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-40">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold text-stone-900 truncate">{title}</h1>
          {subtitle && <p className="text-[11px] sm:text-[13px] text-stone-500 mt-0.5 truncate">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {actions}

          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-stone-200 shadow-lg z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                  <h3 className="text-[13px] font-medium text-stone-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      disabled={markAllAsReadMutation.isPending}
                      className="text-[11px] text-stone-500 hover:text-stone-700 disabled:opacity-50"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {isLoading ? (
                    <div className="px-4 py-6 text-center">
                      <div className="animate-spin h-5 w-5 border border-stone-200 border-t-stone-500 mx-auto" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-6 h-6 text-stone-300 mx-auto mb-2" />
                      <p className="text-stone-500 text-[12px]">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((notification: Notification) => (
                      <div
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`px-4 py-3 hover:bg-stone-50 cursor-pointer border-b border-stone-100 last:border-0 transition-colors ${
                          !notification.read ? 'bg-stone-50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-1.5 h-1.5 mt-1.5 flex-shrink-0 ${!notification.read ? 'bg-blue-500' : 'bg-transparent'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[12px] font-medium text-stone-800 truncate">{notification.title}</p>
                              {notification.link && (
                                <ExternalLink className="w-3 h-3 text-stone-400 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-2">{notification.message}</p>
                            <p className="text-[10px] text-stone-400 mt-1">{formatTimeAgo(notification.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
