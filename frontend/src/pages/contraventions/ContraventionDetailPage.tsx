import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contraventionsApi, CreateContraventionInput } from '@/api/contraventions.api';
import { useAuthStore } from '@/stores/auth.store';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  AlertTriangle,
  Calendar,
  User,
  Building,
  FileText,
  DollarSign,
  CheckCircle,
  Clock,
  MessageSquare
} from 'lucide-react';
import { Severity, ContraventionStatus } from '@/types';

const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ESCALATED', label: 'Escalated' },
];

const severityColors: Record<Severity, string> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'error',
  CRITICAL: 'error',
};

const statusColors: Record<ContraventionStatus, string> = {
  PENDING: 'warning',
  ACKNOWLEDGED: 'info',
  DISPUTED: 'error',
  CONFIRMED: 'info',
  RESOLVED: 'success',
  ESCALATED: 'error',
};

export function ContraventionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CreateContraventionInput> & { severity?: Severity }>({});
  const [error, setError] = useState('');

  // Fetch contravention details
  const { data: contravention, isLoading, isError } = useQuery({
    queryKey: ['contravention', id],
    queryFn: () => contraventionsApi.getById(id!),
    enabled: !!id,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateContraventionInput>) => contraventionsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contravention', id] });
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      setIsEditing(false);
      setError('');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to update contravention');
    },
  });

  const handleEdit = () => {
    if (contravention) {
      setEditData({
        vendor: contravention.vendor || '',
        valueSgd: contravention.valueSgd,
        description: contravention.description,
        summary: contravention.summary || '',
        incidentDate: contravention.incidentDate.split('T')[0],
        severity: contravention.severity,
      });
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (!editData.description?.trim()) {
      setError('Description is required');
      return;
    }
    updateMutation.mutate(editData);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({});
    setError('');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div>
        <Header title="Loading..." />
        <div className="p-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (isError || !contravention) {
    return (
      <div>
        <Header
          title="Contravention Not Found"
          actions={
            <Button variant="secondary" onClick={() => navigate('/contraventions')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
          }
        />
        <div className="p-8">
          <Card>
            <div className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900">Contravention not found</h2>
              <p className="text-gray-500 mt-2">The contravention you're looking for doesn't exist or has been deleted.</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={`Contravention ${contravention.referenceNo}`}
        subtitle={contravention.type.name}
        actions={
          <div className="flex gap-2">
            {isAdmin && !isEditing && (
              <Button onClick={handleEdit}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {isEditing && (
              <>
                <Button variant="secondary" onClick={handleCancel}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSave} isLoading={updateMutation.isPending}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => navigate('/contraventions')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
          </div>
        }
      />

      <div className="p-8 max-w-5xl">
        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Contravention Details</h2>

                <div className="space-y-4">
                  {/* Status and Severity Badges */}
                  <div className="flex gap-3">
                    <Badge variant={statusColors[contravention.status] as 'success' | 'warning' | 'error' | 'info'}>
                      {contravention.status}
                    </Badge>
                    <Badge variant={severityColors[contravention.severity] as 'success' | 'warning' | 'error'}>
                      {contravention.severity} Severity
                    </Badge>
                    <Badge variant="default">{contravention.points} Points</Badge>
                  </div>

                  {/* Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Type</label>
                    <p className="text-gray-900">{contravention.type.name}</p>
                    <p className="text-sm text-gray-500">Category: {contravention.type.category}</p>
                  </div>

                  {/* Summary */}
                  {isEditing ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
                      <Input
                        type="text"
                        value={editData.summary || ''}
                        onChange={(e) => setEditData({ ...editData, summary: e.target.value })}
                        placeholder="Brief summary"
                      />
                    </div>
                  ) : contravention.summary ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Summary</label>
                      <p className="text-gray-900">{contravention.summary}</p>
                    </div>
                  ) : null}

                  {/* Description */}
                  {isEditing ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[120px]"
                        value={editData.description || ''}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        placeholder="Detailed description..."
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Description</label>
                      <p className="text-gray-900 whitespace-pre-wrap">{contravention.description}</p>
                    </div>
                  )}

                  {/* Vendor */}
                  {isEditing ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                      <Input
                        type="text"
                        value={editData.vendor || ''}
                        onChange={(e) => setEditData({ ...editData, vendor: e.target.value })}
                        placeholder="Vendor name"
                      />
                    </div>
                  ) : contravention.vendor ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Vendor</label>
                      <p className="text-gray-900">{contravention.vendor}</p>
                    </div>
                  ) : null}

                  {/* Value */}
                  {isEditing ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Value (SGD)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editData.valueSgd || ''}
                        onChange={(e) => setEditData({ ...editData, valueSgd: e.target.value ? parseFloat(e.target.value) : undefined })}
                        placeholder="0.00"
                      />
                    </div>
                  ) : contravention.valueSgd ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Value</label>
                      <p className="text-gray-900">${contravention.valueSgd.toLocaleString('en-SG', { minimumFractionDigits: 2 })}</p>
                    </div>
                  ) : null}

                  {/* Severity (Admin only when editing) */}
                  {isEditing && isAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                      <Select
                        options={SEVERITY_OPTIONS}
                        value={editData.severity || ''}
                        onChange={(e) => setEditData({ ...editData, severity: e.target.value as Severity })}
                      />
                    </div>
                  )}

                  {/* Incident Date */}
                  {isEditing ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Incident Date</label>
                      <Input
                        type="date"
                        value={editData.incidentDate || ''}
                        onChange={(e) => setEditData({ ...editData, incidentDate: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Incident Date</label>
                      <p className="text-gray-900">{formatDate(contravention.incidentDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Disputes Section */}
            {contravention.disputes && contravention.disputes.length > 0 && (
              <Card>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Disputes</h2>
                  <div className="space-y-4">
                    {contravention.disputes.map((dispute) => (
                      <div key={dispute.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <Badge variant={dispute.status === 'UPHELD' ? 'success' : dispute.status === 'OVERTURNED' ? 'warning' : 'info'}>
                              {dispute.status}
                            </Badge>
                            <p className="mt-2 text-sm text-gray-900">{dispute.reason}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              Submitted by {dispute.submittedBy.name} on {formatDateTime(dispute.createdAt)}
                            </p>
                          </div>
                        </div>
                        {dispute.panelDecision && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Panel Decision:</span> {dispute.panelDecision}
                            </p>
                            {dispute.decidedBy && (
                              <p className="text-xs text-gray-500 mt-1">
                                Decided by {dispute.decidedBy.name} on {dispute.decidedAt && formatDateTime(dispute.decidedAt)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Employee Info */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Employee</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{contravention.employee.name}</p>
                      <p className="text-xs text-gray-500">{contravention.employee.email}</p>
                    </div>
                  </div>
                  {contravention.employee.department && (
                    <div className="flex items-center gap-3">
                      <Building className="w-4 h-4 text-gray-400" />
                      <p className="text-sm text-gray-600">{contravention.employee.department.name}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Timeline */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Timeline</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Created</p>
                      <p className="text-xs text-gray-500">{formatDateTime(contravention.createdAt)}</p>
                      <p className="text-xs text-gray-500">by {contravention.loggedBy.name}</p>
                    </div>
                  </div>

                  {contravention.acknowledgedAt && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Acknowledged</p>
                        <p className="text-xs text-gray-500">{formatDateTime(contravention.acknowledgedAt)}</p>
                        {contravention.acknowledgedBy && (
                          <p className="text-xs text-gray-500">by {contravention.acknowledgedBy.name}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {contravention.resolvedDate && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Resolved</p>
                        <p className="text-xs text-gray-500">{formatDateTime(contravention.resolvedDate)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Last Updated</p>
                      <p className="text-xs text-gray-500">{formatDateTime(contravention.updatedAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Quick Actions */}
            {!isEditing && (
              <Card>
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Actions</h3>
                  <div className="space-y-2">
                    {contravention.status === 'PENDING' && (
                      <Button variant="secondary" className="w-full justify-start">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Acknowledge
                      </Button>
                    )}
                    {(contravention.status === 'PENDING' || contravention.status === 'ACKNOWLEDGED') && (
                      <Button variant="secondary" className="w-full justify-start">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Submit Dispute
                      </Button>
                    )}
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
