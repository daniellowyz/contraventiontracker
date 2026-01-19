import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/admin/approvers - List all users who can approve (APPROVER role only)
router.get('/approvers', authenticate, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const approvers = await prisma.user.findMany({
      where: {
        isActive: true,
        role: 'APPROVER',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        position: true,
        role: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: approvers });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/email-status - Get email configuration status (admin only)
router.get('/email-status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const sandboxMode = process.env.EMAIL_SANDBOX_MODE === 'true';
    const sandboxEmail = process.env.EMAIL_SANDBOX_RECIPIENT || 'daniellow@open.gov.sg';
    const emailProviderConfigured = !!process.env.POSTMARK_API_KEY;

    res.json({
      success: true,
      data: {
        enabled: sandboxMode,
        sandboxEmail,
        emailProviderConfigured,
      },
    });
  } catch (error) {
    next(error);
  }
});

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
    const { category, name, description, defaultPoints } = req.body;

    const type = await prisma.contraventionType.create({
      data: {
        category,
        name,
        description,
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
    const { name, description, defaultPoints, isActive } = req.body;

    const type = await prisma.contraventionType.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(defaultPoints !== undefined && { defaultPoints }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: type });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/types/:id - Delete contravention type (admin only)
router.delete('/types/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const typeId = req.params.id;

    // Check if type exists
    const type = await prisma.contraventionType.findUnique({
      where: { id: typeId },
    });

    if (!type) {
      throw new AppError('Contravention type not found', 404);
    }

    // Prevent deleting the "Others" type
    if (type.isOthers) {
      throw new AppError('Cannot delete the "Others" type', 400);
    }

    // Check if any contraventions use this type
    const contraventionCount = await prisma.contravention.count({
      where: { typeId },
    });

    if (contraventionCount > 0) {
      throw new AppError(`Cannot delete type: ${contraventionCount} contravention(s) are using this type`, 400);
    }

    // Delete the type
    await prisma.contraventionType.delete({
      where: { id: typeId },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'DELETE_TYPE',
        entityType: 'ContraventionType',
        entityId: typeId,
        oldValues: { name: type.name, category: type.category },
        newValues: {},
      },
    });

    res.json({ success: true, message: 'Type deleted successfully' });
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

// ============== FISCAL YEAR POINTS RESET ==============

// GET /api/admin/points/fiscal-year-status - Get fiscal year reset status (admin only)
router.get('/points/fiscal-year-status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const status = await pointsService.getFiscalYearStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/points/fiscal-year-reset - Reset all points for new fiscal year (admin only)
router.post('/points/fiscal-year-reset', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.resetPointsForNewFiscalYear();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/escalations/recalculate - Recalculate all escalations for new 3-level system (admin only)
router.post('/escalations/recalculate', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.recalculateAllEscalations();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/points/sync - Sync points from contraventions (admin only)
router.post('/points/sync', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.syncPointsFromContraventions();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ============== USER MANAGEMENT ==============

// GET /api/admin/users - List all users (admin only)
router.get('/users', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { search, role } = req.query;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { employeeId: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        department: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users/duplicates - Find duplicate users (ogp vs open email domains)
router.get('/users/duplicates', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    // Find users with @ogp.gov.sg emails
    const ogpUsers = await prisma.user.findMany({
      where: {
        email: { endsWith: '@ogp.gov.sg' },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        employeeId: true,
        _count: { select: { contraventions: true } },
      },
    });

    // For each ogp user, check if there's a matching open.gov.sg user
    const duplicates = [];
    for (const ogpUser of ogpUsers) {
      const baseName = ogpUser.email.replace('@ogp.gov.sg', '');
      const openEmail = `${baseName}@open.gov.sg`;

      const openUser = await prisma.user.findFirst({
        where: {
          email: openEmail,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          employeeId: true,
          _count: { select: { contraventions: true } },
        },
      });

      if (openUser) {
        duplicates.push({
          ogpUser: {
            id: ogpUser.id,
            email: ogpUser.email,
            name: ogpUser.name,
            employeeId: ogpUser.employeeId,
            contraventionCount: ogpUser._count.contraventions,
          },
          openUser: {
            id: openUser.id,
            email: openUser.email,
            name: openUser.name,
            employeeId: openUser.employeeId,
            contraventionCount: openUser._count.contraventions,
          },
        });
      }
    }

    res.json({ success: true, data: duplicates });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users/inactive - Get inactive/deactivated users (admin only)
router.get('/users/inactive', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const inactiveUsers = await prisma.user.findMany({
      where: {
        isActive: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        employeeId: true,
        isActive: true,
        _count: { select: { contraventions: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: inactiveUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        employeeId: u.employeeId,
        isActive: u.isActive,
        contraventionCount: u._count.contraventions,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/merge - Merge two users (transfer contraventions from source to target, deactivate source)
router.post('/users/merge', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { sourceId, targetId } = req.body;

    if (!sourceId || !targetId) {
      throw new AppError('Source and target user IDs are required', 400);
    }

    if (sourceId === targetId) {
      throw new AppError('Cannot merge a user with themselves', 400);
    }

    // Verify both users exist
    const [sourceUser, targetUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: sourceId } }),
      prisma.user.findUnique({ where: { id: targetId } }),
    ]);

    if (!sourceUser) {
      throw new AppError('Source user not found', 404);
    }
    if (!targetUser) {
      throw new AppError('Target user not found', 404);
    }

    // Transfer all contraventions from source to target
    const contraventionsUpdated = await prisma.contravention.updateMany({
      where: { employeeId: sourceId },
      data: { employeeId: targetId },
    });

    // Transfer logged contraventions (where they were the logger)
    await prisma.contravention.updateMany({
      where: { loggedById: sourceId },
      data: { loggedById: targetId },
    });

    // Transfer acknowledgedBy
    await prisma.contravention.updateMany({
      where: { acknowledgedById: sourceId },
      data: { acknowledgedById: targetId },
    });

    // Transfer training records
    await prisma.trainingRecord.updateMany({
      where: { employeeId: sourceId },
      data: { employeeId: targetId },
    });

    // Transfer escalations
    await prisma.escalation.updateMany({
      where: { employeeId: sourceId },
      data: { employeeId: targetId },
    });

    // Transfer disputes (submittedBy)
    await prisma.dispute.updateMany({
      where: { submittedById: sourceId },
      data: { submittedById: targetId },
    });

    // Transfer points record if source has one
    const sourcePointsRecord = await prisma.employeePoints.findUnique({
      where: { employeeId: sourceId },
    });

    if (sourcePointsRecord) {
      // Check if target has a points record
      const targetPointsRecord = await prisma.employeePoints.findUnique({
        where: { employeeId: targetId },
      });

      if (targetPointsRecord) {
        // Merge points: add source points to target
        await prisma.employeePoints.update({
          where: { employeeId: targetId },
          data: {
            totalPoints: targetPointsRecord.totalPoints + sourcePointsRecord.totalPoints,
          },
        });
        // Delete source points record
        await prisma.employeePoints.delete({
          where: { employeeId: sourceId },
        });
      } else {
        // Move the points record to target
        await prisma.employeePoints.update({
          where: { employeeId: sourceId },
          data: { employeeId: targetId },
        });
      }
    }

    // Deactivate the source user
    await prisma.user.update({
      where: { id: sourceId },
      data: { isActive: false },
    });

    // Log the merge action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'MERGE_USERS',
        entityType: 'User',
        entityId: targetId,
        oldValues: {
          sourceUserId: sourceId,
          sourceEmail: sourceUser.email,
          sourceName: sourceUser.name,
        },
        newValues: {
          targetUserId: targetId,
          targetEmail: targetUser.email,
          targetName: targetUser.name,
          contraventionsTransferred: contraventionsUpdated.count,
        },
      },
    });

    res.json({
      success: true,
      message: `Successfully merged ${sourceUser.email} into ${targetUser.email}. ${contraventionsUpdated.count} contraventions transferred.`,
      data: {
        contraventionsTransferred: contraventionsUpdated.count,
        sourceDeactivated: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/users/:id/status - Update user active status (admin only)
router.patch('/users/:id/status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      throw new AppError('isActive must be a boolean', 400);
    }

    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        department: { select: { id: true, name: true } },
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: isActive ? 'REACTIVATE_USER' : 'DEACTIVATE_USER',
        entityType: 'User',
        entityId: userId,
        oldValues: { isActive: user.isActive },
        newValues: { isActive },
      },
    });

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/users/:id/role - Update user role (admin only)
router.patch('/users/:id/role', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { role } = req.body;

    if (!role || !['ADMIN', 'APPROVER', 'USER'].includes(role)) {
      throw new AppError('Invalid role. Must be ADMIN, APPROVER, or USER', 400);
    }

    const userId = req.params.id;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new AppError('User not found', 404);
    }

    // Prevent demoting yourself (the current admin)
    if (userId === req.user!.userId && role === 'USER') {
      throw new AppError('You cannot demote yourself from admin', 400);
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        department: { select: { id: true, name: true } },
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'UPDATE_ROLE',
        entityType: 'User',
        entityId: userId,
        oldValues: { role: existingUser.role },
        newValues: { role },
      },
    });

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/approver-requests - Get users with pending approver requests (admin only)
router.get('/approver-requests', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const requests = await prisma.user.findMany({
      where: {
        requestedApprover: true,
        approverRequestStatus: 'PENDING',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        position: true,
        role: true,
        requestedApprover: true,
        approverRequestStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/approver-requests/count - Get count of pending approver requests (admin only)
router.get('/approver-requests/count', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const count = await prisma.user.count({
      where: {
        requestedApprover: true,
        approverRequestStatus: 'PENDING',
      },
    });

    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/approver-requests/:id/approve - Approve approver request (admin only)
router.post('/approver-requests/:id/approve', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.requestedApprover || user.approverRequestStatus !== 'PENDING') {
      throw new AppError('No pending approver request for this user', 400);
    }

    // Update user to APPROVER role and mark request as approved
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'APPROVER',
        approverRequestStatus: 'APPROVED',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        position: true,
        role: true,
        requestedApprover: true,
        approverRequestStatus: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'APPROVE_APPROVER_REQUEST',
        entityType: 'User',
        entityId: userId,
        oldValues: { role: user.role, approverRequestStatus: 'PENDING' },
        newValues: { role: 'APPROVER', approverRequestStatus: 'APPROVED' },
      },
    });

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/approver-requests/:id/reject - Reject approver request (admin only)
router.post('/approver-requests/:id/reject', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.requestedApprover || user.approverRequestStatus !== 'PENDING') {
      throw new AppError('No pending approver request for this user', 400);
    }

    // Mark request as rejected (keep role as USER)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        approverRequestStatus: 'REJECTED',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        position: true,
        role: true,
        requestedApprover: true,
        approverRequestStatus: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'REJECT_APPROVER_REQUEST',
        entityType: 'User',
        entityId: userId,
        oldValues: { approverRequestStatus: 'PENDING' },
        newValues: { approverRequestStatus: 'REJECTED' },
      },
    });

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
});

// ============== TEAMS ==============

// GET /api/admin/teams - List all teams
router.get('/teams', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const teams = await prisma.team.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            contraventions: true,
            members: true,
          },
        },
      },
      orderBy: [
        { isPersonal: 'desc' },
        { name: 'asc' },
      ],
    });
    res.json({
      success: true,
      data: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isPersonal: t.isPersonal,
        contraventionCount: t._count.contraventions,
        memberCount: t._count.members,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/teams - Create a new team (admin only)
router.post('/teams', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      throw new AppError('Team name is required', 400);
    }

    // Check if team already exists
    const existingTeam = await prisma.team.findUnique({
      where: { name },
    });

    if (existingTeam) {
      throw new AppError('A team with this name already exists', 400);
    }

    const team = await prisma.team.create({
      data: {
        name,
        description: description || null,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: team.id,
        name: team.name,
        description: team.description,
        isPersonal: team.isPersonal,
        contraventionCount: 0,
        memberCount: 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/teams/:id - Update a team (admin only)
router.patch('/teams/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, description, isActive } = req.body;

    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
    });

    if (!team) {
      throw new AppError('Team not found', 404);
    }

    // If changing name, check for duplicates
    if (name && name !== team.name) {
      const existingTeam = await prisma.team.findUnique({
        where: { name },
      });
      if (existingTeam) {
        throw new AppError('A team with this name already exists', 400);
      }
    }

    const updated = await prisma.team.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        _count: {
          select: {
            contraventions: true,
            members: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isPersonal: updated.isPersonal,
        isActive: updated.isActive,
        contraventionCount: updated._count.contraventions,
        memberCount: updated._count.members,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============== APPROVERS ==============

// GET /api/admin/approvers - List all users with APPROVER role
router.get('/approvers', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const approvers = await prisma.user.findMany({
      where: {
        role: 'APPROVER',
        isActive: true,
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        position: true,
        role: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: approvers });
  } catch (error) {
    next(error);
  }
});

// ============== TEMPORARY OTP LOOKUP (FOR PRODUCTION BEFORE EMAIL IS SET UP) ==============

// GET /api/admin/otp/lookup - Look up OTP for a user (admin only, temporary)
router.get('/otp/lookup', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    // Find the most recent valid OTP for this email
    const otpRecord = await prisma.otpRecord.findFirst({
      where: {
        email: (email as string).toLowerCase(),
        expiresAt: { gt: new Date() },
        usedAt: null,
        attempts: { lt: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      res.json({
        success: true,
        data: {
          found: false,
          message: 'No valid OTP found for this email',
        },
      });
      return;
    }

    // Note: We can't recover the actual OTP since it's hashed
    // But we can show the OTP details
    res.json({
      success: true,
      data: {
        found: true,
        email: otpRecord.email,
        createdAt: otpRecord.createdAt,
        expiresAt: otpRecord.expiresAt,
        attempts: otpRecord.attempts,
        note: 'OTP is hashed and cannot be recovered. Check server console for development OTPs.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// ========================================
// "Others" Type Management Endpoints
// ========================================

// GET /api/admin/types/others-usage - Get all "Others" type contraventions grouped by customTypeName
router.get('/types/others-usage', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    // Find the "Others" type
    const othersType = await prisma.contraventionType.findFirst({
      where: { isOthers: true },
    });

    if (!othersType) {
      return res.json({ success: true, data: [] });
    }

    // Get all contraventions with this type that have customTypeName
    const contraventions = await prisma.contravention.findMany({
      where: {
        typeId: othersType.id,
        customTypeName: { not: null },
      },
      select: {
        customTypeName: true,
        points: true,
      },
    });

    // Group by customTypeName and count
    const usageMap = new Map<string, { count: number; totalPoints: number }>();
    contraventions.forEach((c) => {
      const name = c.customTypeName!;
      const existing = usageMap.get(name) || { count: 0, totalPoints: 0 };
      usageMap.set(name, {
        count: existing.count + 1,
        totalPoints: existing.totalPoints + c.points,
      });
    });

    // Convert to array and sort by count
    const usage = Array.from(usageMap.entries())
      .map(([name, data]) => ({
        customTypeName: name,
        count: data.count,
        totalPoints: data.totalPoints,
        avgPoints: Math.round(data.totalPoints / data.count * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({ success: true, data: usage });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/types/promote - Create a new permanent type from a custom "Others" name
router.post('/types/promote', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { customTypeName, category, name, defaultPoints } = req.body;

    if (!customTypeName || !category || !name || defaultPoints === undefined) {
      throw new AppError('Missing required fields', 400);
    }

    // Check if type with this name already exists
    const existingType = await prisma.contraventionType.findFirst({
      where: { name },
    });

    if (existingType) {
      throw new AppError('A contravention type with this name already exists', 400);
    }

    // Find the "Others" type
    const othersType = await prisma.contraventionType.findFirst({
      where: { isOthers: true },
    });

    if (!othersType) {
      throw new AppError('Others type not found', 404);
    }

    // Create the new type
    const newType = await prisma.contraventionType.create({
      data: {
        category,
        name,
        defaultPoints,
        isActive: true,
        isOthers: false,
      },
    });

    // Update all existing contraventions with this customTypeName to use the new type
    const updated = await prisma.contravention.updateMany({
      where: {
        typeId: othersType.id,
        customTypeName: customTypeName,
      },
      data: {
        typeId: newType.id,
        customTypeName: null,  // Clear the custom name since it's now a proper type
      },
    });

    // Log this action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: 'PROMOTE_TYPE',
        entityType: 'ContraventionType',
        entityId: newType.id,
        oldValues: { customTypeName },
        newValues: {
          typeName: name,
          category,
          defaultPoints,
          contraventionsUpdated: updated.count,
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        newType,
        contraventionsUpdated: updated.count,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
