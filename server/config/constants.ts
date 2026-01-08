// Escalation Matrix Configuration
// Level 1: 1-2 points - Finance verbal advisory
// Level 2: 3+ points - Mandatory training required
// Level 3: Post-training offense OR single offense >3 points - Performance impact
export const ESCALATION_MATRIX = {
  LEVEL_1: { min: 1, max: 2, name: 'Verbal Advisory', actions: ['Finance verbal advisory on contravention and prevention'] },
  LEVEL_2: { min: 3, max: Infinity, name: 'Mandatory Training', actions: ['Complete Procurement Compliance Training within 30 days'] },
  // Level 3 is triggered when: employee commits offense after completing training, OR single offense with >3 points
  LEVEL_3: { min: 0, max: Infinity, name: 'Performance Impact', actions: ['Affects performance review', 'Manager to review employee contravention record at end of performance cycle'] },
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
  TRAINING_TRIGGER_THRESHOLD: 3, // Points at which training is triggered (Level 2)
  TRAINING_CREDIT: 1, // Points reduction for completing training
  // Fiscal Year Reset Configuration (Apr-Mar cycle)
  FISCAL_YEAR_START_MONTH: 4, // April (1-indexed: 1=Jan, 4=Apr)
  RESET_ALL_POINTS: true, // Reset ALL points at fiscal year boundary
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
