// Escalation Matrix Configuration (Stages of Correction)
// Stage 1: 5 points - Notify reporting manager
// Stage 2: 10 points - Notify Department Head and Hong + Mandatory Training
// Stage 3: >15 points - Notify Department Head and Hong + Mandatory Training + Procurement rights paused + Session with Finance
export const ESCALATION_MATRIX = {
  LEVEL_1: {
    min: 5,
    max: 9,
    name: 'Stage 1',
    actions: ['Notify reporting manager']
  },
  LEVEL_2: {
    min: 10,
    max: 15,
    name: 'Stage 2',
    actions: ['Notify Department Head and Hong', 'Complete Mandatory Training']
  },
  LEVEL_3: {
    min: 16,
    max: Infinity,
    name: 'Stage 3',
    actions: ['Notify Department Head and Hong', 'Complete Mandatory Training', 'Procurement rights paused', 'Session with Finance']
  },
};

// Points Configuration
export const POINTS_CONFIG = {
  TRAINING_TRIGGER_THRESHOLD: 10, // Points at which training is triggered (Stage 2)
  TRAINING_CREDIT: 1, // Points reduction for completing training
  // Fiscal Year Reset Configuration (Apr-Mar cycle)
  FISCAL_YEAR_START_MONTH: 4, // April (1-indexed: 1=Jan, 4=Apr)
  RESET_ALL_POINTS: true, // Reset ALL points at fiscal year boundary
};

// Contravention Type Defaults
export const CONTRAVENTION_TYPES = [
  { category: 'DC_PROCUREMENT', name: 'Missing AOR', defaultPoints: 3 },
  { category: 'SVP', name: 'Different vendor on AOR versus purchase', defaultPoints: 3 },
  { category: 'SVP', name: 'Late Personal Claims', defaultPoints: 1 },
  { category: 'DC_PROCUREMENT', name: 'Ownership Lapse', defaultPoints: 2 },
  { category: 'DC_PROCUREMENT', name: 'Process-driven exception', defaultPoints: 0 },
  { category: 'DC_PROCUREMENT', name: 'Multiple Contraventions', defaultPoints: 5 },
  { category: 'MANPOWER', name: 'Insufficient AOR value for manpower blanket', defaultPoints: 3 },
  { category: 'DC_PROCUREMENT', name: 'No approval before purchase', defaultPoints: 5 },
  { category: 'SIGNATORY', name: 'Signatory Contravention', defaultPoints: 5 },
  { category: 'DC_PROCUREMENT', name: 'Vendor AOR differs from actual vendor', defaultPoints: 3 },
  { category: 'MANPOWER', name: 'Manpower extension without PCPO approval', defaultPoints: 3 },
  { category: 'DC_PROCUREMENT', name: 'Others', defaultPoints: 2 },
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
