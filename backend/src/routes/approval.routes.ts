import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticate, requireApprover, requireAdmin } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/approvals/pending-count - Get count of pending approvals for current user
router.get('/pending-count', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const count = await prisma.contraventionApproval.count({
      where: {
        approverId: req.user!.userId,
        status: 'PENDING',
      },
    });

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/approvals/pending - Get pending approvals for current user (approver)
router.get('/pending', authenticate, requireApprover, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const approvals = await prisma.contraventionApproval.findMany({
      where: {
        approverId: req.user!.userId,
      },
      include: {
        contravention: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                employeeId: true,
              },
            },
            type: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        approvals,
        total: approvals.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/approvals/all - Get all approvals (admin only)
router.get('/all', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const approvals = await prisma.contraventionApproval.findMany({
      include: {
        contravention: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                employeeId: true,
              },
            },
            type: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        approvals,
        total: approvals.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/approvals/:id/review - Review an approval request
router.post('/:id/review', authenticate, requireApprover, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      throw new AppError('Status must be APPROVED or REJECTED', 400);
    }

    // Find the approval
    const approval = await prisma.contraventionApproval.findUnique({
      where: { id },
      include: {
        contravention: true,
      },
    });

    if (!approval) {
      throw new AppError('Approval not found', 404);
    }

    // Check if user is the assigned approver or an admin
    const isAdmin = req.user!.role === 'ADMIN';
    if (approval.approverId !== req.user!.userId && !isAdmin) {
      throw new AppError('Not authorized to review this approval', 403);
    }

    if (approval.status !== 'PENDING') {
      throw new AppError('This approval has already been reviewed', 400);
    }

    // Update the approval and contravention status in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the approval record
      const updatedApproval = await tx.contraventionApproval.update({
        where: { id },
        data: {
          status,
          reviewNotes: notes || null,
          reviewedAt: new Date(),
          reviewedById: req.user!.userId,
        },
      });

      // If APPROVED, automatically mark the contravention as COMPLETED
      // If REJECTED, keep it at current status (employee may need to take action)
      if (status === 'APPROVED') {
        await tx.contravention.update({
          where: { id: approval.contraventionId },
          data: {
            status: 'COMPLETED',
            resolvedDate: new Date(),
          },
        });
        console.log(`Contravention ${approval.contravention.referenceNo} marked as COMPLETED after approval`);
      }

      return updatedApproval;
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
