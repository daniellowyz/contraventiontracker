import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/api/client';
import { ApprovalRequestStatus } from '@/types';
import { UserPlus, Check, X } from 'lucide-react';

interface ContraventionApproval {
  id: string;
  contraventionId: string;
  approverId: string;
  status: ApprovalRequestStatus;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  contravention: {
    id: string;
    referenceNo: string;
    description: string;
    points: number;
    incidentDate: string;
    status: string;
    employee: {
      id: string;
      name: string;
      employeeId: string;
    };
    type: {
      name: string;
      category: string;
    };
  };
  approver: {
    id: string;
    name: string;
    email: string;
  };
}

interface ApprovalsResponse {
  approvals: ContraventionApproval[];
  total: number;
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

export function ApprovalPendingPage() {
  const { user, isAdmin } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedApproval, setSelectedApproval] = useState<ContraventionApproval | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Fetch pending approvals
  const { data, isLoading, error } = useQuery({
    queryKey: ['pending-approvals', isAdmin ? 'all' : user?.userId],
    queryFn: async () => {
      const endpoint = isAdmin ? '/approvals/all' : '/approvals/pending';
      const response = await api.get<{ success: boolean; data: ApprovalsResponse }>(endpoint);
      return response.data.data;
    },
  });

  // Review approval mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ approvalId, status, notes }: { approvalId: string; status: 'APPROVED' | 'REJECTED'; notes: string }) => {
      const response = await api.post(`/approvals/${approvalId}/review`, { status, notes });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      setSelectedApproval(null);
      setReviewNotes('');
    },
  });

  // Fetch pending approver requests (admin only)
  const { data: approverRequestsData, refetch: refetchApproverRequests } = useQuery({
    queryKey: ['approver-requests'],
    queryFn: async () => {
      const response = await api.get('/admin/approver-requests');
      return response.data.data as ApproverRequest[];
    },
    enabled: isAdmin,
  });

  // Approve approver request mutation
  const approveApproverMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post(`/admin/approver-requests/${userId}/approve`);
      return response.data;
    },
    onSuccess: () => {
      refetchApproverRequests();
    },
  });

  // Reject approver request mutation
  const rejectApproverMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post(`/admin/approver-requests/${userId}/reject`);
      return response.data;
    },
    onSuccess: () => {
      refetchApproverRequests();
    },
  });

  const handleReview = (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedApproval) return;
    reviewMutation.mutate({
      approvalId: selectedApproval.id,
      status,
      notes: reviewNotes,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="p-6 bg-red-50 border-red-200">
          <p className="text-red-600">Failed to load pending approvals. Please try again.</p>
        </Card>
      </div>
    );
  }

  const approvals = data?.approvals || [];
  const pendingApprovals = approvals.filter(a => a.status === 'PENDING');
  const reviewedApprovals = approvals.filter(a => a.status !== 'PENDING');

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdmin ? 'All Approval Requests' : 'Pending Approvals'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? 'View and manage all contravention approval requests'
              : 'Contraventions waiting for your approval'}
          </p>
        </div>
        <Badge variant={pendingApprovals.length > 0 ? 'warning' : 'default'}>
          {pendingApprovals.length} pending
        </Badge>
      </div>

      {/* Pending Approver Requests (Admin only) */}
      {isAdmin && approverRequestsData && approverRequestsData.length > 0 && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-blue-900">
              Pending Approver Requests ({approverRequestsData.length})
            </h2>
          </div>
          <p className="text-sm text-blue-700 mb-4">
            These users have requested to become Approvers during profile completion.
          </p>
          <div className="space-y-3">
            {approverRequestsData.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between bg-white p-4 rounded-lg border border-blue-200"
              >
                <div>
                  <p className="font-medium text-gray-900">{request.name}</p>
                  <p className="text-sm text-gray-600">{request.email}</p>
                  {request.position && (
                    <p className="text-xs text-gray-500">Position: {request.position}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Requested: {new Date(request.createdAt).toLocaleDateString()}
                  </p>
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
                      if (confirm(`Reject ${request.name}'s approver request?`)) {
                        rejectApproverMutation.mutate(request.id);
                      }
                    }}
                    disabled={approveApproverMutation.isPending || rejectApproverMutation.isPending}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pending Approvals */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Pending Review</h2>
        {pendingApprovals.length === 0 ? (
          <Card className="p-6 text-center text-gray-500">
            <p>No pending approval requests</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingApprovals.map((approval) => (
              <Card key={approval.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        to={`/contraventions/${approval.contraventionId}`}
                        className="text-lg font-semibold text-blue-600 hover:underline"
                      >
                        {approval.contravention.referenceNo}
                      </Link>
                      <Badge variant="default">{approval.contravention.points} pts</Badge>
                    </div>
                    <p className="text-gray-700 mb-2">{approval.contravention.description}</p>
                    <div className="text-sm text-gray-500 space-y-1">
                      <p>
                        <span className="font-medium">Employee:</span>{' '}
                        {approval.contravention.employee.name} ({approval.contravention.employee.employeeId})
                      </p>
                      <p>
                        <span className="font-medium">Type:</span>{' '}
                        {approval.contravention.type.name} ({approval.contravention.type.category})
                      </p>
                      <p>
                        <span className="font-medium">Incident Date:</span>{' '}
                        {new Date(approval.contravention.incidentDate).toLocaleDateString()}
                      </p>
                      {isAdmin && (
                        <p>
                          <span className="font-medium">Assigned to:</span>{' '}
                          {approval.approver.name} ({approval.approver.email})
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Requested:</span>{' '}
                        {new Date(approval.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedApproval(approval);
                        setReviewNotes('');
                      }}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Reviewed Approvals (for reference) */}
      {reviewedApprovals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Recently Reviewed</h2>
          <div className="grid gap-4">
            {reviewedApprovals.slice(0, 5).map((approval) => (
              <Card key={approval.id} className="p-4 bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        to={`/contraventions/${approval.contraventionId}`}
                        className="text-lg font-medium text-gray-700 hover:underline"
                      >
                        {approval.contravention.referenceNo}
                      </Link>
                      <Badge variant={approval.status === 'APPROVED' ? 'success' : 'danger'}>
                        {approval.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Employee:</span>{' '}
                      {approval.contravention.employee.name}
                    </p>
                    {approval.reviewNotes && (
                      <p className="text-sm text-gray-600 mt-1 italic">
                        "{approval.reviewNotes}"
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Reviewed on {approval.reviewedAt ? new Date(approval.reviewedAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">
              Review Approval Request
            </h3>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">{selectedApproval.contravention.referenceNo}</p>
              <p className="text-sm text-gray-600">{selectedApproval.contravention.description}</p>
              <p className="text-sm text-gray-500 mt-1">
                Employee: {selectedApproval.contravention.employee.name}
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Review Notes (optional)
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes about your decision..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setSelectedApproval(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleReview('REJECTED')}
                isLoading={reviewMutation.isPending}
              >
                Reject
              </Button>
              <Button
                onClick={() => handleReview('APPROVED')}
                isLoading={reviewMutation.isPending}
              >
                Approve
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
