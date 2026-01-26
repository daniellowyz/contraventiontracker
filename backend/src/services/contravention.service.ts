import prisma from '../config/database';
import { ContraventionStatus } from '../types';
import { AppError } from '../middleware/errorHandler';
import generateReferenceNumber from '../utils/generateRefNo';
import pointsService from './points.service';
import { notificationService } from './notification.service';
import { CreateContraventionInput, UpdateContraventionInput, UserUpdateContraventionInput, ResubmitContraventionInput, ContraventionFiltersInput } from '../validators/contravention.schema';
// Removed unused imports for old dispute workflow

export class ContraventionService {
  /**
   * Create a new contravention
   */
  async create(data: CreateContraventionInput, loggedById: string) {
    // Get the contravention type
    const contraventionType = await prisma.contraventionType.findUnique({
      where: { id: data.typeId },
    });

    if (!contraventionType) {
      throw new AppError('Invalid contravention type', 400);
    }

    // Validate customTypeName for "Others" type
    if (contraventionType.isOthers && !data.customTypeName?.trim()) {
      throw new AppError('Custom type name is required for "Others" contravention type', 400);
    }

    // Verify employee exists
    const employee = await prisma.user.findUnique({
      where: { id: data.employeeId },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    // Get points from contravention type (severity is now derived from type, not stored)
    const points = contraventionType.defaultPoints;

    // Generate reference number
    const referenceNo = await generateReferenceNumber();

    // Status depends on whether approver is selected and if PDF is uploaded
    // If approver selected (system approval): PENDING_APPROVAL -> (approved) -> PENDING_REVIEW -> COMPLETED
    //   (System approval acts as evidence, no PDF upload needed)
    // If no approver and PDF uploaded (external approval): PENDING_REVIEW
    // If no approver and no PDF (external approval pending): PENDING_UPLOAD
    const initialStatus = data.authorizerEmail
      ? 'PENDING_APPROVAL'
      : (data.approvalPdfUrl ? 'PENDING_REVIEW' : 'PENDING_UPLOAD');

    // Create the contravention
    const contravention = await prisma.contravention.create({
      data: {
        referenceNo,
        employeeId: data.employeeId,
        loggedById,
        typeId: data.typeId,
        teamId: data.teamId,  // Team for tracking
        customTypeName: data.customTypeName,  // For "Others" type
        vendor: data.vendor,
        valueSgd: data.valueSgd,
        description: data.description,
        justification: data.justification,
        mitigation: data.mitigation,
        summary: data.summary,
        points,
        incidentDate: new Date(data.incidentDate),
        evidenceUrls: data.evidenceUrls || [],
        authorizerEmail: data.authorizerEmail,
        approvalPdfUrl: data.approvalPdfUrl,
        status: initialStatus,
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true, department: true },
        },
        type: true,
        loggedBy: {
          select: { id: true, name: true },
        },
      },
    });

    // Add points to employee
    await pointsService.addPoints(
      data.employeeId,
      points,
      `${referenceNo}: ${contraventionType.name}`,
      contravention.id
    );

    // If approver email is provided, create ContraventionApproval record
    if (data.authorizerEmail) {
      // Look up the approver by email
      const approver = await prisma.user.findUnique({
        where: { email: data.authorizerEmail.toLowerCase() },
      });

      if (approver) {
        // Create the approval request record
        await prisma.contraventionApproval.create({
          data: {
            contraventionId: contravention.id,
            approverId: approver.id,
            status: 'PENDING',
          },
        });
        console.log(`Created approval request for ${data.authorizerEmail} on ${referenceNo}`);

        // Send in-app notification and email to the approver
        notificationService.notifyApprovalRequested({
          approverUserId: approver.id,
          approverEmail: approver.email,
          approverName: approver.name,
          contraventionId: contravention.id,
          referenceNo: contravention.referenceNo,
          employeeName: employee.name,
          typeName: contraventionType.name,
          points: points,
        }).catch((err) => {
          console.error('Failed to send approval notification:', err);
        });
      } else {
        console.warn(`Approver not found with email: ${data.authorizerEmail}`);
      }

      // Send webhook to Google Apps Script for email notification (legacy)
      this.sendApprovalWebhook(contravention, data).catch((err) => {
        console.error('Failed to send approval webhook:', err);
      });
    }

    // Send notification to the employee (in-app + email)
    notificationService.notifyContraventionLogged({
      employeeUserId: employee.id,
      employeeEmail: employee.email,
      employeeName: employee.name,
      contraventionId: contravention.id,
      referenceNo: contravention.referenceNo,
      typeName: contraventionType.name,
      points: points,
    }).catch((err) => {
      console.error('Failed to send contravention notification:', err);
    });

    return contravention;
  }

