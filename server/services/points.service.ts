import prisma from '../config/database';
import { ESCALATION_MATRIX, POINTS_CONFIG } from '../config/constants';
import { EscalationLevel, PointsHistoryEntry } from '../types';
import { addDays } from '../utils/dateUtils';

export class PointsService {
  /**
   * Calculate points for a contravention based on type
   * Points are determined solely by the contravention type's defaultPoints
   */
  calculatePoints(defaultPoints: number): number {
    return defaultPoints;
  }

  /**
   * Determine escalation level based on total points
   * Stage 1: 5 pts - Notify reporting manager
   * Stage 2: 10 pts - Notify Management + Session with Finance
   * Stage 3: >15 pts - Performance Impact
   */
  getEscalationLevel(totalPoints: number): EscalationLevel | null {
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_3.min) return 'LEVEL_3';
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_2.min) return 'LEVEL_2';
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_1.min) return 'LEVEL_1';
    return null;
  }

  /**
   * Check if employee has completed training (for Level 3 trigger)
   */
  async hasCompletedTraining(employeeId: string): Promise<boolean> {
    const completedTraining = await prisma.trainingRecord.findFirst({
      where: {
        employeeId,
        status: 'COMPLETED',
      },
    });
    return !!completedTraining;
  }

  /**
   * Check if performance impact (Level 3) should be triggered
   * Conditions: Post-training offense OR single offense >3 points
   */
  async checkForPerformanceImpact(employeeId: string, singleOffensePoints: number): Promise<boolean> {
    // Condition 1: Single offense with more than 3 points
    if (singleOffensePoints > 3) {
      return true;
    }

    // Condition 2: Any offense after completing training
    const hasCompleted = await this.hasCompletedTraining(employeeId);
    if (hasCompleted) {
      return true;
    }

    return false;
  }

  /**
   * Get escalation level details
   * Only supports LEVEL_1, LEVEL_2, LEVEL_3
   */
  getEscalationDetails(level: EscalationLevel) {
    // Map old levels to new levels if needed
    const supportedLevel = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3'].includes(level) ? level : 'LEVEL_3';
    return ESCALATION_MATRIX[supportedLevel as 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3'];
  }

  /**
   * Add points to an employee and trigger escalation if needed
   * Escalation logic:
   * - Level 1: 1-2 points → Verbal Advisory
   * - Level 2: 3-4 points → Mandatory Training
   * - Level 3: 5+ points → Performance Impact
   */
  async addPoints(
    employeeId: string,
    points: number,
    reason: string,
    contraventionId?: string
  ): Promise<{ newTotal: number; escalationTriggered: boolean; newLevel: EscalationLevel | null; performanceImpact: boolean }> {
    // Get or create points record
    let pointsRecord = await prisma.employeePoints.findUnique({
      where: { employeeId },
    });

    if (!pointsRecord) {
      pointsRecord = await prisma.employeePoints.create({
        data: {
          employeeId,
          totalPoints: 0,
          pointsHistory: [],
        },
      });
    }

    const previousLevel = pointsRecord.currentLevel;
    const newTotal = pointsRecord.totalPoints + points;

    // Determine new level based purely on points
    const newLevel = this.getEscalationLevel(newTotal);

    // Performance impact is now just Level 3 (5+ points)
    const performanceImpact = newTotal >= ESCALATION_MATRIX.LEVEL_3.min;

    // Update points history
    const history = (pointsRecord.pointsHistory as unknown as PointsHistoryEntry[]) || [];
    history.push({
      date: new Date().toISOString(),
      points,
      contraventionId,
      reason,
      type: 'add',
    });

    // Update points record
    await prisma.employeePoints.update({
      where: { employeeId },
      data: {
        totalPoints: newTotal,
        currentLevel: newLevel,
        lastCalculated: new Date(),
        pointsHistory: history as unknown as Parameters<typeof prisma.employeePoints.update>[0]['data']['pointsHistory'],
      },
    });

    // Check if escalation is triggered (new level or first time at this level)
    const escalationTriggered = newLevel !== previousLevel && newLevel !== null;

    if (escalationTriggered && newLevel) {
      await this.createEscalation(employeeId, newLevel, newTotal);
    }

    // Trigger training at Level 2 (3-4 points)
    if (newTotal >= ESCALATION_MATRIX.LEVEL_2.min) {
      await this.triggerTraining(employeeId);
    }

    return { newTotal, escalationTriggered, newLevel, performanceImpact };
  }

  /**
   * Create an escalation record
   */
  async createEscalation(employeeId: string, level: EscalationLevel, triggerPoints: number): Promise<void> {
    const details = this.getEscalationDetails(level);

    // Calculate due date based on level
    let dueDays = 30; // Default for training
    if (level === 'LEVEL_1') dueDays = 7; // Verbal advisory within a week
    if (level === 'LEVEL_3') dueDays = 1; // Performance impact - immediate notification

    await prisma.escalation.create({
      data: {
        employeeId,
        level,
        triggerPoints,
        actionsRequired: details.actions,
        dueDate: addDays(new Date(), dueDays),
      },
    });
  }

  /**
   * Trigger mandatory training for an employee (at Level 2 / 3+ points)
   */
  async triggerTraining(employeeId: string): Promise<void> {
    // Get any active training course
    const course = await prisma.course.findFirst({
      where: {
        isActive: true,
      },
    });

    if (!course) return;

    // Check if training already assigned or completed
    const existingTraining = await prisma.trainingRecord.findUnique({
      where: {
        employeeId_courseId: {
          employeeId,
          courseId: course.id,
        },
      },
    });

    // Don't re-assign if already exists (assigned, in progress, or completed)
    if (existingTraining) return;

    // Create training record
    await prisma.trainingRecord.create({
      data: {
        employeeId,
        courseId: course.id,
        dueDate: addDays(new Date(), 30),
        status: 'ASSIGNED',
      },
    });
  }

  /**
   * Get the current fiscal year boundaries (Apr 1 - Mar 31)
   */
  getFiscalYearBoundaries(date: Date = new Date()): { start: Date; end: Date } {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-indexed

    // If current month is Jan-Mar, fiscal year started previous calendar year
    // If current month is Apr-Dec, fiscal year started this calendar year
    const fiscalYearStartYear = month < POINTS_CONFIG.FISCAL_YEAR_START_MONTH ? year - 1 : year;

    const start = new Date(fiscalYearStartYear, POINTS_CONFIG.FISCAL_YEAR_START_MONTH - 1, 1); // Apr 1
    const end = new Date(fiscalYearStartYear + 1, POINTS_CONFIG.FISCAL_YEAR_START_MONTH - 1, 0, 23, 59, 59, 999); // Mar 31 end of day

    return { start, end };
  }

  /**
   * Get fiscal year label (e.g., "FY2025/26" for Apr 2025 - Mar 2026)
   */
  getFiscalYearLabel(date: Date = new Date()): string {
    const { start } = this.getFiscalYearBoundaries(date);
    const startYear = start.getFullYear();
    const endYear = startYear + 1;
    return `FY${startYear}/${String(endYear).slice(-2)}`;
  }

  /**
   * Reset all points for a new fiscal year
   * Should be called on April 1st or triggered manually by admin
   */
  async resetPointsForNewFiscalYear(): Promise<{
    processed: number;
    reset: number;
    totalPointsReset: number;
    fiscalYear: string;
    results: Array<{ employeeId: string; employeeName: string; previousPoints: number; resetAt: string }>;
  }> {
    const fiscalYear = this.getFiscalYearLabel();
    const employeesWithPoints = await prisma.employeePoints.findMany({
      where: { totalPoints: { gt: 0 } },
      include: { employee: { select: { name: true } } },
    });

    const results: Array<{ employeeId: string; employeeName: string; previousPoints: number; resetAt: string }> = [];
    let totalPointsReset = 0;

    for (const emp of employeesWithPoints) {
      const history = (emp.pointsHistory as unknown as PointsHistoryEntry[]) || [];
      history.push({
        date: new Date().toISOString(),
        points: -emp.totalPoints,
        reason: `Fiscal year reset (${fiscalYear}) - All points reset to 0`,
        type: 'decay',
      });

      await prisma.employeePoints.update({
        where: { employeeId: emp.employeeId },
        data: {
          totalPoints: 0,
          currentLevel: null,
          lastCalculated: new Date(),
          pointsHistory: history as unknown as Parameters<typeof prisma.employeePoints.update>[0]['data']['pointsHistory'],
        },
      });

      results.push({
        employeeId: emp.employeeId,
        employeeName: emp.employee.name,
        previousPoints: emp.totalPoints,
        resetAt: new Date().toISOString(),
      });
      totalPointsReset += emp.totalPoints;
    }

    return {
      processed: employeesWithPoints.length,
      reset: employeesWithPoints.length,
      totalPointsReset,
      fiscalYear,
      results,
    };
  }

  /**
   * Get fiscal year reset status for all employees
   */
  async getFiscalYearStatus(): Promise<{
    currentFiscalYear: string;
    fiscalYearStart: string;
    fiscalYearEnd: string;
    daysUntilReset: number;
    employeesWithPoints: Array<{ employeeId: string; employeeName: string; totalPoints: number; level: string | null }>;
  }> {
    const { start, end } = this.getFiscalYearBoundaries();
    const now = new Date();
    const nextFiscalYearStart = new Date(end.getTime() + 1); // Day after current fiscal year ends
    const daysUntilReset = Math.ceil((nextFiscalYearStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const employeesWithPoints = await prisma.employeePoints.findMany({
      where: { totalPoints: { gt: 0 } },
      include: { employee: { select: { name: true } } },
      orderBy: { totalPoints: 'desc' },
    });

    return {
      currentFiscalYear: this.getFiscalYearLabel(),
      fiscalYearStart: start.toISOString(),
      fiscalYearEnd: end.toISOString(),
      daysUntilReset,
      employeesWithPoints: employeesWithPoints.map((emp) => ({
        employeeId: emp.employeeId,
        employeeName: emp.employee.name,
        totalPoints: emp.totalPoints,
        level: emp.currentLevel,
      })),
    };
  }

  /**
   * Apply training credit (reduce points by 1)
   */
  async applyTrainingCredit(employeeId: string, trainingId: string): Promise<void> {
    const pointsRecord = await prisma.employeePoints.findUnique({
      where: { employeeId },
    });

    if (!pointsRecord) return;

    const newTotal = Math.max(0, pointsRecord.totalPoints - POINTS_CONFIG.TRAINING_CREDIT);
    const newLevel = this.getEscalationLevel(newTotal);

    const history = (pointsRecord.pointsHistory as unknown as PointsHistoryEntry[]) || [];
    history.push({
      date: new Date().toISOString(),
      points: -POINTS_CONFIG.TRAINING_CREDIT,
      reason: 'Training completion credit',
      type: 'credit',
    });

    await prisma.employeePoints.update({
      where: { employeeId },
      data: {
        totalPoints: newTotal,
        currentLevel: newLevel,
        lastCalculated: new Date(),
        pointsHistory: history as unknown as Parameters<typeof prisma.employeePoints.update>[0]['data']['pointsHistory'],
      },
    });

    // Mark training as credited
    await prisma.trainingRecord.update({
      where: { id: trainingId },
      data: { pointsCredited: true },
    });
  }

  /**
   * Recalculate all escalation levels based on the new 3-level system
   * This migrates old LEVEL_4/LEVEL_5 to LEVEL_3 and updates all employee levels
   */
  async recalculateAllEscalations(): Promise<{
    employeesUpdated: number;
    escalationsArchived: number;
    newEscalationsCreated: number;
    details: Array<{
      employeeId: string;
      employeeName: string;
      oldLevel: string | null;
      newLevel: string | null;
      points: number;
      hasCompletedTraining: boolean;
    }>;
  }> {
    const details: Array<{
      employeeId: string;
      employeeName: string;
      oldLevel: string | null;
      newLevel: string | null;
      points: number;
      hasCompletedTraining: boolean;
    }> = [];

    // Get all employees with points
    const employeesWithPoints = await prisma.employeePoints.findMany({
      include: {
        employee: {
          select: {
            name: true,
            trainingRecords: {
              where: { status: 'COMPLETED' },
              take: 1,
            },
          },
        },
      },
    });

    let employeesUpdated = 0;

    for (const emp of employeesWithPoints) {
      const oldLevel = emp.currentLevel;
      const hasTraining = emp.employee.trainingRecords.length > 0;

      // Recalculate level based on points only (Stage 1: 5, Stage 2: 10, Stage 3: 16+)
      const newLevel = this.getEscalationLevel(emp.totalPoints);

      // Update if level changed
      if (oldLevel !== newLevel) {
        await prisma.employeePoints.update({
          where: { employeeId: emp.employeeId },
          data: { currentLevel: newLevel },
        });
        employeesUpdated++;
      }

      details.push({
        employeeId: emp.employeeId,
        employeeName: emp.employee.name,
        oldLevel,
        newLevel,
        points: emp.totalPoints,
        hasCompletedTraining: hasTraining,
      });
    }

    // Archive old escalations (mark as completed if they have old levels)
    const oldEscalations = await prisma.escalation.findMany({
      where: {
        level: { in: ['LEVEL_4', 'LEVEL_5'] },
        completedAt: null,
      },
    });

    for (const esc of oldEscalations) {
      await prisma.escalation.update({
        where: { id: esc.id },
        data: {
          completedAt: new Date(),
          notes: 'Auto-archived: Migrated to new 3-level escalation system',
        },
      });
    }

    // Archive active escalations where level no longer matches triggerPoints (corrected matrix)
    const activeEscalations = await prisma.escalation.findMany({
      where: {
        level: { in: ['LEVEL_1', 'LEVEL_2', 'LEVEL_3'] },
        completedAt: null,
      },
    });
    let wrongLevelArchived = 0;
    for (const esc of activeEscalations) {
      const correctLevel = this.getEscalationLevel(esc.triggerPoints);
      if (correctLevel !== esc.level) {
        await prisma.escalation.update({
          where: { id: esc.id },
          data: {
            completedAt: new Date(),
            notes: (esc.notes || '') + (esc.notes ? ' ' : '') + 'Auto-archived: Level did not match points (corrected escalation matrix).',
          },
        });
        wrongLevelArchived++;
      }
    }

    // Create new escalations for employees who need them
    let newEscalationsCreated = 0;
    for (const detail of details) {
      if (detail.newLevel && ['LEVEL_1', 'LEVEL_2', 'LEVEL_3'].includes(detail.newLevel)) {
        const level = detail.newLevel as EscalationLevel;
        // Check if there's already an active escalation for this level
        const existingEscalation = await prisma.escalation.findFirst({
          where: {
            employeeId: detail.employeeId,
            level: level,
            completedAt: null,
          },
        });

        if (!existingEscalation) {
          await this.createEscalation(detail.employeeId, level, detail.points);
          newEscalationsCreated++;
        }
      }
    }

    return {
      employeesUpdated,
      escalationsArchived: oldEscalations.length + wrongLevelArchived,
      newEscalationsCreated,
      details,
    };
  }

  /**
   * Sync points from contraventions for all employees
   * This recalculates points based on actual contraventions that exist in the database
   */
  async syncPointsFromContraventions(): Promise<{
    employeesProcessed: number;
    employeesFixed: number;
    details: Array<{
      employeeId: string;
      employeeName: string;
      contraventionCount: number;
      previousPoints: number;
      newPoints: number;
      fixed: boolean;
    }>;
  }> {
    const details: Array<{
      employeeId: string;
      employeeName: string;
      contraventionCount: number;
      previousPoints: number;
      newPoints: number;
      fixed: boolean;
    }> = [];

    // Get all employees with their contraventions and points records
    const employees = await prisma.user.findMany({
      where: { isActive: true },
      include: {
        contraventions: {
          select: {
            id: true,
            referenceNo: true,
            points: true,
            status: true,
          },
        },
        pointsRecord: true,
      },
    });

    let employeesFixed = 0;

    for (const employee of employees) {
      // Only count ACTIVE contraventions (not voided/overturned)
      const activeContraventions = employee.contraventions.filter(
        (c) => !['VOIDED', 'DISPUTED_OVERTURNED'].includes(c.status)
      );

      const expectedPoints = activeContraventions.reduce((sum, c) => sum + c.points, 0);
      const currentPoints = employee.pointsRecord?.totalPoints || 0;

      // Check if points need to be fixed OR if level needs updating
      const newLevel = this.getEscalationLevel(expectedPoints);
      const currentLevel = employee.pointsRecord?.currentLevel || null;
      const needsFix = expectedPoints !== currentPoints || newLevel !== currentLevel;

      if (needsFix) {
        const history: PointsHistoryEntry[] = activeContraventions.map((c) => ({
          date: new Date().toISOString(),
          points: c.points,
          contraventionId: c.id,
          reason: `Synced from ${c.referenceNo}`,
          type: 'add' as const,
        }));

        if (employee.pointsRecord) {
          await prisma.employeePoints.update({
            where: { employeeId: employee.id },
            data: {
              totalPoints: expectedPoints,
              currentLevel: newLevel,
              lastCalculated: new Date(),
              pointsHistory: history as unknown as Parameters<typeof prisma.employeePoints.update>[0]['data']['pointsHistory'],
            },
          });
        } else {
          await prisma.employeePoints.create({
            data: {
              employeeId: employee.id,
              totalPoints: expectedPoints,
              currentLevel: newLevel,
              pointsHistory: history as unknown as Parameters<typeof prisma.employeePoints.create>[0]['data']['pointsHistory'],
            },
          });
        }

        // Trigger training if at Level 2 (3+ points) and no active training
        if (expectedPoints >= 3) {
          await this.triggerTraining(employee.id);
        }

        employeesFixed++;
        details.push({
          employeeId: employee.id,
          employeeName: employee.name,
          contraventionCount: activeContraventions.length,
          previousPoints: currentPoints,
          newPoints: expectedPoints,
          fixed: true,
        });
      } else {
        // Even if points are correct, check if training needs to be triggered
        if (expectedPoints >= 3) {
          await this.triggerTraining(employee.id);
        }

        details.push({
          employeeId: employee.id,
          employeeName: employee.name,
          contraventionCount: activeContraventions.length,
          previousPoints: currentPoints,
          newPoints: expectedPoints,
          fixed: false,
        });
      }
    }

    return {
      employeesProcessed: employees.length,
      employeesFixed,
      details: details.filter((d) => d.fixed || d.contraventionCount > 0),
    };
  }

  /**
   * Get employee points summary
   */
  async getEmployeePointsSummary(employeeId: string) {
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      include: {
        pointsRecord: true,
        contraventions: {
          select: { id: true },
        },
        trainingRecords: {
          where: {
            status: {
              in: ['ASSIGNED', 'IN_PROGRESS', 'OVERDUE'],
            },
          },
          include: {
            course: true,
          },
        },
      },
    });

    if (!user) return null;

    const points = user.pointsRecord;
    const currentLevel = points?.currentLevel;

    // Calculate next level threshold
    let nextLevelThreshold: number | null = null;
    let pointsToNextLevel: number | null = null;

    // Only using 3 levels: LEVEL_1 (1-2 pts), LEVEL_2 (3+ pts / training), LEVEL_3 (performance impact)
    // Level 3 is special - triggered by post-training offense or >3pt single offense, not by points threshold
    if (currentLevel === 'LEVEL_1') {
      nextLevelThreshold = ESCALATION_MATRIX.LEVEL_2.min;
      pointsToNextLevel = nextLevelThreshold - (points?.totalPoints || 0);
    } else if (!currentLevel && (points?.totalPoints || 0) < ESCALATION_MATRIX.LEVEL_1.min) {
      nextLevelThreshold = ESCALATION_MATRIX.LEVEL_1.min;
      pointsToNextLevel = nextLevelThreshold - (points?.totalPoints || 0);
    }
    // Level 2 and Level 3 don't have a "next level" based on points

    return {
      employeeId: user.id,
      employeeName: user.name,
      totalPoints: points?.totalPoints || 0,
      currentLevel: currentLevel,
      levelName: currentLevel ? this.getEscalationDetails(currentLevel).name : null,
      nextLevelThreshold,
      pointsToNextLevel,
      contraventionCount: user.contraventions.length,
      pointsHistory: (points?.pointsHistory as unknown as PointsHistoryEntry[]) || [],
      pendingTraining: user.trainingRecords.map((tr) => ({
        id: tr.id,
        courseName: tr.course.name,
        dueDate: tr.dueDate.toISOString(),
        status: tr.status,
      })),
    };
  }
}

export default new PointsService();
