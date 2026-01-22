import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contraventionsApi, CreateContraventionInput, UserUpdateContraventionInput, ResubmitContraventionInput } from '@/api/contraventions.api';
import { employeesApi, EmployeeListItem } from '@/api/employees.api';
import { teamsApi, Team } from '@/api/teams.api';
import { approversApi } from '@/api/approvers.api';
import { approvalsApi } from '@/api/approvals.api';
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
  Plus,
  UserX,
  XCircle,
  UserCheck,
  ClipboardCheck,
  RotateCcw,
  Paperclip,
  Sparkles,
  Star
} from 'lucide-react';
import { ContraventionStatus } from '@/types';
import { uploadApprovalPdf } from '@/lib/supabase';

const STATUS_OPTIONS = [
  { value: 'PENDING_APPROVAL', label: 'Pending Approver Review' },
  { value: 'PENDING_UPLOAD', label: 'Pending PDF Upload' },
  { value: 'PENDING_REVIEW', label: 'Admin Review' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Rejected' },
];

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const statusColors: Record<ContraventionStatus, BadgeVariant> = {
  PENDING_APPROVAL: 'warning',
  PENDING_UPLOAD: 'info',
  PENDING_REVIEW: 'info',
  COMPLETED: 'success',
  REJECTED: 'danger',
};

const statusLabels: Record<ContraventionStatus, string> = {
  PENDING_APPROVAL: 'Pending Approver Review',
  PENDING_UPLOAD: 'Pending PDF Upload',
  PENDING_REVIEW: 'Admin Review',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

export function ContraventionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [isEditing, setIsEditing] = useState(false);
  const [isUserEditing, setIsUserEditing] = useState(false); // User edit mode (non-admin) - merged edit and resubmit
  const [editData, setEditData] = useState<Partial<CreateContraventionInput> & { employeeId?: string; teamId?: string; status?: ContraventionStatus; points?: number; justification?: string; mitigation?: string }>({});
  const [userEditData, setUserEditData] = useState<UserUpdateContraventionInput & { authorizerEmail?: string }>({});
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showNewTeamInput, setShowNewTeamInput] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [isPersonalEdit, setIsPersonalEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Promote to permanent type state
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteData, setPromoteData] = useState({
    name: '',
    category: 'PROCUREMENT' as string,
    defaultPoints: 1,
  });
  const [isPromoting, setIsPromoting] = useState(false);

  // URL input for supporting docs in user edit/resubmit
  const [newDocUrl, setNewDocUrl] = useState('');

  // Approver review state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // Departed member handling for reassignment
  const [isDepartedMember, setIsDepartedMember] = useState(false);
  const [departedEmail, setDepartedEmail] = useState('');
  const [departedName, setDepartedName] = useState('');
  const [isCreatingDeparted, setIsCreatingDeparted] = useState(false);

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

  // Fetch approvers for user edit (for resubmit option)
  const { data: approvers } = useQuery({
    queryKey: ['approvers'],
    queryFn: () => approversApi.getAll(),
    enabled: isUserEditing,
  });

  // Check if current user can edit this contravention (non-admin edit)
  const canUserEdit = contravention &&
    user?.userId === contravention.loggedBy?.id &&
    ['PENDING_APPROVAL', 'REJECTED'].includes(contravention.status);

  // Check if current user is the assigned approver for a pending approval
  const pendingApproval = contravention?.approvalRequests?.find(
    (req) => req.status === 'PENDING' && req.approver?.id === user?.userId
  );
  const isAssignedApprover = !!pendingApproval;

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

  // User edit mutation (for users editing their own contraventions)
  const userEditMutation = useMutation({
    mutationFn: (data: UserUpdateContraventionInput) => contraventionsApi.userUpdate(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contravention', id] });
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      setIsUserEditing(false);
      setUserEditData({});
      setError('');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to update contravention');
    },
  });

  // Resubmit mutation (for resubmitting rejected contraventions)
  const resubmitMutation = useMutation({
    mutationFn: (data: ResubmitContraventionInput) => contraventionsApi.resubmit(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contravention', id] });
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      setIsUserEditing(false);
      setUserEditData({});
      setError('');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to resubmit contravention');
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
        justification: contravention.justification || '',
        mitigation: contravention.mitigation || '',
        summary: contravention.summary || '',
        incidentDate: contravention.incidentDate.split('T')[0],
        employeeId: contravention.employee.id,
        teamId: contravention.team?.id || '',
        status: contravention.status,
        points: contravention.points,
      });
      // Check if current team is the "Personal" team
      setIsPersonalEdit(contravention.team?.isPersonal || false);
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
    // Include points change if changed (admin only, for "Others" type)
    if (editData.points !== undefined && editData.points !== contravention.points) {
      changes.points = editData.points;
    }
    // Include justification change if changed (admin only)
    if ((editData.justification?.trim() || '') !== (contravention.justification || '')) {
      changes.justification = editData.justification?.trim() || '';
    }
    // Include mitigation change if changed (admin only)
    if ((editData.mitigation?.trim() || '') !== (contravention.mitigation || '')) {
      changes.mitigation = editData.mitigation?.trim() || '';
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
    setIsDepartedMember(false);
    setDepartedEmail('');
    setDepartedName('');
  };

  // User edit mode handlers
  const handleUserEdit = () => {
    if (contravention) {
      setUserEditData({
        vendor: contravention.vendor || '',
        valueSgd: contravention.valueSgd,
        description: contravention.description,
        justification: contravention.justification || '',
        mitigation: contravention.mitigation || '',
        summary: contravention.summary || '',
        evidenceUrls: contravention.evidenceUrls || [],
        supportingDocs: contravention.supportingDocs || [],
        authorizerEmail: contravention.authorizerEmail || '',
      });
      setIsUserEditing(true);
    }
  };

  const handleUserEditSave = () => {
    if (!userEditData.description?.trim()) {
      setError('Description is required');
      return;
    }

    userEditMutation.mutate(userEditData);
  };

  const handleUserEditCancel = () => {
    setIsUserEditing(false);
    setUserEditData({});
    setNewDocUrl('');
    setError('');
  };

  // Resubmit from user edit form (for rejected contraventions)
  const handleUserEditResubmit = () => {
    if (!userEditData.description?.trim()) {
      setError('Description is required');
      return;
    }
    if (!userEditData.justification?.trim()) {
      setError('Justification is required');
      return;
    }
    if (!userEditData.mitigation?.trim()) {
      setError('Mitigation measures are required');
      return;
    }
    if (!userEditData.authorizerEmail?.trim()) {
      setError('Please select an approver to resubmit');
      return;
    }

    // Use resubmit API
    resubmitMutation.mutate({
      description: userEditData.description!,
      justification: userEditData.justification!,
      mitigation: userEditData.mitigation!,
      vendor: userEditData.vendor || undefined,
      valueSgd: userEditData.valueSgd || undefined,
      summary: userEditData.summary || undefined,
      supportingDocs: userEditData.supportingDocs,
      authorizerEmail: userEditData.authorizerEmail,
    });
  };

  const removeExistingDoc = (index: number) => {
    const currentDocs = userEditData.supportingDocs || [];
    setUserEditData({ ...userEditData, supportingDocs: currentDocs.filter((_: string, i: number) => i !== index) });
  };

  // Approver review handlers
  const handleApprove = async () => {
    if (!pendingApproval) return;

    if (!confirm('Are you sure you want to approve this contravention?')) return;

    setIsApproving(true);
    setError('');

    try {
      await approvalsApi.reviewApproval(pendingApproval.id, {
        status: 'APPROVED',
      });

      queryClient.invalidateQueries({ queryKey: ['contravention', id] });
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      queryClient.invalidateQueries({ queryKey: ['pendingApprovalsCount'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve contravention');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!pendingApproval) return;

    if (!rejectionNotes.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setIsRejecting(true);
    setError('');

    try {
      await approvalsApi.reviewApproval(pendingApproval.id, {
        status: 'REJECTED',
        notes: rejectionNotes.trim(),
      });

      queryClient.invalidateQueries({ queryKey: ['contravention', id] });
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      queryClient.invalidateQueries({ queryKey: ['pendingApprovalsCount'] });
      setShowRejectModal(false);
      setRejectionNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject contravention');
    } finally {
      setIsRejecting(false);
    }
  };

  // Handler for creating departed member during reassignment
  const handleCreateDepartedMember = async () => {
    if (!departedEmail.trim() || !departedName.trim()) {
      setError('Please enter both email and name for the departed member');
      return;
    }

    try {
      setIsCreatingDeparted(true);
      const result = await employeesApi.createDeparted({
        email: departedEmail.trim(),
        name: departedName.trim(),
      });

      // Set the employee ID to the newly created (or existing) departed member
      setEditData((prev) => ({ ...prev, employeeId: result.id }));
      setIsDepartedMember(false);
      setDepartedEmail('');
      setDepartedName('');
      queryClient.invalidateQueries({ queryKey: ['employees'] });

      if (result.isExisting) {
        setError('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create departed member');
    } finally {
      setIsCreatingDeparted(false);
    }
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
            {/* Admin edit button */}
            {isAdmin && !isEditing && !isUserEditing && (
              <Button onClick={handleEdit}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {/* User edit button (for their own contraventions) */}
            {!isAdmin && canUserEdit && !isUserEditing && (
              <Button onClick={handleUserEdit} variant={contravention.status === 'REJECTED' ? 'primary' : 'secondary'}>
                <Edit2 className="w-4 h-4 mr-2" />
                {contravention.status === 'REJECTED' ? 'Edit and Resubmit' : 'Edit'}
              </Button>
            )}
            {/* Admin editing controls */}
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
            {/* User editing controls */}
            {isUserEditing && (
              <>
                <Button variant="secondary" onClick={handleUserEditCancel}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                {/* For rejected contraventions, show Save Draft and Resubmit options */}
                {contravention.status === 'REJECTED' ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={handleUserEditSave}
                      isLoading={userEditMutation.isPending}
                      disabled={resubmitMutation.isPending}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Draft
                    </Button>
                    <Button
                      onClick={handleUserEditResubmit}
                      isLoading={resubmitMutation.isPending}
                      disabled={userEditMutation.isPending}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Resubmit for Approval
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleUserEditSave} isLoading={userEditMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Update
                  </Button>
                )}
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
                  {/* Status and Points Badges */}
                  <div className="flex gap-3">
                    <Badge variant={statusColors[contravention.status]}>
                      {statusLabels[contravention.status]}
                    </Badge>
                    <Badge variant="default">{contravention.points} Points</Badge>
                  </div>

                  {/* Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Type</label>
                    <p className="text-gray-900">
                      {contravention.type.name}
                      {contravention.customTypeName && (
                        <span className="text-blue-600 ml-1">: {contravention.customTypeName}</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">Category: {contravention.type.category}</p>
                    {contravention.type.isOthers && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ This is an "Others" type - Admin can adjust points
                      </p>
                    )}
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

                  {/* Justification - Editable for admin, or read-only when not editing for users */}
                  {(isAdmin || !isEditing) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Justification for Non-Compliance</label>
                      {isEditing && isAdmin ? (
                        <textarea
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                          rows={3}
                          value={editData.justification || ''}
                          onChange={(e) => setEditData({ ...editData, justification: e.target.value })}
                          placeholder="Enter justification for non-compliance"
                        />
                      ) : (
                        <p className="text-gray-900 whitespace-pre-wrap">{contravention.justification || <span className="text-gray-400 italic">Not provided</span>}</p>
                      )}
                    </div>
                  )}

                  {/* Mitigation - Editable for admin, or read-only when not editing for users */}
                  {(isAdmin || !isEditing) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Mitigation Measures</label>
                      {isEditing && isAdmin ? (
                        <textarea
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                          rows={3}
                          value={editData.mitigation || ''}
                          onChange={(e) => setEditData({ ...editData, mitigation: e.target.value })}
                          placeholder="Enter mitigation measures"
                        />
                      ) : (
                        <p className="text-gray-900 whitespace-pre-wrap">{contravention.mitigation || <span className="text-gray-400 italic">Not provided</span>}</p>
                      )}
                    </div>
                  )}

                  {/* Supporting Documents */}
                  {!isEditing && contravention.supportingDocs && contravention.supportingDocs.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 flex items-center gap-2">
                        <Paperclip className="w-4 h-4" />
                        Supporting Documents
                      </label>
                      <div className="mt-2 space-y-2">
                        {contravention.supportingDocs.map((url, index) => (
                          <a
                            key={index}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm"
                          >
                            <FileText className="w-4 h-4" />
                            <span>Document {index + 1}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
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

            {/* User Edit Form */}
            {isUserEditing && (
              <Card>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Contravention</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Update the details below. You can only edit contraventions that are pending approval or have been rejected.
                  </p>

                  <div className="space-y-4">
                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                        value={userEditData.description || ''}
                        onChange={(e) => setUserEditData({ ...userEditData, description: e.target.value })}
                        placeholder="Detailed description..."
                      />
                    </div>

                    {/* Justification */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Justification for Non-Compliance
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                        value={userEditData.justification || ''}
                        onChange={(e) => setUserEditData({ ...userEditData, justification: e.target.value })}
                        placeholder="Explain why proper procedures were not followed..."
                      />
                    </div>

                    {/* Mitigation */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mitigation Measures
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                        value={userEditData.mitigation || ''}
                        onChange={(e) => setUserEditData({ ...userEditData, mitigation: e.target.value })}
                        placeholder="Describe steps to prevent this from happening again..."
                      />
                    </div>

                    {/* Vendor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                      <Input
                        type="text"
                        value={userEditData.vendor || ''}
                        onChange={(e) => setUserEditData({ ...userEditData, vendor: e.target.value })}
                        placeholder="Vendor name"
                      />
                    </div>

                    {/* Value */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Value (SGD)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={userEditData.valueSgd || ''}
                        onChange={(e) => setUserEditData({ ...userEditData, valueSgd: e.target.value ? parseFloat(e.target.value) : undefined })}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Summary */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
                      <Input
                        type="text"
                        value={userEditData.summary || ''}
                        onChange={(e) => setUserEditData({ ...userEditData, summary: e.target.value })}
                        placeholder="Brief summary"
                      />
                    </div>

                    {/* Supporting Documents */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <Paperclip className="w-4 h-4" />
                        Supporting Documents
                      </label>

                      {/* Existing uploaded documents */}
                      {userEditData.supportingDocs && userEditData.supportingDocs.length > 0 && (
                        <div className="mb-3 space-y-2">
                          {userEditData.supportingDocs.map((url, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                              <Paperclip className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 truncate flex-1"
                              >
                                {url}
                                <ExternalLink className="w-3 h-3 inline ml-1" />
                              </a>
                              <button
                                type="button"
                                onClick={() => removeExistingDoc(index)}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* URL input */}
                      <div className="flex gap-2">
                        <Input
                          type="url"
                          value={newDocUrl}
                          onChange={(e) => setNewDocUrl(e.target.value)}
                          placeholder="https://drive.google.com/file/..."
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            if (newDocUrl.trim()) {
                              setUserEditData((prev) => ({
                                ...prev,
                                supportingDocs: [...(prev.supportingDocs || []), newDocUrl.trim()],
                              }));
                              setNewDocUrl('');
                            }
                          }}
                          disabled={!newDocUrl.trim()}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Paste a URL to a document and click Add.
                      </p>
                    </div>

                    {/* Approver Selection - only show for rejected contraventions */}
                    {contravention.status === 'REJECTED' && (
                      <div className="pt-4 border-t border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select Approver <span className="text-red-500">*</span>
                          <span className="text-xs font-normal text-gray-500 ml-1">(required to resubmit)</span>
                        </label>
                        <Select
                          options={[
                            { value: '', label: 'Select an approver...' },
                            ...(approvers?.map((approver) => ({
                              value: approver.email,
                              label: `${approver.name}${approver.position ? ` - ${approver.position}` : ''} (${approver.role})`,
                            })) || []),
                          ]}
                          value={userEditData.authorizerEmail || ''}
                          onChange={(e) => setUserEditData({ ...userEditData, authorizerEmail: e.target.value })}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          An approval request will be sent to the selected approver when you click "Resubmit for Approval".
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

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
                    {/* Standard employee dropdown */}
                    {!isDepartedMember && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Assigned To</label>
                        <select
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={editData.employeeId || ''}
                          onChange={(e) => setEditData({ ...editData, employeeId: e.target.value })}
                        >
                          {employeesData?.map((emp: EmployeeListItem) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} ({emp.department?.name || 'No Dept'}){!emp.isActive ? ' [Deactivated]' : ''}
                            </option>
                          ))}
                        </select>
                        {editData.employeeId !== contravention.employee.id && (
                          <p className="text-xs text-amber-600 mt-1">
                            Points will be transferred when saved.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Departed member form */}
                    {isDepartedMember && (
                      <div className="space-y-3 p-3 border border-amber-200 bg-amber-50 rounded-lg">
                        <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                          <UserX className="w-4 h-4" />
                          <span>Add Departed Member</span>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">Email</label>
                          <Input
                            type="email"
                            value={departedEmail}
                            onChange={(e) => setDepartedEmail(e.target.value)}
                            placeholder="former.employee@example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">Name</label>
                          <Input
                            type="text"
                            value={departedName}
                            onChange={(e) => setDepartedName(e.target.value)}
                            placeholder="Full name"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateDepartedMember}
                            isLoading={isCreatingDeparted}
                            disabled={isCreatingDeparted}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setIsDepartedMember(false);
                              setDepartedEmail('');
                              setDepartedName('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Toggle for departed member */}
                    {!isDepartedMember && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isDepartedMember}
                          onChange={(e) => {
                            setIsDepartedMember(e.target.checked);
                            if (e.target.checked) {
                              setEditData((prev) => ({ ...prev, employeeId: '' }));
                            }
                          }}
                          className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                        />
                        <span className="text-xs text-gray-700">Member has already left the organisation</span>
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Link to={`/employees/${contravention.employee.id}`} className="flex items-center gap-3 hover:bg-gray-50 -mx-2 px-2 py-1 rounded-lg transition-colors">
                      <div>
                        <p className="text-sm font-medium text-blue-600 hover:text-blue-800">{contravention.employee.name}</p>
                        <p className="text-xs text-gray-500">{contravention.employee.email}</p>
                      </div>
                    </Link>
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
                    {/* Personal contravention checkbox */}
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPersonalEdit}
                        onChange={(e) => {
                          setIsPersonalEdit(e.target.checked);
                          if (e.target.checked) {
                            // Find the Personal team and set it
                            const personalTeam = teamsData?.find((t: Team) => t.isPersonal);
                            if (personalTeam) {
                              setEditData({ ...editData, teamId: personalTeam.id });
                            }
                            setShowNewTeamInput(false);
                            setNewTeamName('');
                          } else {
                            // Clear team selection when unchecked
                            setEditData({ ...editData, teamId: '' });
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">This is a personal contravention (not associated with a team)</span>
                    </label>

                    {!isPersonalEdit && (
                      <>
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
                              {teamsData?.filter((team: Team) => !team.isPersonal).map((team: Team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
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
                      </>
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
                      {/* Points adjustment - shown for all contraventions, especially useful for "Others" type */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1 mt-3">
                          Points
                          {contravention.type.isOthers && (
                            <span className="text-amber-600 ml-1">(Custom type - adjust as needed)</span>
                          )}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={editData.points ?? ''}
                          onChange={(e) => setEditData({ ...editData, points: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                          placeholder="Points"
                        />
                        {editData.points !== contravention.points && (
                          <p className="text-xs text-amber-600 mt-1">
                            Changing points from {contravention.points} to {editData.points} will update the employee's total.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant={statusColors[contravention.status]}>
                        {statusLabels[contravention.status]}
                      </Badge>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="default">
                          {contravention.points} pts
                        </Badge>
                        <span className="text-xs text-gray-500">assigned</span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Workflow Status */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Workflow Status</h3>

                {/* Current Status Banner */}
                <div className={`p-3 rounded-lg mb-4 ${
                  contravention.status === 'COMPLETED' ? 'bg-green-50 border border-green-200' :
                  contravention.status === 'REJECTED' ? 'bg-red-50 border border-red-200' :
                  'bg-amber-50 border border-amber-200'
                }`}>
                  <div className="flex items-center gap-2">
                    {contravention.status === 'COMPLETED' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : contravention.status === 'REJECTED' ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <Clock className="w-5 h-5 text-amber-600" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${
                        contravention.status === 'COMPLETED' ? 'text-green-800' :
                        contravention.status === 'REJECTED' ? 'text-red-800' :
                        'text-amber-800'
                      }`}>
                        {statusLabels[contravention.status]}
                      </p>
                      {contravention.status === 'PENDING_APPROVAL' && (() => {
                        // Find the latest pending approval request
                        const pendingRequest = contravention.approvalRequests?.find(r => r.status === 'PENDING');
                        return pendingRequest ? (
                          <p className="text-xs text-amber-700">
                            Waiting for {pendingRequest.approver?.name || contravention.authorizerEmail}
                          </p>
                        ) : null;
                      })()}
                      {contravention.status === 'PENDING_UPLOAD' && (
                        <p className="text-xs text-amber-700">
                          Approved - awaiting PDF upload
                        </p>
                      )}
                      {contravention.status === 'PENDING_REVIEW' && (
                        <p className="text-xs text-amber-700">
                          Awaiting admin final review
                        </p>
                      )}
                      {contravention.status === 'REJECTED' && (() => {
                        // Find the latest rejected request (most recent by createdAt)
                        const latestRejection = contravention.approvalRequests?.find(r => r.status === 'REJECTED');
                        return latestRejection?.reviewNotes ? (
                          <p className="text-xs text-red-700 mt-1">
                            Reason: {latestRejection.reviewNotes}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  {/* Created */}
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

                  {/* All Approval Requests - sorted chronologically (oldest first) */}
                  {contravention.approvalRequests && contravention.approvalRequests.length > 0 && (
                    <>
                      {[...contravention.approvalRequests]
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                        .map((request, index) => (
                          <div key={request.id}>
                            {/* Show "Resubmitted" marker if this is not the first request */}
                            {index > 0 && (
                              <div className="flex items-start gap-3 mb-4">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                  <RotateCcw className="w-4 h-4 text-blue-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">Resubmitted</p>
                                  <p className="text-xs text-gray-500">{formatDateTime(request.createdAt)}</p>
                                  <p className="text-xs text-gray-500">Sent to {request.approver?.name}</p>
                                </div>
                              </div>
                            )}

                            {/* Approval/Rejection/Pending status */}
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                request.status === 'APPROVED' ? 'bg-green-100' :
                                request.status === 'REJECTED' ? 'bg-red-100' :
                                'bg-amber-100'
                              }`}>
                                {request.status === 'APPROVED' ? (
                                  <UserCheck className="w-4 h-4 text-green-600" />
                                ) : request.status === 'REJECTED' ? (
                                  <XCircle className="w-4 h-4 text-red-600" />
                                ) : (
                                  <Clock className="w-4 h-4 text-amber-600" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {request.status === 'APPROVED' ? 'Approved' :
                                   request.status === 'REJECTED' ? 'Rejected' :
                                   'Pending Approval'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {request.status === 'PENDING'
                                    ? `Assigned to ${request.approver?.name}`
                                    : request.reviewedAt
                                      ? formatDateTime(request.reviewedAt)
                                      : ''}
                                </p>
                                {request.reviewedBy && (
                                  <p className="text-xs text-gray-500">
                                    by {request.reviewedBy.name}
                                  </p>
                                )}
                                {request.reviewNotes && (
                                  <p className="text-xs text-gray-600 mt-1 italic bg-gray-50 p-2 rounded">
                                    "{request.reviewNotes}"
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </>
                  )}

                  {/* PDF Uploaded */}
                  {contravention.approvalPdfUrl && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <FileCheck className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">PDF Uploaded</p>
                        <p className="text-xs text-gray-500">Approval document attached</p>
                      </div>
                    </div>
                  )}

                  {/* Completed */}
                  {contravention.status === 'COMPLETED' && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <ClipboardCheck className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Completed</p>
                        <p className="text-xs text-gray-500">Admin verified and closed</p>
                        {contravention.resolvedDate && (
                          <p className="text-xs text-gray-500">{formatDateTime(contravention.resolvedDate)}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Last Updated */}
                  <div className="flex items-start gap-3 pt-2 border-t border-gray-100">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Last Updated</p>
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

                    {/* Approver Actions - Approve/Reject buttons */}
                    {isAssignedApprover && contravention.status === 'PENDING_APPROVAL' && (
                      <div className="pt-3 mt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-600 mb-3">
                          You have been assigned to review this contravention.
                        </p>
                        <div className="space-y-2">
                          <Button
                            variant="primary"
                            className="w-full justify-center"
                            onClick={handleApprove}
                            disabled={isApproving || isRejecting}
                          >
                            {isApproving ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Approving...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            variant="danger"
                            className="w-full justify-center"
                            onClick={() => setShowRejectModal(true)}
                            disabled={isApproving || isRejecting}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Promote to Permanent Type - standalone card for "Others" type with customTypeName */}
            {isAdmin && contravention.type.isOthers && contravention.customTypeName && (
              <Card className="mt-4">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Custom Type Management
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    This contravention uses a custom "Others" type: <span className="font-medium text-gray-700">{contravention.customTypeName}</span>
                  </p>
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={() => {
                      setPromoteData({
                        name: contravention.customTypeName || '',
                        category: 'PROCUREMENT',
                        defaultPoints: contravention.points,
                      });
                      setShowPromoteModal(true);
                    }}
                  >
                    <Star className="w-4 h-4 mr-2" />
                    Promote to Permanent Type
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Promote to Permanent Type Modal */}
      {showPromoteModal && contravention && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                Promote to Permanent Type
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                This will create a new permanent contravention type from "{contravention.customTypeName}" and update all
                existing contraventions using this custom name to use the new type instead.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={promoteData.name}
                    onChange={(e) => setPromoteData({ ...promoteData, name: e.target.value })}
                    placeholder="Contravention type name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <Select
                    options={[
                      { value: 'PROCUREMENT', label: 'Procurement' },
                      { value: 'FINANCE', label: 'Finance' },
                      { value: 'HR', label: 'HR' },
                      { value: 'COMPLIANCE', label: 'Compliance' },
                      { value: 'OPERATIONS', label: 'Operations' },
                      { value: 'OTHER', label: 'Other' },
                    ]}
                    value={promoteData.category}
                    onChange={(e) => setPromoteData({ ...promoteData, category: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Points</label>
                  <Input
                    type="number"
                    min="0"
                    value={promoteData.defaultPoints}
                    onChange={(e) => setPromoteData({ ...promoteData, defaultPoints: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowPromoteModal(false);
                    setError('');
                  }}
                  disabled={isPromoting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!promoteData.name.trim()) {
                      setError('Type name is required');
                      return;
                    }

                    setIsPromoting(true);
                    setError('');

                    try {
                      await contraventionsApi.promoteToType(
                        contravention.customTypeName!,
                        promoteData.name.trim(),
                        promoteData.category,
                        promoteData.defaultPoints
                      );

                      // Refresh data
                      queryClient.invalidateQueries({ queryKey: ['contravention', id] });
                      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
                      queryClient.invalidateQueries({ queryKey: ['types'] });

                      setShowPromoteModal(false);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : 'Failed to promote type');
                    } finally {
                      setIsPromoting(false);
                    }
                  }}
                  isLoading={isPromoting}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create Permanent Type
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                Reject Contravention
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Please provide a reason for rejecting this contravention. The submitter will be notified and can edit and resubmit.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 min-h-[100px]"
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  placeholder="Explain why this contravention is being rejected..."
                />
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectionNotes('');
                    setError('');
                  }}
                  disabled={isRejecting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleReject}
                  isLoading={isRejecting}
                  disabled={!rejectionNotes.trim()}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject Contravention
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
