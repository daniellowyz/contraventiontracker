import { Router, Response } from 'express';
import prisma from '../config/database';
import pointsService from '../services/points.service';
import contraventionService from '../services/contravention.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/employees - List all employees
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const employees = await prisma.user.findMany({
      include: {
        department: { select: { id: true, name: true } },
        pointsRecord: { select: { totalPoints: true, currentLevel: true } },
        _count: { select: { contraventions: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: employees.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        name: e.name,
        email: e.email,
        department: e.department,
        role: e.role,
        isActive: e.isActive,
        points: e.pointsRecord?.totalPoints || 0,
        currentLevel: e.pointsRecord?.currentLevel,
        contraventionCount: e._count.contraventions,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/:id - Get employee profile
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const employee = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        department: true,
        pointsRecord: true,
        escalations: {
          orderBy: { triggeredAt: 'desc' },
          take: 5,
        },
        trainingRecords: {
          include: { course: true },
        },
        _count: { select: { contraventions: true } },
      },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    res.json({ success: true, data: employee });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/:id/points - Get employee points summary
router.get('/:id/points', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const summary = await pointsService.getEmployeePointsSummary(req.params.id);

    if (!summary) {
      throw new AppError('Employee not found', 404);
    }

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/:id/contraventions - Get employee's contraventions
router.get('/:id/contraventions', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const contraventions = await contraventionService.findByEmployee(req.params.id);
    res.json({ success: true, data: contraventions });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/:id/escalations - Get employee's escalation history
router.get('/:id/escalations', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const escalations = await prisma.escalation.findMany({
      where: { employeeId: req.params.id },
      orderBy: { triggeredAt: 'desc' },
    });

    res.json({ success: true, data: escalations });
  } catch (error) {
    next(error);
  }
});

// GET /api/employees/:id/training - Get employee's training records
router.get('/:id/training', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const training = await prisma.trainingRecord.findMany({
      where: { employeeId: req.params.id },
      include: { course: true },
      orderBy: { assignedDate: 'desc' },
    });

    res.json({ success: true, data: training });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employees/:id - Update employee (admin only)
router.patch('/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, email, departmentId, role, isActive } = req.body;

    const employee = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(departmentId !== undefined && { departmentId }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        department: true,
        pointsRecord: true,
      },
    });

    res.json({ success: true, data: employee });
  } catch (error) {
    next(error);
  }
});

export default router;
