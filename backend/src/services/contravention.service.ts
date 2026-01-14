import prisma from '../config/database';
import { ContraventionStatus, Severity } from '../types';
import { AppError } from '../middleware/errorHandler';
import generateReferenceNumber from '../utils/generateRefNo';
import pointsService from './points.service';
import { notificationService } from './notification.service';
import { CreateContraventionInput, UpdateContraventionInput, ContraventionFiltersInput } from '../validators/contravention.schema';
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

    // Determine initial status based on pathway:
    // - If approvalPdfUrl provided: Pathway B (already has approval) → PENDING_REVIEW
    // - If authorizerEmail provided: Pathway A (seeking approval) → PENDING_UPLOAD
    // - Otherwise: PENDING_UPLOAD (default)
    const initialStatus = data.approvalPdfUrl ? 'PENDING_REVIEW' : 'PENDING_UPLOAD';

    // Create the contravention
    const contravention = await prisma.contravention.create({
      data: {
        referenceNo,
        employeeId: data.employeeId,
        loggedById,
        typeId: data.typeId,
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
          severity: severity,
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
      severity: severity,
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
    const { page, limit, status, severity, typeId, departmentId, employeeId, dateFrom, dateTo, search } = filters;

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (severity) where.severity = severity;
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
        loggedBy: {
          select: { id: true, name: true },
        },
        acknowledgedBy: {
          select: { id: true, name: true },
        },
        disputes: {
          include: {
            submittedBy: { select: { id: true, name: true } },
            decidedBy: { select: { id: true, name: true } },
          },
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

    return prisma.contravention.delete({
      where: { id },
    });
  }
}

export default new ContraventionService();
