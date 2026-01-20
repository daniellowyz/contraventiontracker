import { z } from 'zod';

export const createContraventionSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  typeId: z.string().min(1, 'Contravention type is required'),
  teamId: z.string().min(1, 'Team is required'),  // Required team for tracking
  customTypeName: z.string().optional(),  // For "Others" type - custom contravention name
  vendor: z.string().optional(),
  valueSgd: z.number().optional(),
  description: z.string().min(1, 'Description is required'),
  justification: z.string().min(1, 'Justification is required'),
  mitigation: z.string().min(1, 'Mitigation measures are required'),
  summary: z.string().optional(),
  incidentDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format',
  }),
  evidenceUrls: z.array(z.string().url()).optional(),
  authorizerEmail: z.string().email('Invalid email format').optional(),
  approvalPdfUrl: z.string().url('Invalid URL format').optional(),
});

export const updateContraventionSchema = z.object({
  employeeId: z.string().optional(), // Admin can reassign to different employee
  teamId: z.string().nullable().optional(), // Admin can reassign to different team (null to remove)
  customTypeName: z.string().nullable().optional(),  // For "Others" type - custom contravention name
  vendor: z.string().optional(),
  valueSgd: z.number().optional(),
  description: z.string().optional(),
  justification: z.string().optional(),
  mitigation: z.string().optional(),
  summary: z.string().optional(),
  points: z.number().int().min(0).optional(),
  status: z.enum(['PENDING_APPROVAL', 'PENDING_UPLOAD', 'PENDING_REVIEW', 'COMPLETED', 'REJECTED']).optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
  approvalPdfUrl: z.string().url('Invalid URL format').optional(),
  authorizerEmail: z.string().email('Invalid email format').optional(),
});

// Schema for users editing their own contraventions (more restrictive)
export const userUpdateContraventionSchema = z.object({
  vendor: z.string().nullable().optional(),
  valueSgd: z.number().nullable().optional(),
  description: z.string().optional(),
  justification: z.string().optional(),
  mitigation: z.string().optional(),
  summary: z.string().nullable().optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
  authorizerEmail: z.string().email('Invalid email format').nullable().optional(),
});

// Schema for resubmitting a rejected contravention
export const resubmitContraventionSchema = z.object({
  vendor: z.string().nullable().optional(),
  valueSgd: z.number().nullable().optional(),
  description: z.string().min(1, 'Description is required'),
  justification: z.string().min(1, 'Justification is required'),
  mitigation: z.string().min(1, 'Mitigation measures are required'),
  summary: z.string().nullable().optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
  authorizerEmail: z.string().email('Invalid email format').optional(),
});

export const uploadApprovalSchema = z.object({
  approvalPdfUrl: z.string().url('Invalid URL format'),
});

export const markCompleteSchema = z.object({
  notes: z.string().optional(),
});

export const contraventionFiltersSchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'PENDING_UPLOAD', 'PENDING_REVIEW', 'COMPLETED', 'REJECTED']).optional(),
  typeId: z.string().optional(),
  departmentId: z.string().optional(),
  employeeId: z.string().optional(),
  teamId: z.string().optional(),  // Filter by team
  loggedById: z.string().optional(),  // Filter by who logged the contravention
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateContraventionInput = z.infer<typeof createContraventionSchema>;
export type UpdateContraventionInput = z.infer<typeof updateContraventionSchema>;
export type UserUpdateContraventionInput = z.infer<typeof userUpdateContraventionSchema>;
export type ResubmitContraventionInput = z.infer<typeof resubmitContraventionSchema>;
export type UploadApprovalInput = z.infer<typeof uploadApprovalSchema>;
export type MarkCompleteInput = z.infer<typeof markCompleteSchema>;
export type ContraventionFiltersInput = z.infer<typeof contraventionFiltersSchema>;
