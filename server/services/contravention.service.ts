import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import generateReferenceNumber from '../utils/generateRefNo';
import pointsService from './points.service';
import { CreateContraventionInput, UpdateContraventionInput, UserUpdateContraventionInput, ResubmitContraventionInput, ContraventionFiltersInput } from '../validators/contravention.schema';

// Lazy import notification service to avoid module loading issues in Vercel
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

    // Verify employee exists
    const employee = await prisma.user.findUnique({
      where: { id: data.employeeId },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    // Calculate severity and points
    const severity = contraventionType.defaultSeverity;
    const points = pointsService.calculatePoints(
      contraventionType.defaultPoints,
      severity,
      data.valueSgd
    );

    // Generate reference number
    const referenceNo = await generateReferenceNumber();

    // Create the contravention
    const contravention = await prisma.contravention.create({
      data: {
        referenceNo,
        employeeId: data.employeeId,
        loggedById,
        typeId: data.typeId,
        teamId: data.teamId,  // Optional team for tracking
        vendor: data.vendor,
        valueSgd: data.valueSgd,
        description: data.description,
        justification: data.justification,
        mitigation: data.mitigation,
        summary: data.summary,
        severity,
        points,
        incidentDate: new Date(data.incidentDate),
        evidenceUrls: data.evidenceUrls || [],
        supportingDocs: data.supportingDocs || [],
        authorizerEmail: data.authorizerEmail,
        approvalPdfUrl: data.approvalPdfUrl,
        // Status depends on whether approver is selected and if PDF is uploaded
        // If approver selected (system approval): PENDING_APPROVAL -> (approved) -> PENDING_REVIEW -> COMPLETED
        //   (System approval acts as evidence, no PDF upload needed)
        // If no approver and PDF uploaded (external approval): PENDING_REVIEW
        // If no approver and no PDF (external approval pending): PENDING_UPLOAD
        status: data.authorizerEmail
          ? 'PENDING_APPROVAL'
          : (data.approvalPdfUrl ? 'PENDING_REVIEW' : 'PENDING_UPLOAD'),
      },
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
      },
    });

    // Add points to employee
    await pointsService.addPoints(
      data.employeeId,
      points,
      `${referenceNo}: ${contraventionType.name}`,
      contravention.id
    );

    // Send notification to the employee (in-app + email)
    getNotificationService().then((notificationSvc) => {
      if (notificationSvc) {
        notificationSvc.notifyContraventionLogged({
          employeeUserId: employee.id,
          employeeEmail: employee.email,
          employeeName: employee.name,
          contraventionId: contravention.id,
          referenceNo,
          typeName: contraventionType.name,
          severity,
          points,
        }).catch((err: Error) => {
          console.error('Failed to send contravention notification:', err);
        });
      }
    }).catch((err: Error) => {
      console.error('Failed to load notification service:', err);
    });

    // Note: We no longer announce new contraventions on creation
    // Only APPROVED contraventions are announced to the management Slack channel
    // This is done in markComplete() after admin approval

    // Send webhook to Google Apps Script if approver email is provided
    if (data.authorizerEmail) {
      // Look up the approver by email and send notification
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
        getNotificationService().then((notificationSvc) => {
          if (notificationSvc) {
            notificationSvc.notifyApprovalRequested({
              approverUserId: approver.id,
              approverEmail: approver.email,
              approverName: approver.name,
              contraventionId: contravention.id,
              referenceNo,
              employeeName: employee.name,
              submitterName: contravention.loggedBy?.name || 'A user',
              typeName: contraventionType.name,
              severity,
            }).catch((err: Error) => {
              console.error('Failed to send approval notification:', err);
            });
          }
        }).catch((err: Error) => {
          console.error('Failed to load notification service:', err);
        });
      } else {
        console.warn(`Approver not found with email: ${data.authorizerEmail}`);
      }

      // Send webhook to Google Apps Script for email notification (legacy)
      this.sendApprovalWebhook(contravention, data).catch((err) => {
        console.error('Failed to send approval webhook:', err);
      });
    }

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
    const { page, limit, status, severity, typeId, departmentId, employeeId, teamId, loggedById, dateFrom, dateTo, search } = filters;

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (typeId) where.typeId = typeId;
    if (employeeId) where.employeeId = employeeId;
    if (teamId) where.teamId = teamId;
    if (loggedById) where.loggedById = loggedById;

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
          team: {
            select: { id: true, name: true, isPersonal: true },
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
      const points = contravention.points;

      // Remove points from old employee
      const oldPointsRecord = await prisma.employeePoints.findUnique({
        where: { employeeId: contravention.employeeId },
      });

      if (oldPointsRecord) {
        const newOldTotal = Math.max(0, oldPointsRecord.totalPoints - points);
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
        points,
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
   * Upload approval PDF - transitions from PENDING_UPLOAD to PENDING_REVIEW
   * Admins can upload/replace approval documents regardless of status
   */
  async uploadApproval(id: string, approvalPdfUrl: string, isAdmin: boolean = false) {
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

    const updated = await prisma.contravention.update({
      where: { id },
      data: {
        status: newStatus,
        approvalPdfUrl,
      },
      include: {
        employee: {
          select: { id: true, name: true, email: true, department: true },
        },
        type: true,
        loggedBy: { select: { id: true, name: true } },
      },
    });

    // Notify ops channel when transitioning to PENDING_REVIEW
    if (newStatus === 'PENDING_REVIEW' && contravention.status !== 'PENDING_REVIEW') {
      getSlackService().then(async (slackSvc) => {
        if (slackSvc && slackSvc.isConfigured()) {
          await slackSvc.notifyPendingAdminReview({
            referenceNo: contravention.referenceNo,
            employeeName: updated.employee.name,
            typeName: updated.type.name,
            severity: contravention.severity,
            reason: 'Approval document uploaded - awaiting admin final review',
            contraventionId: id,
          });
        }
      }).catch((err) => {
        console.error('Failed to notify ops channel:', err);
      });
    }

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
        loggedBy: { select: { id: true, name: true } },
      },
    });

    // Notify the employee that their contravention has been completed
    const notificationSvc = await getNotificationService();
    if (notificationSvc) {
      await notificationSvc.notifyContraventionAcknowledged({
        adminUserId: contravention.employeeId,
        contraventionId: id,
        referenceNo: contravention.referenceNo,
        employeeName: updated.employee.name,
      });
    }

    // Announce APPROVED contravention to management Slack channel
    getSlackService().then(async (slackSvc) => {
      if (slackSvc && slackSvc.isConfigured()) {
        await slackSvc.announceApprovedContravention({
          referenceNo: contravention.referenceNo,
          employeeName: updated.employee.name,
          typeName: updated.type.name,
          severity: contravention.severity,
          points: contravention.points,
          valueSgd: contravention.valueSgd ? Number(contravention.valueSgd) : undefined,
          incidentDate: contravention.incidentDate.toLocaleDateString('en-SG', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          description: contravention.description,
          contraventionId: id,
        });
      }
    }).catch((err) => {
      console.error('Failed to announce approved contravention to Slack:', err);
    });

    return updated;
  }

  /**
   * Get contraventions for a specific employee
   */
  async findByEmployee(employeeId: string) {
    return prisma.contravention.findMany({
      where: { employeeId },
      include: {
        type: true,
      },
      orderBy: { incidentDate: 'desc' },
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
        supportingDocs: data.supportingDocs,
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
        supportingDocs: data.supportingDocs ?? (contravention.supportingDocs || []),
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

    // Create or update approval request
    await prisma.contraventionApproval.upsert({
      where: {
        contraventionId_approverId: {
          contraventionId: id,
          approverId: approver.id,
        },
      },
      update: {
        status: 'PENDING',
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
      },
      create: {
        contraventionId: id,
        approverId: approver.id,
        status: 'PENDING',
      },
    });

    // Send notification to the approver
    getNotificationService().then((notificationSvc) => {
      if (notificationSvc) {
        notificationSvc.notifyApprovalRequested({
          approverUserId: approver.id,
          approverEmail: approver.email,
          approverName: approver.name,
          contraventionId: id,
          referenceNo: contravention.referenceNo,
          employeeName: contravention.employee.name,
          submitterName: contravention.loggedBy?.name || 'A user',
          typeName: contravention.type.name,
          severity: contravention.severity,
        }).catch((err: Error) => {
          console.error('Failed to send resubmission approval notification:', err);
        });
      }
    }).catch((err: Error) => {
      console.error('Failed to load notification service:', err);
    });

    return updated;
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

    return prisma.contravention.delete({
      where: { id },
    });
  }
}

export default new ContraventionService();
