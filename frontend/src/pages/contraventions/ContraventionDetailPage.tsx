import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contraventionsApi, CreateContraventionInput } from '@/api/contraventions.api';
import { employeesApi, EmployeeListItem } from '@/api/employees.api';
import { teamsApi, Team } from '@/api/teams.api';
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
  Loader2,
  Trash2,
  Users,
  RefreshCw,
  Plus
} from 'lucide-react';
import { Severity, ContraventionStatus } from '@/types';
import { uploadApprovalPdf } from '@/lib/supabase';

const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const STATUS_OPTIONS = [
  { value: 'PENDING_UPLOAD', label: 'Pending Approval' },
  { value: 'PENDING_REVIEW', label: 'Admin Review' },
  { value: 'COMPLETED', label: 'Completed' },
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
  PENDING_UPLOAD: 'Pending Approval',
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
  const [editData, setEditData] = useState<Partial<CreateContraventionInput> & { severity?: Severity; employeeId?: string; teamId?: string; status?: ContraventionStatus }>({});
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showNewTeamInput, setShowNewTeamInput] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch contravention details
  const { data: contravention, isLoading, isError } = useQuery({
    queryKey: ['contravention', id],
    queryFn: () => contraventionsApi.getById(id!),
    enabled: !!id,
  });

  // Fetch employees for reassignment (only for admins)
  const { data: employeesData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesApi.getAll(),
    enabled: isAdmin,
  });

  // Fetch teams for team reassignment (only for admins)
  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.getAll(),
    enabled: isAdmin,
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => contraventionsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      navigate('/contraventions');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to delete contravention');
      setIsDeleting(false);
    },
  });

  // Create team mutation (for "Other: Specify" option)
  const createTeamMutation = useMutation({
    mutationFn: (name: string) => teamsApi.create({ name, isPersonal: false }),
    onSuccess: (newTeam: Team) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setEditData((prev) => ({ ...prev, teamId: newTeam.id }));
      setShowNewTeamInput(false);
      setNewTeamName('');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to create team');
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
        employeeId: contravention.employee.id,
        teamId: contravention.team?.id || '',
        status: contravention.status,
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
    const changes: Partial<CreateContraventionInput> & { employeeId?: string; status?: ContraventionStatus } = {};

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
    // Include employee reassignment if changed
    if (editData.employeeId && editData.employeeId !== contravention.employee.id) {
      changes.employeeId = editData.employeeId;
    }
    // Include team change if changed
    if (editData.teamId !== (contravention.team?.id || '')) {
      changes.teamId = editData.teamId || undefined;
    }
    // Include status change if changed (admin only)
    if (editData.status && editData.status !== contravention.status) {
      changes.status = editData.status;
    }

    // Check if any changes were made
    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setError('');
      return;
    }

    updateMutation.mutate(changes);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to permanently delete this contravention? This will also reverse the points assigned to the employee. This action cannot be undone.')) {
      setIsDeleting(true);
      deleteMutation.mutate();
    }
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

                  {/* Delete Button (Admin only when editing) */}
                  {isEditing && isAdmin && (
                    <div className="pt-4 mt-4 border-t border-gray-200">
                      <Button
                        variant="danger"
                        onClick={handleDelete}
                        disabled={isDeleting || deleteMutation.isPending}
                        className="w-full"
                      >
                        {isDeleting || deleteMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Contravention
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        This will permanently delete the contravention and reverse points.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Employee & Admin Controls */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Employee
                </h3>

                {/* Employee Reassignment (Admin only when editing) */}
                {isEditing && isAdmin ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Assigned To</label>
                      <select
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={editData.employeeId || ''}
                        onChange={(e) => setEditData({ ...editData, employeeId: e.target.value })}
                      >
                        {employeesData?.map((emp: EmployeeListItem) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.department?.name || 'No Dept'})
                          </option>
                        ))}
                      </select>
                      {editData.employeeId !== contravention.employee.id && (
                        <p className="text-xs text-amber-600 mt-1">
                          Points will be transferred when saved.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
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
                )}
              </div>
            </Card>

            {/* Team */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Team
                </h3>

                {isEditing && isAdmin ? (
                  <div>
                    {!showNewTeamInput ? (
                      <>
                        <select
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={editData.teamId || ''}
                          onChange={(e) => {
                            if (e.target.value === '__OTHER__') {
                              setShowNewTeamInput(true);
                              setEditData({ ...editData, teamId: '' });
                            } else {
                              setEditData({ ...editData, teamId: e.target.value });
                            }
                          }}
                        >
                          <option value="">No team assigned</option>
                          {teamsData?.map((team: Team) => (
                            <option key={team.id} value={team.id}>
                              {team.isPersonal ? `${team.name} (Personal)` : team.name}
                            </option>
                          ))}
                          <option value="__OTHER__">+ Other: Specify new team...</option>
                        </select>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            placeholder="New team name"
                            className="flex-1 text-sm"
                          />
                          <Button
                            type="button"
                            onClick={() => {
                              if (newTeamName.trim()) {
                                createTeamMutation.mutate(newTeamName.trim());
                              } else {
                                setError('Please enter a team name');
                              }
                            }}
                            isLoading={createTeamMutation.isPending}
                            disabled={createTeamMutation.isPending}
                            className="text-sm px-3"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewTeamInput(false);
                            setNewTeamName('');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          ← Back to team list
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {contravention.team ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={contravention.team.isPersonal ? 'warning' : 'info'}>
                          {contravention.team.name}
                        </Badge>
                        {contravention.team.isPersonal && (
                          <span className="text-xs text-gray-500">(Personal)</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No team assigned</p>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Status (Admin only when editing) */}
            {isAdmin && (
              <Card>
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Status
                  </h3>

                  {isEditing ? (
                    <div className="space-y-3">
                      <Select
                        options={STATUS_OPTIONS}
                        value={editData.status || ''}
                        onChange={(e) => setEditData({ ...editData, status: e.target.value as ContraventionStatus })}
                      />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1 mt-3">Severity</label>
                        <Select
                          options={SEVERITY_OPTIONS}
                          value={editData.severity || ''}
                          onChange={(e) => setEditData({ ...editData, severity: e.target.value as Severity })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant={statusColors[contravention.status]}>
                        {statusLabels[contravention.status]}
                      </Badge>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={severityColors[contravention.severity]}>
                          {contravention.severity}
                        </Badge>
                        <span className="text-xs text-gray-500">severity</span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

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
            {!isEditing && (contravention.status !== 'COMPLETED' || isAdmin) && (
              <Card>
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Actions</h3>

                  {uploadError && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                      {uploadError}
                    </div>
                  )}

                  <div className="space-y-2">
                    {/* Regular users can upload when PENDING_UPLOAD, admins can upload anytime */}
                    {(contravention.status === 'PENDING_UPLOAD' || isAdmin) && (
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
                              {contravention.approvalPdfUrl ? 'Replace Approval Document' : 'Upload Approval Document'}
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
