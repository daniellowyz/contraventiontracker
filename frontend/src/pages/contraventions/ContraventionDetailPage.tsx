import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contraventionsApi, CreateContraventionInput } from '@/api/contraventions.api';
import { useAuthStore } from '@/stores/authStore';
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
  User,
  Building,
  FileText,
  CheckCircle,
  Clock,
  Upload,
  ExternalLink,
  FileCheck,
  Loader2
} from 'lucide-react';
import { Severity, ContraventionStatus } from '@/types';
import { uploadApprovalPdf } from '@/lib/supabase';

const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const severityColors: Record<Severity, BadgeVariant> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

const statusColors: Record<ContraventionStatus, BadgeVariant> = {
  PENDING_UPLOAD: 'warning',
  PENDING_REVIEW: 'info',
  COMPLETED: 'success',
};

const statusLabels: Record<ContraventionStatus, string> = {
  PENDING_UPLOAD: 'Awaiting Approval',
  PENDING_REVIEW: 'Admin Review',
  COMPLETED: 'Completed',
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (!contravention) return;

    // Only send fields that have actually changed
    const changes: Partial<CreateContraventionInput> = {};

    if (editData.description?.trim() !== contravention.description) {
      changes.description = editData.description?.trim();
    }
    if ((editData.summary?.trim() || '') !== (contravention.summary || '')) {
      changes.summary = editData.summary?.trim() || undefined;
    }
    if ((editData.vendor?.trim() || '') !== (contravention.vendor || '')) {
      changes.vendor = editData.vendor?.trim() || undefined;
    }
    if (editData.valueSgd !== contravention.valueSgd) {
      changes.valueSgd = editData.valueSgd;
    }
    if (editData.incidentDate !== contravention.incidentDate.split('T')[0]) {
      changes.incidentDate = editData.incidentDate;
    }

    // Check if any changes were made
    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setError('');
      return;
    }

    updateMutation.mutate(changes);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({});
    setError('');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !contravention) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      setUploadError('Please upload a PDF file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      // Upload to Supabase
      const publicUrl = await uploadApprovalPdf(file, contravention.referenceNo);

      if (!publicUrl) {
        throw new Error('Failed to upload file - Supabase not configured');
      }

      // Update contravention with the PDF URL
      await contraventionsApi.uploadApproval(id!, publicUrl);

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['contravention', id] });
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload approval document');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
                    <Badge variant={statusColors[contravention.status]}>
                      {statusLabels[contravention.status]}
                    </Badge>
                    <Badge variant={severityColors[contravention.severity]}>
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

                  {/* Approval Document */}
                  {contravention.approvalPdfUrl && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Approval Document</label>
                      <a
                        href={contravention.approvalPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <FileCheck className="w-4 h-4" />
                        <span>View Approval Document</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Authorizer Email */}
                  {contravention.authorizerEmail && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Authorizer Email</label>
                      <p className="text-gray-900">{contravention.authorizerEmail}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

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
            {!isEditing && contravention.status !== 'COMPLETED' && (
              <Card>
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Actions</h3>

                  {uploadError && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                      {uploadError}
                    </div>
                  )}

                  <div className="space-y-2">
                    {contravention.status === 'PENDING_UPLOAD' && (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          variant="secondary"
                          className="w-full justify-start"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Approval Document
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-gray-500 mt-1">
                          PDF only, max 10MB
                        </p>
                      </>
                    )}
                    {contravention.status === 'PENDING_REVIEW' && isAdmin && (
                      <Button
                        variant="primary"
                        className="w-full justify-start"
                        onClick={() => {
                          if (confirm('Are you sure you want to mark this contravention as complete?')) {
                            contraventionsApi.markComplete(id!).then(() => {
                              queryClient.invalidateQueries({ queryKey: ['contravention', id] });
                              queryClient.invalidateQueries({ queryKey: ['contraventions'] });
                            }).catch((err) => {
                              setError(err.message || 'Failed to mark as complete');
                            });
                          }
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Mark as Complete
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
