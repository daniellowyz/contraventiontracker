import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { contraventionsApi } from '@/api/contraventions.api';
import { useAuthStore } from '@/stores/authStore';

export function RejectionAlert() {
  const [isDismissed, setIsDismissed] = useState(false);
  const { isAdmin } = useAuthStore();

  // Fetch rejected contraventions count for all users (contraventions they logged that were rejected)
  const { data: myRejectedCount = 0 } = useQuery({
    queryKey: ['myRejectedCount'],
    queryFn: contraventionsApi.getMyRejectedCount,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Don't show for admins (they see the admin review badge instead) or if dismissed or no rejected items
  if (isAdmin || isDismissed || myRejectedCount === 0) {
    return null;
  }

  return (
    <div className="bg-red-50 border-b border-red-200">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-red-800">Action Required:</span>{' '}
              <span className="text-red-700">
                You have {myRejectedCount} rejected contravention{myRejectedCount > 1 ? 's' : ''} that need{myRejectedCount === 1 ? 's' : ''} to be edited and resubmitted.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/contraventions?status=REJECTED"
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-1.5 rounded-md transition-colors"
            >
              View Rejected
            </Link>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-red-400 hover:text-red-600 p-1"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
