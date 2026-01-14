import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class ApprovalService {
  /**
   * Get pending approvals for a specific approver
   */
  async getPendingApprovals(approverId: string) {
    const approvals = await prisma.contraventionApproval.findMany({
      where: {
        approverId,
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
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' },
      ],
    });

    return {
      approvals,
      total: approvals.length,
    };
  }

  /**
   * Get all approvals (for admins)
   */
  async getAllApprovals() {
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
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' },
      ],
    });

    return {
      approvals,
      total: approvals.length,
    };
  }

  /**
   * Create an approval request for a contravention
   */
  async createApprovalRequest(contraventionId: string, approverId: string) {
    // Check if contravention exists
    const contravention = await prisma.contravention.findUnique({
      where: { id: contraventionId },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    // Check if approver exists and has APPROVER role
    const approver = await prisma.user.findUnique({
      where: { id: approverId },
    });

    if (!approver) {
      throw new AppError('Approver not found', 404);
    }

    if (approver.role !== 'APPROVER' && approver.role !== 'ADMIN') {
      throw new AppError('Selected user is not an approver', 400);
    }

    // Check if approval request already exists
    const existingApproval = await prisma.contraventionApproval.findUnique({
      where: {
        contraventionId_approverId: {
          contraventionId,
          approverId,
        },
      },
    });

    if (existingApproval) {
      throw new AppError('Approval request already exists for this approver', 409);
    }

    // Create the approval request
    const approval = await prisma.contraventionApproval.create({
      data: {
        contraventionId,
        approverId,
        status: 'PENDING',
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
    });

    return approval;
  }

  /**
   * Review an approval request (approve or reject)
   */
  async reviewApproval(
    approvalId: string,
    reviewerId: string,
    status: 'APPROVED' | 'REJECTED',
    notes?: string
  ) {
    const approval = await prisma.contraventionApproval.findUnique({
      where: { id: approvalId },
      include: {
        approver: true,
      },
    });

    if (!approval) {
      throw new AppError('Approval request not found', 404);
    }

    if (approval.status !== 'PENDING') {
      throw new AppError('Approval request has already been reviewed', 400);
    }

    // Check if reviewer is the assigned approver or an admin
    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
    });

    if (!reviewer) {
      throw new AppError('Reviewer not found', 404);
    }

    const isAssignedApprover = approval.approverId === reviewerId;
    const isAdmin = reviewer.role === 'ADMIN';

    if (!isAssignedApprover && !isAdmin) {
      throw new AppError('Not authorized to review this approval', 403);
    }

    // Update the approval
    const updatedApproval = await prisma.contraventionApproval.update({
      where: { id: approvalId },
      data: {
        status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
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
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // If approved, update the contravention status to PENDING_REVIEW
    if (status === 'APPROVED') {
      await prisma.contravention.update({
        where: { id: approval.contraventionId },
        data: {
          status: 'PENDING_REVIEW',
        },
      });
    }

    return updatedApproval;
  }

  /**
   * Get list of available approvers
   */
  async getApprovers() {
    const approvers = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'APPROVER' },
          { role: 'ADMIN' },
        ],
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return approvers;
  }
}

export default new ApprovalService();
