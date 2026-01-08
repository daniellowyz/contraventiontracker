import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/admin/types - List contravention types
router.get('/types', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const types = await prisma.contraventionType.findMany({
      orderBy: { category: 'asc' },
    });
    res.json({ success: true, data: types });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/types - Create contravention type (admin only)
router.post('/types', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { category, name, description, defaultSeverity, defaultPoints } = req.body;

    const type = await prisma.contraventionType.create({
      data: {
        category,
        name,
        description,
        defaultSeverity,
        defaultPoints,
      },
    });

    res.status(201).json({ success: true, data: type });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/types/:id - Update contravention type (admin only)
router.patch('/types/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, description, defaultSeverity, defaultPoints, isActive } = req.body;

    const type = await prisma.contraventionType.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(defaultSeverity && { defaultSeverity }),
        ...(defaultPoints !== undefined && { defaultPoints }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: type });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/departments - List departments
router.get('/departments', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const departments = await prisma.department.findMany({
      include: {
        head: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: departments });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/departments - Create department (admin only)
router.post('/departments', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, headId } = req.body;

    const department = await prisma.department.create({
      data: { name, headId },
    });

    res.status(201).json({ success: true, data: department });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/courses - List courses
router.get('/courses', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: courses });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/training - List all training records (admin only)
router.get('/training', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { status } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const trainingRecords = await prisma.trainingRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            department: { select: { name: true } },
            pointsRecord: { select: { totalPoints: true } },
          },
        },
        course: true,
      },
      orderBy: { assignedDate: 'desc' },
    });

    res.json({ success: true, data: trainingRecords });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/training/needs-training - Get employees who need training (>3 points)
