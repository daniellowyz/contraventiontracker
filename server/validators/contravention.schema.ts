import { z } from 'zod';

export const createContraventionSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  typeId: z.string().min(1, 'Contravention type is required'),
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
  vendor: z.string().optional(),
  valueSgd: z.number().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  points: z.number().int().min(0).optional(),
  status: z.enum(['PENDING', 'ACKNOWLEDGED', 'DISPUTED', 'CONFIRMED', 'RESOLVED', 'ESCALATED']).optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
});

export const acknowledgeSchema = z.object({
  notes: z.string().optional(),
});

export const submitDisputeSchema = z.object({
  reason: z.string().min(10, 'Please provide a detailed reason for the dispute'),
  evidenceUrls: z.array(z.string().url()).optional(),
});

export const resolveDisputeSchema = z.object({
  decision: z.enum(['UPHELD', 'OVERTURNED']),
  panelDecision: z.string().min(1, 'Panel decision notes are required'),
});

export const contraventionFiltersSchema = z.object({
  status: z.enum(['PENDING', 'ACKNOWLEDGED', 'DISPUTED', 'CONFIRMED', 'RESOLVED', 'ESCALATED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  typeId: z.string().optional(),
  departmentId: z.string().optional(),
  employeeId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateContraventionInput = z.infer<typeof createContraventionSchema>;
export type UpdateContraventionInput = z.infer<typeof updateContraventionSchema>;
export type AcknowledgeInput = z.infer<typeof acknowledgeSchema>;
export type SubmitDisputeInput = z.infer<typeof submitDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type ContraventionFiltersInput = z.infer<typeof contraventionFiltersSchema>;
