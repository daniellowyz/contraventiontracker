import prisma from '../config/database';
import { ESCALATION_MATRIX, POINTS_CONFIG, SEVERITY_POINTS } from '../config/constants';
import { EscalationLevel, Severity, PointsHistoryEntry } from '../types';
import { addDays } from '../utils/dateUtils';

export class PointsService {
  /**
   * Calculate points for a contravention based on type and value
   */
  calculatePoints(defaultPoints: number, severity: Severity, valueSgd?: number): number {
    let points = defaultPoints;

    // Apply value modifiers
    if (valueSgd) {
      if (valueSgd > 100000 && severity !== 'CRITICAL') {
        // Upgrade to critical-level points for high-value contraventions
        points = SEVERITY_POINTS.CRITICAL;
      } else if (valueSgd > 10000 && severity === 'MEDIUM') {
        // Add 1 point for medium severity above $10k
        points += 1;
      }
    }

    return points;
  }

  /**
   * Determine escalation level based on total points
   */
  getEscalationLevel(totalPoints: number): EscalationLevel | null {
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_5.min) return 'LEVEL_5';
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_4.min) return 'LEVEL_4';
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_3.min) return 'LEVEL_3';
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_2.min) return 'LEVEL_2';
    if (totalPoints >= ESCALATION_MATRIX.LEVEL_1.min) return 'LEVEL_1';
    return null;
  }

  /**
   * Get escalation level details
   */
  getEscalationDetails(level: EscalationLevel) {
    return ESCALATION_MATRIX[level as keyof typeof ESCALATION_MATRIX];
  }

  /**
   * Add points to an employee and trigger escalation if needed
   */
  async addPoints(
    employeeId: string,
    points: number,
    reason: string,
    contraventionId?: string
  ): Promise<{ newTotal: number; escalationTriggered: boolean; newLevel: EscalationLevel | null }> {
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
    const newLevel = this.getEscalationLevel(newTotal);

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

    // Check if escalation is triggered
    const escalationTriggered = newLevel !== previousLevel && newLevel !== null;

    if (escalationTriggered && newLevel) {
      await this.createEscalation(employeeId, newLevel, newTotal);
    }

    // Check if training should be triggered (at 5 points)
    if (newTotal >= POINTS_CONFIG.TRAINING_TRIGGER_THRESHOLD) {
      await this.triggerTraining(employeeId);
    }

    return { newTotal, escalationTriggered, newLevel };
  }

  /**
   * Create an escalation record
   */
  async createEscalation(employeeId: string, level: EscalationLevel, triggerPoints: number): Promise<void> {
    const details = this.getEscalationDetails(level);

    // Calculate due date based on level
    let dueDays = 30; // Default
    if (level === 'LEVEL_1') dueDays = 1;
    if (level === 'LEVEL_2') dueDays = 5;
    if (level === 'LEVEL_5') dueDays = 1; // Immediate

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
   * Trigger mandatory training for an employee
   */
  async triggerTraining(employeeId: string): Promise<void> {
    // Get the training course (single course that triggers at 5 points)
    const course = await prisma.course.findFirst({
      where: {
        isActive: true,
        triggerPoints: POINTS_CONFIG.TRAINING_TRIGGER_THRESHOLD,
      },
    });

    if (!course) return;

    // Check if training already assigned
    const existingTraining = await prisma.trainingRecord.findUnique({
      where: {
        employeeId_courseId: {
          employeeId,
          courseId: course.id,
        },
      },
    });

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
   * Apply points decay for an employee
   * Points decay after a period of no new contraventions
   */
  async applyPointsDecay(employeeId: string): Promise<{ decayed: boolean; pointsDecayed: number; newTotal: number }> {
    const pointsRecord = await prisma.employeePoints.findUnique({
      where: { employeeId },
    });

    if (!pointsRecord || pointsRecord.totalPoints === 0) {
      return { decayed: false, pointsDecayed: 0, newTotal: 0 };
    }

    // Check if there are any new contraventions in the decay period
    const decayPeriodStart = new Date();
    decayPeriodStart.setMonth(decayPeriodStart.getMonth() - POINTS_CONFIG.DECAY_PERIOD_MONTHS);

    const recentContraventions = await prisma.contravention.count({
      where: {
        employeeId,
        createdAt: { gte: decayPeriodStart },
        status: { not: 'RESOLVED' },
      },
    });

    if (recentContraventions > 0) {
      return { decayed: false, pointsDecayed: 0, newTotal: pointsRecord.totalPoints };
    }

    // Apply decay
    const pointsToDecay = Math.min(POINTS_CONFIG.DECAY_RATE, pointsRecord.totalPoints);
    const newTotal = pointsRecord.totalPoints - pointsToDecay;
    const newLevel = this.getEscalationLevel(newTotal);

    const history = (pointsRecord.pointsHistory as unknown as PointsHistoryEntry[]) || [];
    history.push({
      date: new Date().toISOString(),
      points: -pointsToDecay,
      reason: `Points decay: ${POINTS_CONFIG.DECAY_PERIOD_MONTHS} months without new contraventions`,
      type: 'decay',
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

    return { decayed: true, pointsDecayed: pointsToDecay, newTotal };
  }

  /**
   * Run points decay for all employees
   * Should be called periodically (e.g., monthly via cron job or admin trigger)
   */
  async runPointsDecayForAllEmployees(): Promise<{
    processed: number;
    decayed: number;
    totalPointsDecayed: number;
    results: Array<{ employeeId: string; employeeName: string; decayed: boolean; pointsDecayed: number; newTotal: number }>;
  }> {
    const employeesWithPoints = await prisma.employeePoints.findMany({
      where: { totalPoints: { gt: 0 } },
      include: { employee: { select: { name: true } } },
    });

    const results: Array<{ employeeId: string; employeeName: string; decayed: boolean; pointsDecayed: number; newTotal: number }> = [];
    let totalPointsDecayed = 0;
    let decayedCount = 0;

    for (const emp of employeesWithPoints) {
      const result = await this.applyPointsDecay(emp.employeeId);
      results.push({ employeeId: emp.employeeId, employeeName: emp.employee.name, ...result });
      if (result.decayed) {
        totalPointsDecayed += result.pointsDecayed;
        decayedCount++;
      }
    }

    return {
      processed: employeesWithPoints.length,
      decayed: decayedCount,
      totalPointsDecayed,
      results,
    };
  }

  /**
   * Get points decay status for an employee
   */
  async getPointsDecayStatus(employeeId: string): Promise<{
    eligibleForDecay: boolean;
    monthsUntilDecay: number | null;
    lastContraventionDate: Date | null;
    pointsWillDecay: number;
    estimatedDecayDate: Date | null;
  }> {
    const pointsRecord = await prisma.employeePoints.findUnique({
      where: { employeeId },
    });

    if (!pointsRecord || pointsRecord.totalPoints === 0) {
      return {
        eligibleForDecay: false,
        monthsUntilDecay: null,
        lastContraventionDate: null,
        pointsWillDecay: 0,
        estimatedDecayDate: null,
      };
    }

    // Get last contravention date
    const lastContravention = await prisma.contravention.findFirst({
      where: { employeeId, status: { not: 'RESOLVED' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!lastContravention) {
      return {
        eligibleForDecay: true,
        monthsUntilDecay: 0,
        lastContraventionDate: null,
        pointsWillDecay: Math.min(POINTS_CONFIG.DECAY_RATE, pointsRecord.totalPoints),
        estimatedDecayDate: new Date(),
      };
    }

    const monthsSinceLastContravention = Math.floor(
      (new Date().getTime() - lastContravention.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    const monthsUntilDecay = Math.max(0, POINTS_CONFIG.DECAY_PERIOD_MONTHS - monthsSinceLastContravention);
    const eligibleForDecay = monthsUntilDecay === 0;

    const estimatedDecayDate = new Date(lastContravention.createdAt);
    estimatedDecayDate.setMonth(estimatedDecayDate.getMonth() + POINTS_CONFIG.DECAY_PERIOD_MONTHS);

    return {
      eligibleForDecay,
      monthsUntilDecay: eligibleForDecay ? null : monthsUntilDecay,
      lastContraventionDate: lastContravention.createdAt,
      pointsWillDecay: Math.min(POINTS_CONFIG.DECAY_RATE, pointsRecord.totalPoints),
      estimatedDecayDate: eligibleForDecay ? new Date() : estimatedDecayDate,
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

    if (currentLevel) {
      const levels: EscalationLevel[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5'];
      const currentIndex = levels.indexOf(currentLevel);
      if (currentIndex < levels.length - 1) {
        const nextLevel = levels[currentIndex + 1];
        nextLevelThreshold = ESCALATION_MATRIX[nextLevel as keyof typeof ESCALATION_MATRIX].min;
        pointsToNextLevel = nextLevelThreshold - (points?.totalPoints || 0);
      }
    } else if ((points?.totalPoints || 0) < ESCALATION_MATRIX.LEVEL_1.min) {
      nextLevelThreshold = ESCALATION_MATRIX.LEVEL_1.min;
      pointsToNextLevel = nextLevelThreshold - (points?.totalPoints || 0);
    }

    return {
      employeeId: user.id,
      employeeName: user.name,
      totalPoints: points?.totalPoints || 0,
      currentLevel: currentLevel,
      levelName: currentLevel ? ESCALATION_MATRIX[currentLevel as keyof typeof ESCALATION_MATRIX].name : null,
      nextLevelThreshold,
      pointsToNextLevel,
      contraventionCount: user.contraventions.length,
      pointsHistory: (points?.pointsHistory as unknown as PointsHistoryEntry[]) || [],
      pendingTraining: user.trainingRecords.map((tr: { id: string; course: { name: string }; dueDate: Date; status: string }) => ({
        id: tr.id,
        courseName: tr.course.name,
        dueDate: tr.dueDate.toISOString(),
        status: tr.status,
      })),
    };
  }
}

export default new PointsService();
