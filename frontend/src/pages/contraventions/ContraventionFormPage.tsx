import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contraventionsApi, CreateContraventionInput } from '@/api/contraventions.api';
import { employeesApi } from '@/api/employees.api';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Save, Upload, Loader2 } from 'lucide-react';
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

const APPROVER_OPTIONS = [
  { value: '', label: 'Select an approver...' },
  { value: 'Aaron_ma@ogp.gov.sg', label: 'GT Procurement Director - Aaron Ma' },
  { value: 'Hygin@ogp.gov.sg', label: 'OGP Deputy Director - Hygin' },
  { value: 'daniellow@open.gov.sg', label: 'For Sandbox - Daniel Low' },
];

export function ContraventionFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<{
    employeeId: string;
    typeId: string;
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
  }>({
    employeeId: '',
    typeId: '',
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
  });

  const [approvalFile, setApprovalFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

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

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
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

  const employeeOptions = [
    { value: '', label: 'Select an employee...' },
    ...(employees?.map((emp) => ({
      value: emp.id,
      label: `${emp.name} (${emp.employeeId}) - ${emp.department?.name || 'No Department'}`,
    })) || []),
  ];

  const typeOptions = [
    { value: '', label: 'Select a type...' },
    ...(types?.map((type) => ({
      value: type.id,
      label: `${type.name} (${type.category}) - ${type.defaultPoints} pts`,
    })) || []),
  ];

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
                <Select
                  options={employeeOptions}
                  value={formData.employeeId}
                  onChange={(e) => handleChange('employeeId', e.target.value)}
                  disabled={employeesLoading}
                />
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
                    options={APPROVER_OPTIONS}
                    value={formData.approverEmail}
                    onChange={(e) => handleChange('approverEmail', e.target.value)}
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
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/contraventions')}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={createMutation.isPending || isUploading} disabled={isUploading}>
                {isUploading ? (
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
