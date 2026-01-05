// Escalation Matrix Configuration
export const ESCALATION_MATRIX = {
  LEVEL_1: { min: 1, max: 2, name: 'Verbal Reminder', actions: ['Supervisor notified', 'Verbal counseling session'] },
  LEVEL_2: { min: 3, max: 4, name: 'Written Warning', actions: ['Formal written warning issued', 'Copy to HR file', 'Supervisor and Department Head notified'] },
  LEVEL_3: { min: 5, max: 7, name: 'Mandatory Training', actions: ['Complete Procurement Compliance Course within 30 days', '90-day probation period', 'Weekly check-ins with Finance'] },
  LEVEL_4: { min: 8, max: 11, name: 'Performance Impact', actions: ['Performance Improvement Plan (PIP)', 'Approval limits reduced', 'Monthly review meetings with HR and Finance'] },
  LEVEL_5: { min: 12, max: Infinity, name: 'Severe Consequences', actions: ['Procurement privileges suspended', 'Full audit of past 12 months', 'Executive review', 'HR disciplinary process initiated'] },
};

// Severity Points Mapping
export const SEVERITY_POINTS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 5,
};

// Points Configuration
export const POINTS_CONFIG = {
  TRAINING_TRIGGER_THRESHOLD: 5, // Points at which training is triggered
  DECAY_RATE: 1, // Points removed per period
  DECAY_PERIOD_MONTHS: 6, // Months of clean record for decay
  TRAINING_CREDIT: 1, // Points reduction for completing training
};

// Contravention Type Defaults
export const CONTRAVENTION_TYPES = [
  { category: 'DC_PROCUREMENT', name: 'Missing AOR', defaultSeverity: 'HIGH', defaultPoints: 3 },
  { category: 'SVP', name: 'Different vendor on AOR versus purchase', defaultSeverity: 'HIGH', defaultPoints: 3 },
  { category: 'SVP', name: 'Late Personal Claims', defaultSeverity: 'LOW', defaultPoints: 1 },
  { category: 'DC_PROCUREMENT', name: 'Ownership Lapse', defaultSeverity: 'MEDIUM', defaultPoints: 2 },
  { category: 'DC_PROCUREMENT', name: 'Process-driven exception', defaultSeverity: 'LOW', defaultPoints: 0 },
  { category: 'DC_PROCUREMENT', name: 'Multiple Contraventions', defaultSeverity: 'CRITICAL', defaultPoints: 5 },
  { category: 'MANPOWER', name: 'Insufficient AOR value for manpower blanket', defaultSeverity: 'HIGH', defaultPoints: 3 },
  { category: 'DC_PROCUREMENT', name: 'No approval before purchase', defaultSeverity: 'CRITICAL', defaultPoints: 5 },
  { category: 'SIGNATORY', name: 'Signatory Contravention', defaultSeverity: 'CRITICAL', defaultPoints: 5 },
  { category: 'DC_PROCUREMENT', name: 'Vendor AOR differs from actual vendor', defaultSeverity: 'HIGH', defaultPoints: 3 },
  { category: 'MANPOWER', name: 'Manpower extension without PCPO approval', defaultSeverity: 'HIGH', defaultPoints: 3 },
  { category: 'DC_PROCUREMENT', name: 'Others', defaultSeverity: 'MEDIUM', defaultPoints: 2 },
];

// Acknowledgment Configuration
export const ACKNOWLEDGMENT_CONFIG = {
  DEADLINE_DAYS: 5, // Days to acknowledge
  AUTO_CONFIRM_DAYS: 10, // Days after which it's auto-confirmed
  REMINDER_DAYS: [3, 5], // Days to send reminders
};

// Dispute Configuration
export const DISPUTE_CONFIG = {
  SUBMISSION_DEADLINE_DAYS: 5, // Days to submit dispute
  REVIEW_DEADLINE_DAYS: 10, // Days for panel to decide
};
