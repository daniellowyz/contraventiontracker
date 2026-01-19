// Enums
export type Role = 'ADMIN' | 'APPROVER' | 'USER';
export type ContraventionStatus = 'PENDING_APPROVAL' | 'PENDING_UPLOAD' | 'PENDING_REVIEW' | 'COMPLETED' | 'REJECTED';
export type EscalationLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
export type TrainingStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'WAIVED';
export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// User
export interface User {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  position?: string;
  role: Role;
  department?: Department;
  points?: number;
  currentLevel?: EscalationLevel;
  isProfileComplete?: boolean;
  requestedApprover?: boolean;
  approverRequestStatus?: ApprovalRequestStatus;
}

// Department
export interface Department {
  id: string;
  name: string;
}

// Contravention Type
export interface ContraventionType {
  id: string;
  name: string;
  category: string;
  description?: string;
  defaultPoints: number;
  isActive: boolean;
  isOthers: boolean;  // True for "Others" type - requires custom description
}

// Contravention
export interface Contravention {
  id: string;
  referenceNo: string;
  employee: {
    id: string;
    name: string;
    email: string;
    department?: { name: string };
  };
  type: ContraventionType;
  customTypeName?: string;  // For "Others" type - custom contravention name
  team?: {
    id: string;
    name: string;
    isPersonal: boolean;
  };
  vendor?: string;
  valueSgd?: number;
  description: string;
  justification?: string;
  mitigation?: string;
  summary?: string;
  points: number;
  status: ContraventionStatus;
  incidentDate: string;
  resolvedDate?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: { id: string; name: string };
  loggedBy: { id: string; name: string };
  evidenceUrls?: string[];
  supportingDocs?: string[];
  approvalPdfUrl?: string;
  authorizerEmail?: string;
  approvalRequests?: ContraventionApproval[];
  createdAt: string;
  updatedAt: string;
}

// Escalation
export interface Escalation {
  id: string;
  employee: {
    id: string;
    name: string;
    department?: { name: string };
  };
  level: EscalationLevel;
  triggeredAt: string;
  triggerPoints: number;
  actionsRequired: string[];
  actionsCompleted: string[];
  dueDate: string;
  completedAt?: string;
  notes?: string;
}

// Training Record
export interface TrainingRecord {
  id: string;
  course: Course;
  assignedDate: string;
  dueDate: string;
  completedDate?: string;
  status: TrainingStatus;
  pointsCredited: boolean;
}

// Course
export interface Course {
  id: string;
  name: string;
  description?: string;
  durationHours: number;
  provider: string;
  validityMonths: number;
  triggerPoints: number;
  pointsCredit: number;
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
    id: string;
    courseName: string;
    dueDate: string;
    status: TrainingStatus;
  }[];
}

// Dashboard Stats
export interface DashboardStats {
  summary: {
    totalContraventions: number;
    pendingAcknowledgment: number;
    thisMonth: number;
    highPointsIssues: number;
    totalValueAffected: number;
  };
  byStatus: Record<ContraventionStatus, number>;
  byPoints: Record<string, number>;
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

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Contravention Approval Request
export interface ContraventionApproval {
  id: string;
  contraventionId: string;
  contravention?: Contravention;
  approverId: string;
  approver?: { id: string; name: string; email: string };
  status: ApprovalRequestStatus;
  reviewedById?: string;
  reviewedBy?: { id: string; name: string };
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}