router.get('/training/needs-training', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    // First get all employees with their points records
    const allEmployees = await prisma.user.findMany({
      where: {
        isActive: true,
      },
      include: {
        department: { select: { name: true } },
        pointsRecord: { select: { totalPoints: true, currentLevel: true } },
        trainingRecords: {
          orderBy: { completedDate: 'desc' },
        },
      },
    });

    // Filter employees who have >3 points and don't have active training
    const employeesNeedingTraining = allEmployees
      .filter((emp) => {
        const points = emp.pointsRecord?.totalPoints || 0;
        const hasActiveTraining = emp.trainingRecords.some(
          (tr) => tr.status === 'ASSIGNED' || tr.status === 'IN_PROGRESS'
        );
        return points > 3 && !hasActiveTraining;
      })
      .map((emp) => ({
        ...emp,
        trainingRecords: emp.trainingRecords.filter((tr) => tr.status === 'COMPLETED').slice(0, 1),
      }))
      .sort((a, b) => (b.pointsRecord?.totalPoints || 0) - (a.pointsRecord?.totalPoints || 0));

    res.json({ success: true, data: employeesNeedingTraining });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/training/assign - Assign training to employee (admin only)
router.post('/training/assign', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { employeeId, courseId, dueDate } = req.body;

    if (!employeeId || !courseId) {
      throw new AppError('Employee ID and Course ID are required', 400);
    }

    // Check if employee exists
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new AppError('Course not found', 404);
    }

    // Check if training already assigned
    const existingTraining = await prisma.trainingRecord.findUnique({
      where: {
        employeeId_courseId: { employeeId, courseId },
      },
    });

    if (existingTraining && ['ASSIGNED', 'IN_PROGRESS'].includes(existingTraining.status)) {
      throw new AppError('Training already assigned to this employee', 400);
    }

    // Create or update training record
    const training = existingTraining
      ? await prisma.trainingRecord.update({
          where: { id: existingTraining.id },
          data: {
            status: 'ASSIGNED',
            assignedDate: new Date(),
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            completedDate: null,
            pointsCredited: false,
          },
          include: {
            employee: { select: { id: true, name: true, email: true } },
            course: true,
          },
        })
      : await prisma.trainingRecord.create({
          data: {
            employeeId,
            courseId,
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'ASSIGNED',
          },
          include: {
            employee: { select: { id: true, name: true, email: true } },
            course: true,
          },
        });

    res.status(201).json({ success: true, data: training });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/training/:id/status - Update training status (admin only)
router.patch('/training/:id/status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { status } = req.body;

    if (!status || !['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    const training = await prisma.trainingRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!training) {
      throw new AppError('Training record not found', 404);
    }

    const updateData: Record<string, unknown> = { status };

    if (status === 'COMPLETED') {
      updateData.completedDate = new Date();
    }

    const updated = await prisma.trainingRecord.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        employee: { select: { id: true, name: true, email: true } },
        course: true,
      },
    });

    // Apply training credit if completed and not already credited
    if (status === 'COMPLETED' && !training.pointsCredited) {
      const pointsService = (await import('../services/points.service')).default;
      await pointsService.applyTrainingCredit(training.employeeId, training.id);
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/courses - Create course (admin only)
router.post('/courses', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, description, durationHours, provider, validityMonths, triggerPoints, pointsCredit } = req.body;

    const course = await prisma.course.create({
      data: {
        name,
        description,
        durationHours,
        provider,
        validityMonths,
        triggerPoints: triggerPoints || 5,
        pointsCredit: pointsCredit || 1,
      },
    });

    res.status(201).json({ success: true, data: course });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/audit-logs - List audit logs (admin only)
router.get('/audit-logs', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { entityType, userId, page = '1', limit = '50' } = req.query;

    const where: Record<string, unknown> = {};
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
        take: parseInt(limit as string),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/disputes - List all disputes (admin only)
router.get('/disputes', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { status } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const disputes = await prisma.dispute.findMany({
      where,
      include: {
        contravention: {
          include: {
            employee: { select: { id: true, name: true } },
            type: { select: { name: true } },
          },
        },
        submittedBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: disputes });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/disputes/:id/decide - Resolve dispute (admin only)
router.patch('/disputes/:id/decide', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { decision, panelDecision } = req.body;

    if (!decision || !['UPHELD', 'OVERTURNED'].includes(decision)) {
      throw new AppError('Invalid decision', 400);
    }

    // Import the service dynamically to avoid circular dependencies
    const contraventionService = (await import('../services/contravention.service')).default;

    const dispute = await contraventionService.resolveDispute(
      req.params.id,
      req.user!.userId,
      decision,
      panelDecision
    );

    res.json({ success: true, data: dispute });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/escalations - List all escalations (admin only)
router.get('/escalations', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { level, completed } = req.query;

    const where: Record<string, unknown> = {};
    if (level) where.level = level;
    if (completed === 'true') {
      where.completedAt = { not: null };
    } else if (completed === 'false') {
      where.completedAt = null;
    }

    const escalations = await prisma.escalation.findMany({
      where,
      include: {
        employee: {
          select: { id: true, name: true, department: { select: { name: true } } },
        },
      },
      orderBy: { triggeredAt: 'desc' },
    });

    res.json({ success: true, data: escalations });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/escalations/:id/complete-action - Mark action as complete
router.patch(
  '/escalations/:id/complete-action',
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { action } = req.body;

      const escalation = await prisma.escalation.findUnique({
        where: { id: req.params.id },
      });

      if (!escalation) {
        throw new AppError('Escalation not found', 404);
      }

      const actionsCompleted = [...escalation.actionsCompleted, action];
      const allCompleted = escalation.actionsRequired.every((a) => actionsCompleted.includes(a));

      const updated = await prisma.escalation.update({
        where: { id: req.params.id },
        data: {
          actionsCompleted,
          completedAt: allCompleted ? new Date() : null,
        },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/training/:id/complete - Mark training as complete (admin only)
router.post(
  '/training/:id/complete',
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const training = await prisma.trainingRecord.findUnique({
        where: { id: req.params.id },
      });

      if (!training) {
        throw new AppError('Training record not found', 404);
      }

      // Update training status
      const updated = await prisma.trainingRecord.update({
        where: { id: req.params.id },
        data: {
          status: 'COMPLETED',
          completedDate: new Date(),
        },
      });

      // Apply training credit if not already credited
      if (!training.pointsCredited) {
        const pointsService = (await import('../services/points.service')).default;
        await pointsService.applyTrainingCredit(training.employeeId, training.id);
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/points/run-decay - Run points decay for all employees (admin only)
router.post('/points/run-decay', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.runPointsDecayForAllEmployees();

    res.json({
      success: true,
      message: `Processed ${result.processed} employees, ${result.decayed} had points decayed (total: ${result.totalPointsDecayed} points)`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/points/decay-status - Get decay status for all employees with points (admin only)
router.get('/points/decay-status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;

    // Get all employees with points
    const employeesWithPoints = await prisma.employeePoints.findMany({
      where: { totalPoints: { gt: 0 } },
      include: { employee: { select: { id: true, name: true, email: true } } },
    });

    const decayStatuses = await Promise.all(
      employeesWithPoints.map(async (emp) => {
        const status = await pointsService.getPointsDecayStatus(emp.employeeId);
        return {
          employeeId: emp.employeeId,
          employeeName: emp.employee.name,
          currentPoints: emp.totalPoints,
          ...status,
        };
      })
    );

    res.json({ success: true, data: decayStatuses });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/email-status - Get email sandbox status (admin only)
router.get('/email-status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { notificationService } = await import('../services/notification.service');
    const status = notificationService.getEmailSandboxStatus();

    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

export default router;
