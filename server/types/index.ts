import { Request } from 'express';
import { Role, Severity, ContraventionStatus, DisputeStatus, EscalationLevel, TrainingStatus } from '@prisma/client';

// Re-export Prisma enums
export { Role, Severity, ContraventionStatus, DisputeStatus, EscalationLevel, TrainingStatus };

// User in JWT payload
export interface JwtPayload {
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  role: Role;
}

// Extended Express Request with user
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Dashboard Stats
export interface DashboardStats {
  summary: {
    totalContraventions: number;
    pendingAcknowledgment: number;
    thisMonth: number;
    criticalIssues: number;
    totalValueAffected: number;
  };
  byStatus: Record<ContraventionStatus, number>;
  bySeverity: Record<Severity, number>;
  employeesAtRisk: {
    id: string;
    name: string;
    points: number;
    level: EscalationLevel | null;
  }[];
  monthlyTrend: {
    month: string;
    count: number;
  }[];
}

// Points History Entry
export interface PointsHistoryEntry {
  date: string;
  points: number;
  contraventionId?: string;
  reason: string;
  type: 'add' | 'decay' | 'credit';
}

// Employee Points Summary
export interface EmployeePointsSummary {
  employeeId: string;
  employeeName: string;
  totalPoints: number;
  currentLevel: EscalationLevel | null;
  levelName: string | null;
  nextLevelThreshold: number | null;
  pointsToNextLevel: number | null;
  contraventionCount: number;
  pointsHistory: PointsHistoryEntry[];
  pendingTraining: {
    courseName: string;
    dueDate: string;
    status: TrainingStatus;
  }[];
}

// Create Contravention Input
export interface CreateContraventionInput {
  employeeId: string;
  typeId: string;
  vendor?: string;
  valueSgd?: number;
  description: string;
  summary?: string;
  incidentDate: string;
  evidenceUrls?: string[];
}

// Contravention Filters
export interface ContraventionFilters {
  status?: ContraventionStatus;
  severity?: Severity;
  typeId?: string;
  departmentId?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}
