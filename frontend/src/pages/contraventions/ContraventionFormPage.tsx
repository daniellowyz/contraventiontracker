import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contraventionsApi, CreateContraventionInput } from '@/api/contraventions.api';
import { employeesApi } from '@/api/employees.api';
import { teamsApi, Team } from '@/api/teams.api';
import { approversApi } from '@/api/approvers.api';
import { useAuthStore } from '@/stores/authStore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Save, Upload, Loader2, Plus, UserX, Paperclip, Trash2, ExternalLink, Link } from 'lucide-react';
import { Severity } from '@/types';
import { uploadApprovalPdf, supabase } from '@/lib/supabase';

const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const APPROVAL_STATUS_OPTIONS = [
  { value: '', label: 'Select approval status...' },
  { value: 'has_approval', label: 'I already have approval' },
  { value: 'needs_approval', label: 'I need to request approval' },
];

export function ContraventionFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuthStore();

  const [formData, setFormData] = useState<{
    employeeId: string;
    typeId: string;
    teamId: string;
    vendor: string;
    valueSgd: string;
    description: string;
    justification: string;
    mitigation: string;
    summary: string;
    incidentDate: string;
    severity: Severity;
    approvalStatus: string;
    approverEmail: string;
    supportingDocs: string[];
  }>({
    employeeId: '',
    typeId: '',
    teamId: '',
    vendor: '',
    valueSgd: '',
    description: '',
    justification: '',
    mitigation: '',
    summary: '',
    incidentDate: new Date().toISOString().split('T')[0],
    severity: 'MEDIUM',
    approvalStatus: '',
    approverEmail: '',
    supportingDocs: [],
  });

  const [newDocUrl, setNewDocUrl] = useState('');

  const [approvalFile, setApprovalFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [showNewTeamInput, setShowNewTeamInput] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [isPersonal, setIsPersonal] = useState(false);

  // Admin-only: departed member handling
  const [isDepartedMember, setIsDepartedMember] = useState(false);
  const [departedEmail, setDepartedEmail] = useState('');
  const [departedName, setDepartedName] = useState('');
  const [isCreatingDeparted, setIsCreatingDeparted] = useState(false);

  // Fetch employees
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: employeesApi.getAll,
  });

  // Fetch contravention types
  const { data: types, isLoading: typesLoading } = useQuery({
    queryKey: ['contraventionTypes'],
    queryFn: contraventionsApi.getTypes,
  });

  // Fetch teams
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: teamsApi.getAll,
  });

  // Fetch approvers
  const { data: approvers, isLoading: approversLoading } = useQuery({
    queryKey: ['approvers'],
    queryFn: approversApi.getAll,
  });

  // For non-admins: auto-set employeeId to current user
  useEffect(() => {
    if (!isAdmin && user && employees) {
      // Find current user in employees list
      const currentEmployee = employees.find((emp) => emp.email === user.email);
      if (currentEmployee) {
        setFormData((prev) => ({ ...prev, employeeId: currentEmployee.id }));
      }
    }
  }, [isAdmin, user, employees]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateContraventionInput) => contraventionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      navigate('/contraventions');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to create contravention');
    },
  });

  // Create team mutation (for "Other: Specify" option)
  const createTeamMutation = useMutation({
    mutationFn: (name: string) => teamsApi.create({ name, isPersonal: false }),
    onSuccess: (newTeam: Team) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setFormData((prev) => ({ ...prev, teamId: newTeam.id }));
      setShowNewTeamInput(false);
      setNewTeamName('');
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to create team');
    },
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSupportingDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Add selected files to pending list
      setPendingSupportingDocs((prev) => [...prev, ...Array.from(files)]);
      // Reset input so the same file can be selected again
      e.target.value = '';
    }
  };

  const removePendingDoc = (index: number) => {
    setPendingSupportingDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const removeUploadedDoc = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      supportingDocs: prev.supportingDocs.filter((_, i) => i !== index),
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Please upload a PDF file');
        return;
      }
      setApprovalFile(file);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.employeeId) {
      setError('Please select an employee');
      return;
    }
    if (!formData.typeId) {
      setError('Please select a contravention type');
      return;
    }
    if (!formData.description.trim()) {
      setError('Please enter a description');
      return;
    }
    if (!formData.justification.trim()) {
      setError('Please enter a justification for non-compliance');
      return;
    }
    if (!formData.mitigation.trim()) {
      setError('Please enter mitigation measures');
      return;
    }
    // Get the personal team ID if isPersonal is checked
    const personalTeam = teams?.find((t) => t.isPersonal);
    const effectiveTeamId = isPersonal ? personalTeam?.id : formData.teamId;

    if (!effectiveTeamId) {
      setError(isPersonal ? 'Personal team not found. Please contact admin.' : 'Please select a team');
      return;
    }

    // Validate approval status
    if (!formData.approvalStatus) {
      setError('Please select an approval status');
      return;
    }
    if (formData.approvalStatus === 'has_approval' && !approvalFile) {
      setError('Please upload the approval PDF');
      return;
    }
    if (formData.approvalStatus === 'needs_approval' && !formData.approverEmail) {
      setError('Please select an approver');
      return;
    }

    const submitData: CreateContraventionInput = {
      employeeId: formData.employeeId,
      typeId: formData.typeId,
      teamId: effectiveTeamId,
      description: formData.description.trim(),
      justification: formData.justification.trim(),
      mitigation: formData.mitigation.trim(),
      incidentDate: formData.incidentDate,
    };

    if (formData.vendor.trim()) {
      submitData.vendor = formData.vendor.trim();
    }
    if (formData.valueSgd) {
      submitData.valueSgd = parseFloat(formData.valueSgd);
    }
    if (formData.summary.trim()) {
      submitData.summary = formData.summary.trim();
    }
    // Upload pending supporting documents first
    const allSupportingDocs = [...formData.supportingDocs];
    if (pendingSupportingDocs.length > 0 && supabase) {
      try {
        setIsUploadingDocs(true);
        const tempRefNo = `CONTRA-${Date.now()}`;
        for (const file of pendingSupportingDocs) {
          const url = await uploadSupportingDoc(file, tempRefNo);
          if (url) {
            allSupportingDocs.push(url);
          }
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload supporting documents');
        setIsUploadingDocs(false);
        return;
      } finally {
        setIsUploadingDocs(false);
      }
    }

    // Add supporting documents if any
    if (allSupportingDocs.length > 0) {
      submitData.supportingDocs = allSupportingDocs;
    }
    // Only send approver email if requesting approval
    if (formData.approvalStatus === 'needs_approval' && formData.approverEmail) {
      submitData.authorizerEmail = formData.approverEmail;
    }

    // Upload PDF if user has approval
    if (formData.approvalStatus === 'has_approval' && approvalFile && supabase) {
      try {
        setIsUploading(true);
        const tempRefNo = `CONTRA-${Date.now()}`;
        const pdfUrl = await uploadApprovalPdf(approvalFile, tempRefNo);
        if (pdfUrl) {
          submitData.approvalPdfUrl = pdfUrl;
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload PDF');
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    createMutation.mutate(submitData);
  };

  // For non-admins: only show their own name
  // For admins: show all employees with inactive status indicator
  const employeeOptions = isAdmin
    ? [
        { value: '', label: 'Select an employee...' },
        ...(employees?.map((emp) => ({
          value: emp.id,
          label: `${emp.name}${!emp.isActive ? ' [Deactivated]' : ''}`,
        })) || []),
      ]
    : employees
      ? employees
          .filter((emp) => emp.email === user?.email)
          .map((emp) => ({
            value: emp.id,
            label: emp.name,
          }))
      : [];

  // Handler for creating departed member
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
      setFormData((prev) => ({ ...prev, employeeId: result.id }));
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

  const typeOptions = [
    { value: '', label: 'Select a type...' },
    ...(types?.map((type) => ({
      value: type.id,
      label: `${type.name} (${type.category}) - ${type.defaultPoints} pts`,
    })) || []),
  ];

  const teamOptions = [
    { value: '', label: 'Select a team...' },
    ...(teams?.map((team) => ({
      value: team.id,
      label: team.isPersonal ? `${team.name} (for personal contraventions)` : team.name,
    })) || []),
    { value: '__OTHER__', label: '+ Other: Specify new team...' },
  ];

  const handleTeamChange = (value: string) => {
    if (value === '__OTHER__') {
      setShowNewTeamInput(true);
      setFormData((prev) => ({ ...prev, teamId: '' }));
    } else {
      setShowNewTeamInput(false);
      setNewTeamName('');
      setFormData((prev) => ({ ...prev, teamId: value }));
    }
    setError('');
  };

  const handleCreateNewTeam = () => {
    if (!newTeamName.trim()) {
      setError('Please enter a team name');
      return;
    }
    createTeamMutation.mutate(newTeamName.trim());
  };

  return (
    <div>
      <Header
        title="New Contravention"
        subtitle="Record a new procurement contravention"
        actions={
          <Button variant="secondary" onClick={() => navigate('/contraventions')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to List
          </Button>
        }
      />

      <div className="p-8 max-w-3xl">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Employee Selection */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee <span className="text-red-500">*</span>
                </label>

                {/* Non-admin: Show locked field with their name */}
                {!isAdmin && (
                  <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                    {employeesLoading ? (
                      <span className="text-gray-500">Loading...</span>
                    ) : employeeOptions.length > 0 ? (
                      employeeOptions[0].label
                    ) : (
                      <span className="text-gray-500">Your account</span>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      You can only create contraventions for yourself.
                    </p>
                  </div>
                )}

                {/* Admin: Show dropdown with all employees */}
                {isAdmin && !isDepartedMember && (
                  <>
                    <Select
                      options={employeeOptions}
                      value={formData.employeeId}
                      onChange={(e) => handleChange('employeeId', e.target.value)}
                      disabled={employeesLoading}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      As an admin, you can create contraventions for any employee.
                    </p>
                  </>
                )}

                {/* Admin: Departed member form */}
                {isAdmin && isDepartedMember && (
                  <div className="space-y-3 p-4 border border-amber-200 bg-amber-50 rounded-lg">
                    <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                      <UserX className="w-4 h-4" />
                      <span>Add Departed Member</span>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Email</label>
                      <Input
                        type="email"
                        value={departedEmail}
                        onChange={(e) => setDepartedEmail(e.target.value)}
                        placeholder="former.employee@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Name</label>
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
                        onClick={handleCreateDepartedMember}
                        isLoading={isCreatingDeparted}
                        disabled={isCreatingDeparted}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Member
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
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

                {/* Admin: Toggle for departed member */}
                {isAdmin && !isDepartedMember && (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDepartedMember}
                      onChange={(e) => {
                        setIsDepartedMember(e.target.checked);
                        if (e.target.checked) {
                          setFormData((prev) => ({ ...prev, employeeId: '' }));
                        }
                      }}
                      className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <span className="text-sm text-gray-700">Member has already left the organisation</span>
                  </label>
                )}
              </div>

              {/* Contravention Type */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contravention Type <span className="text-red-500">*</span>
                </label>
                <Select
                  options={typeOptions}
                  value={formData.typeId}
                  onChange={(e) => handleChange('typeId', e.target.value)}
                  disabled={typesLoading}
                />
              </div>

              {/* Team (required) */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team <span className="text-red-500">*</span>
                </label>

                {/* Personal contravention checkbox */}
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPersonal}
                    onChange={(e) => {
                      setIsPersonal(e.target.checked);
                      if (e.target.checked) {
                        setShowNewTeamInput(false);
                        setNewTeamName('');
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">This is a personal contravention (not associated with a team)</span>
                </label>

                {!isPersonal && (
                  <>
                    {!showNewTeamInput ? (
                      <Select
                        options={teamOptions}
                        value={formData.teamId}
                        onChange={(e) => handleTeamChange(e.target.value)}
                        disabled={teamsLoading}
                      />
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            placeholder="Enter new team name"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            onClick={handleCreateNewTeam}
                            isLoading={createTeamMutation.isPending}
                            disabled={createTeamMutation.isPending}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Create
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewTeamInput(false);
                            setNewTeamName('');
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          ← Back to team list
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Tag this contravention to a team for tracking purposes. Select "Other: Specify" to create a new team.
                    </p>
                  </>
                )}
              </div>

              {/* Incident Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Incident Date <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={formData.incidentDate}
                  onChange={(e) => handleChange('incidentDate', e.target.value)}
                  required
                />
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <Select
                  options={SEVERITY_OPTIONS}
                  value={formData.severity}
                  onChange={(e) => handleChange('severity', e.target.value)}
                />
              </div>

              {/* Vendor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor (if applicable)
                </label>
                <Input
                  type="text"
                  value={formData.vendor}
                  onChange={(e) => handleChange('vendor', e.target.value)}
                  placeholder="Enter vendor name"
                />
              </div>

              {/* Value SGD */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value (SGD)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.valueSgd}
                  onChange={(e) => handleChange('valueSgd', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Summary */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Summary
                </label>
                <Input
                  type="text"
                  value={formData.summary}
                  onChange={(e) => handleChange('summary', e.target.value)}
                  placeholder="Brief summary of the contravention"
                />
              </div>

              {/* Approval Status */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Approval Status <span className="text-red-500">*</span>
                </label>
                <Select
                  options={APPROVAL_STATUS_OPTIONS}
                  value={formData.approvalStatus}
                  onChange={(e) => {
                    handleChange('approvalStatus', e.target.value);
                    // Reset related fields when changing status
                    setApprovalFile(null);
                    handleChange('approverEmail', '');
                  }}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Select whether you already have approval or need to request it.
                </p>
              </div>

              {/* Conditional: Upload Approval PDF */}
              {formData.approvalStatus === 'has_approval' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload Approval PDF <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
                    <div className="space-y-1 text-center">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="approval-file"
                          className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                        >
                          <span>Upload a file</span>
                          <input
                            id="approval-file"
                            name="approval-file"
                            type="file"
                            accept=".pdf"
                            className="sr-only"
                            onChange={handleFileChange}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">PDF up to 10MB</p>
                      {approvalFile && (
                        <p className="text-sm text-green-600 font-medium">
                          Selected: {approvalFile.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Conditional: Select Approver */}
              {formData.approvalStatus === 'needs_approval' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Approver <span className="text-red-500">*</span>
                  </label>
                  <Select
                    options={[
                      { value: '', label: 'Select an approver...' },
                      ...(approvers?.map((approver) => ({
                        value: approver.email,
                        label: `${approver.name}${approver.position ? ` - ${approver.position}` : ''} (${approver.role})`,
                      })) || []),
                    ]}
                    value={formData.approverEmail}
                    onChange={(e) => handleChange('approverEmail', e.target.value)}
                    disabled={approversLoading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    An email will be sent to the selected approver requesting approval for this contravention.
                  </p>
                </div>
              )}

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="e.g., A purchase was made under OGP for an event held on 22-23 September 2025 without a prior Approval of Requirement (AOR). Approval is sought for an amount of $2,320.61."
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Describe what happened and the amount involved.
                </p>
              </div>

              {/* Justification */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Justification for Non-Compliance <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                  value={formData.justification}
                  onChange={(e) => handleChange('justification', e.target.value)}
                  placeholder="e.g., The AOR was not sought prior to purchase as I was not aware that an AOR was required for invoices billed through Vendors@Gov."
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Explain why proper procedures were not followed.
                </p>
              </div>

              {/* Mitigation Measures */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mitigation Measures <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                  value={formData.mitigation}
                  onChange={(e) => handleChange('mitigation', e.target.value)}
                  placeholder="e.g., To prevent this from recurring, I will ensure that an AOR is obtained for all future purchases before any commitment is made to vendors."
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Describe steps to prevent this from happening again.
                </p>
              </div>

              {/* Supporting Documents */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Supporting Documents (Optional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Upload supporting documents (e.g., invoices, emails, quotations). Accepted formats: PDF, Word, Excel, images.
                </p>

                {/* Already uploaded documents */}
                {formData.supportingDocs.length > 0 && (
                  <div className="mb-3 space-y-2">
                    <p className="text-xs font-medium text-gray-600">Uploaded:</p>
                    {formData.supportingDocs.map((url, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                        <Paperclip className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 truncate flex-1"
                        >
                          Document {index + 1}
                          <ExternalLink className="w-3 h-3 inline ml-1" />
                        </a>
                        <button
                          type="button"
                          onClick={() => removeUploadedDoc(index)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending files to upload */}
                {pendingSupportingDocs.length > 0 && (
                  <div className="mb-3 space-y-2">
                    <p className="text-xs font-medium text-gray-600">Pending upload:</p>
                    {pendingSupportingDocs.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
                        <Paperclip className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-sm text-gray-700 truncate flex-1">
                          {file.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => removePendingDoc(index)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* File input - input must be INSIDE the label for proper click handling */}
                <label
                  className={`inline-flex items-center justify-center font-medium rounded-lg transition-colors px-4 py-2 text-sm cursor-pointer ${
                    isUploadingDocs
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {isUploadingDocs ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Select Files
                    </>
                  )}
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
                    onChange={handleSupportingDocSelect}
                    className="sr-only"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Files will be uploaded when you create the contravention.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/contraventions')}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={createMutation.isPending || isUploading || isUploadingDocs} disabled={isUploading || isUploadingDocs}>
                {isUploadingDocs ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading Documents...
                  </>
                ) : isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading PDF...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Create Contravention
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
