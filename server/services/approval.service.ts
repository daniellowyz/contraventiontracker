import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

// Lazy import Slack service
let slackServiceModule: typeof import('./slack.service') | null = null;
async function getSlackService() {
  if (!slackServiceModule) {
    try {
      slackServiceModule = await import('./slack.service');
    } catch (err) {
      console.error('Failed to load Slack service:', err);
      return null;
    }
  }
  return slackServiceModule.default;
}

// Lazy import notification service
let notificationServiceModule: typeof import('./notification.service') | null = null;
async function getNotificationService() {
  if (!notificationServiceModule) {
    try {
      notificationServiceModule = await import('./notification.service');
    } catch (err) {
      console.error('Failed to load notification service:', err);
      return null;
    }
  }
  return notificationServiceModule.notificationService;
}

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
            loggedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            team: {
              select: {
                id: true,
                name: true,
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

    // Update contravention status based on approval decision
    if (status === 'APPROVED') {
      // Approved via system: skip PENDING_UPLOAD and go directly to PENDING_REVIEW
      // The system approval acts as evidence, so no PDF upload is needed
      await prisma.contravention.update({
        where: { id: approval.contraventionId },
        data: {
          status: 'PENDING_REVIEW',
        },
      });
    } else if (status === 'REJECTED') {
      // Rejected: update status to REJECTED
      await prisma.contravention.update({
        where: { id: approval.contraventionId },
        data: {
          status: 'REJECTED',
        },
      });

      // Notify the submitter about the rejection
      this.notifyRejection(updatedApproval, reviewer.name, notes).catch((err) => {
        console.error('Failed to send rejection notification:', err);
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

  /**
   * Send notification about rejection to the submitter
   */
  private async notifyRejection(
    approval: {
      contravention: {
        id: string;
        referenceNo: string;
        employee: { name: string };
        type: { name: string; category: string };
        loggedBy: { id: string; name: string; email: string };
        team?: { name: string } | null;
      };
      reviewedBy: { name: string } | null;
    },
    reviewerName: string,
    notes?: string
  ) {
    const { contravention } = approval;
    const loggedBy = contravention.loggedBy;

    // Send in-app notification
    const notificationService = await getNotificationService();
    if (notificationService) {
      await notificationService.createNotification({
        userId: loggedBy.id,
        type: 'CONTRAVENTION_REJECTED',
        title: `Contravention ${contravention.referenceNo} Rejected`,
        message: `Your contravention for ${contravention.employee.name} (${contravention.type.name}) was rejected by ${reviewerName}.${notes ? ` Reason: ${notes}` : ''}`,
        data: {
          contraventionId: contravention.id,
          referenceNo: contravention.referenceNo,
          rejectedBy: reviewerName,
          reason: notes || null,
        },
      });
    }

    // Send Slack notification to team channel
    const slackService = await getSlackService();
    if (slackService && slackService.isConfigured()) {
      await slackService.announceRejection({
        referenceNo: contravention.referenceNo,
        employeeName: contravention.employee.name,
        teamName: contravention.team?.name || 'Personal',
        typeName: contravention.type.name,
        rejectedBy: reviewerName,
        reason: notes,
        contraventionId: contravention.id,
        loggedByName: loggedBy.name,
      });
    }
  }
}

export default new ApprovalService();