  /**
   * Send webhook to Google Apps Script for email notification
   */
  private async sendApprovalWebhook(contravention: any, data: CreateContraventionInput) {
    const webhookUrl = process.env.APPROVAL_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log('APPROVAL_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const payload = {
      referenceNo: contravention.referenceNo,
      approverEmail: data.authorizerEmail,
      employeeEmail: contravention.employee.email,
      employeeName: contravention.employee.name,
      contraventionType: contravention.type.name,
      vendor: data.vendor || 'N/A',
      valueSgd: data.valueSgd ? `$${data.valueSgd.toLocaleString()}` : 'N/A',
      incidentDate: new Date(data.incidentDate).toLocaleDateString('en-SG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      description: data.description,
      justification: data.justification,
      mitigation: data.mitigation,
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      console.log('Approval webhook sent successfully for:', contravention.referenceNo);
    } catch (error) {
      console.error('Error sending approval webhook:', error);
      throw error;
    }
  }

  /**
   * Get all contraventions with filters and pagination
   */
  async findAll(filters: ContraventionFiltersInput) {
    const { status, typeId, departmentId, employeeId, dateFrom, dateTo, search } = filters;
    // Ensure page and limit are numbers (query params can come as strings)
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (typeId) where.typeId = typeId;
    if (employeeId) where.employeeId = employeeId;

    if (departmentId) {
      where.employee = { departmentId };
    }

    if (dateFrom || dateTo) {
      where.incidentDate = {};
      if (dateFrom) {
        // Parse date string as UTC start of day
        const [year, month, day] = dateFrom.split('-').map(Number);
        (where.incidentDate as Record<string, Date>).gte = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      }
      if (dateTo) {
        // Parse date string as UTC end of day (23:59:59.999)
        const [year, month, day] = dateTo.split('-').map(Number);
        (where.incidentDate as Record<string, Date>).lte = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      }
    }

    if (search) {
      where.OR = [
        { referenceNo: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { employee: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [contraventions, total] = await Promise.all([
      prisma.contravention.findMany({
        where,
        include: {
          employee: {
            select: { id: true, name: true, email: true, department: { select: { name: true } } },
          },
          type: {
            select: { id: true, name: true, category: true },
          },
          loggedBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contravention.count({ where }),
    ]);

    return {
      data: contraventions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single contravention by ID
   */
  async findById(id: string) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, name: true, email: true, department: true },
        },
        type: true,
        team: {
          select: { id: true, name: true, isPersonal: true },
        },
        loggedBy: {
          select: { id: true, name: true },
        },
        acknowledgedBy: {
          select: { id: true, name: true },
        },
        approvalRequests: {
          include: {
            approver: {
              select: { id: true, name: true, email: true },
            },
            reviewedBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    return contravention;
  }

  /**
   * Update a contravention
   */
  async update(id: string, data: UpdateContraventionInput) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    // Handle points adjustment (before employee reassignment in case both happen)
    if (data.points !== undefined && data.points !== contravention.points) {
      const pointsDiff = data.points - contravention.points;
      const targetEmployeeId = data.employeeId || contravention.employeeId;

      // Adjust the employee's total points by the difference
      const pointsRecord = await prisma.employeePoints.findUnique({
        where: { employeeId: targetEmployeeId },
      });

      if (pointsRecord) {
        const newTotal = Math.max(0, pointsRecord.totalPoints + pointsDiff);
        const newLevel = pointsService.getEscalationLevel(newTotal);

        await prisma.employeePoints.update({
          where: { employeeId: targetEmployeeId },
          data: {
            totalPoints: newTotal,
            currentLevel: newLevel,
          },
        });
        console.log(`Adjusted points for contravention ${contravention.referenceNo}: ${contravention.points} → ${data.points} (diff: ${pointsDiff})`);
      }
    }

    // Handle employee reassignment with points transfer
    if (data.employeeId && data.employeeId !== contravention.employeeId) {
      // Verify new employee exists
      const newEmployee = await prisma.user.findUnique({
        where: { id: data.employeeId },
      });

      if (!newEmployee) {
        throw new AppError('New employee not found', 404);
      }

      // Transfer points: remove from old employee, add to new employee
      // Use the updated points value if provided, otherwise use the original
      const pointsToTransfer = data.points !== undefined ? data.points : contravention.points;

      // Remove points from old employee
      const oldPointsRecord = await prisma.employeePoints.findUnique({
        where: { employeeId: contravention.employeeId },
      });

      if (oldPointsRecord) {
        const newOldTotal = Math.max(0, oldPointsRecord.totalPoints - contravention.points);
        const newOldLevel = pointsService.getEscalationLevel(newOldTotal);

        await prisma.employeePoints.update({
          where: { employeeId: contravention.employeeId },
          data: {
            totalPoints: newOldTotal,
            currentLevel: newOldLevel,
          },
        });
      }

      // Add points to new employee
      await pointsService.addPoints(
        data.employeeId,
        pointsToTransfer,
        `Reassigned: ${contravention.referenceNo}`,
        contravention.id
      );
    }

    // Prepare update data (exclude employeeId from spread to handle it separately)
    const { employeeId, ...otherData } = data;

    return prisma.contravention.update({
      where: { id },
      data: {
        ...otherData,
        ...(employeeId && { employeeId }),
        valueSgd: data.valueSgd,
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true, department: true },
        },
        type: true,
      },
    });
  }

  /**
   * Upload approval PDF and move to pending review
   * Admins can upload/replace approval documents regardless of status
   */
  async uploadApproval(id: string, approvalPdfUrl: string, uploadedById: string, isAdmin: boolean = false) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    // Non-admins can only upload when status is PENDING_UPLOAD
    if (!isAdmin && contravention.status !== 'PENDING_UPLOAD') {
      throw new AppError('Contravention is not pending approval upload', 400);
    }

    // Determine new status based on current status
    // If already COMPLETED, keep it COMPLETED (admin just replacing doc)
    // Otherwise, move to PENDING_REVIEW
    const newStatus = contravention.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING_REVIEW';

    return prisma.contravention.update({
      where: { id },
      data: {
        status: newStatus,
        approvalPdfUrl,
        acknowledgedAt: new Date(),
        acknowledgedById: uploadedById,
      },
      include: {
        employee: true,
        type: true,
      },
    });
  }

  /**
   * Mark contravention as completed (admin review)
   */
  async markCompleted(id: string, reviewedById: string) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    if (contravention.status !== 'PENDING_REVIEW') {
      throw new AppError('Contravention is not pending review', 400);
    }

    return prisma.contravention.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        resolvedDate: new Date(),
      },
      include: {
        employee: true,
        type: true,
      },
    });
  }

  /**
   * Submit a dispute (legacy - kept for backwards compatibility)
   */
  async submitDispute(contraventionId: string, submittedById: string, reason: string, evidenceUrls?: string[]) {
    const contravention = await prisma.contravention.findUnique({
      where: { id: contraventionId },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    // Disputes are no longer supported in the new workflow
    throw new AppError('Dispute functionality has been removed', 400);
  }

  /**
   * Resolve a dispute (legacy - kept for backwards compatibility)
   */
  async resolveDispute(
    disputeId: string,
    decidedById: string,
    decision: 'UPHELD' | 'OVERTURNED',
    panelDecision: string
  ) {
    // Disputes are no longer supported in the new workflow
    throw new AppError('Dispute functionality has been removed', 400);
  }

  /**
   * Get contraventions for a specific employee
   */
  async findByEmployee(employeeId: string) {
    return prisma.contravention.findMany({
      where: { employeeId },
      include: {
        type: true,
        disputes: true,
      },
      orderBy: { incidentDate: 'desc' },
    });
  }

  /**
   * Delete a contravention (admin only)
   */
  async delete(id: string) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    // Reverse points
    const pointsRecord = await prisma.employeePoints.findUnique({
      where: { employeeId: contravention.employeeId },
    });

    if (pointsRecord) {
      const newTotal = Math.max(0, pointsRecord.totalPoints - contravention.points);
      const newLevel = pointsService.getEscalationLevel(newTotal);

      await prisma.employeePoints.update({
        where: { employeeId: contravention.employeeId },
        data: {
          totalPoints: newTotal,
          currentLevel: newLevel,
        },
      });
    }

    // Delete related disputes first
    await prisma.dispute.deleteMany({
      where: { contraventionId: id },
    });

    // Delete related approval requests
    await prisma.contraventionApproval.deleteMany({
      where: { contraventionId: id },
    });

    return prisma.contravention.delete({
      where: { id },
    });
  }

  /**
   * Update a contravention by the user who logged it
   * Users can only edit contraventions they created and only when status is PENDING_APPROVAL or REJECTED
   */
  async userUpdate(id: string, userId: string, data: UserUpdateContraventionInput) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true } },
        type: { select: { id: true, name: true } },
      },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    // Check if user is the one who logged this contravention
    if (contravention.loggedById !== userId) {
      throw new AppError('You can only edit contraventions you created', 403);
    }

    // Check status - users can only edit when PENDING_APPROVAL or REJECTED
    const editableStatuses = ['PENDING_APPROVAL', 'REJECTED'];
    if (!editableStatuses.includes(contravention.status)) {
      throw new AppError('This contravention can no longer be edited. It has already been approved.', 400);
    }

    // Update the contravention with allowed fields only
    const updated = await prisma.contravention.update({
      where: { id },
      data: {
        vendor: data.vendor,
        valueSgd: data.valueSgd,
        description: data.description,
        justification: data.justification,
        mitigation: data.mitigation,
        summary: data.summary,
        evidenceUrls: data.evidenceUrls,
        authorizerEmail: data.authorizerEmail,
      },
      include: {
        employee: { select: { id: true, name: true, email: true, department: true } },
        type: true,
        team: { select: { id: true, name: true, isPersonal: true } },
        loggedBy: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  /**
   * Resubmit a rejected contravention
   * This resets the status back to PENDING_APPROVAL and creates a new approval request
   */
  async resubmit(id: string, userId: string, data: ResubmitContraventionInput) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true, email: true } },
        type: { select: { id: true, name: true } },
        loggedBy: { select: { id: true, name: true } },
      },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    // Check if user is the one who logged this contravention
    if (contravention.loggedById !== userId) {
      throw new AppError('You can only resubmit contraventions you created', 403);
    }

    // Check status - can only resubmit when REJECTED
    if (contravention.status !== 'REJECTED') {
      throw new AppError('Only rejected contraventions can be resubmitted', 400);
    }

    // Determine new approver email (use provided or existing)
    const approverEmail = data.authorizerEmail || contravention.authorizerEmail;

    if (!approverEmail) {
      throw new AppError('An approver email is required to resubmit', 400);
    }

    // Look up the approver
    const approver = await prisma.user.findUnique({
      where: { email: approverEmail.toLowerCase() },
    });

    if (!approver) {
      throw new AppError('Approver not found with the provided email', 404);
    }

    if (approver.role !== 'APPROVER' && approver.role !== 'ADMIN') {
      throw new AppError('The specified user is not an approver', 400);
    }

    // Update the contravention
    const updated = await prisma.contravention.update({
      where: { id },
      data: {
        vendor: data.vendor ?? contravention.vendor,
        valueSgd: data.valueSgd ?? contravention.valueSgd,
        description: data.description,
        justification: data.justification,
        mitigation: data.mitigation,
        summary: data.summary ?? contravention.summary,
        evidenceUrls: data.evidenceUrls ?? contravention.evidenceUrls,
        authorizerEmail: approverEmail,
        status: 'PENDING_APPROVAL',
      },
      include: {
        employee: { select: { id: true, name: true, email: true, department: true } },
        type: true,
        team: { select: { id: true, name: true, isPersonal: true } },
        loggedBy: { select: { id: true, name: true } },
      },
    });

    // Create new approval request
    await prisma.contraventionApproval.create({
      data: {
        contraventionId: id,
        approverId: approver.id,
        status: 'PENDING',
      },
    });

    // Send notification to the approver
    notificationService.notifyApprovalRequested({
      approverUserId: approver.id,
      approverEmail: approver.email,
      approverName: approver.name,
      contraventionId: id,
      referenceNo: updated.referenceNo,
      employeeName: updated.employee.name,
      typeName: updated.type.name,
      points: updated.points,
    }).catch((err: Error) => {
      console.error('Failed to send resubmission approval notification:', err);
    });

    return updated;
  }

  /**
   * Mark contravention as complete - transitions from PENDING_REVIEW to COMPLETED (admin only)
   */
  async markComplete(id: string, completedById: string, notes?: string) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    if (contravention.status !== 'PENDING_REVIEW') {
      throw new AppError('Contravention is not pending review', 400);
    }

    const updated = await prisma.contravention.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        resolvedDate: new Date(),
        acknowledgedById: completedById,
        acknowledgedAt: new Date(),
        summary: notes ? `${contravention.summary || ''}\n\nAdmin notes: ${notes}` : contravention.summary,
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true, department: true },
        },
        type: true,
        team: { select: { id: true, name: true } },
        loggedBy: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  /**
   * Get count of contraventions pending admin review
   */
  async getPendingReviewCount(): Promise<number> {
    return prisma.contravention.count({
      where: { status: 'PENDING_REVIEW' },
    });
  }

  /**
   * Get count of rejected contraventions logged by a specific user
   * These are contraventions that the user submitted and were rejected, requiring resubmission
   */
  async getMyRejectedCount(userId: string): Promise<number> {
    return prisma.contravention.count({
      where: {
        loggedById: userId,
        status: 'REJECTED',
      },
    });
  }
}

export default new ContraventionService();
