import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import generateReferenceNumber from '../utils/generateRefNo';
import pointsService from './points.service';
import { CreateContraventionInput, UpdateContraventionInput, ContraventionFiltersInput } from '../validators/contravention.schema';
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
        // If PDF is already uploaded, go to PENDING_REVIEW, otherwise PENDING_UPLOAD
        status: data.approvalPdfUrl ? 'PENDING_REVIEW' : 'PENDING_UPLOAD',
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

    // Send webhook to Google Apps Script if approver email is provided
    if (data.authorizerEmail) {
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

    return prisma.contravention.update({
      where: { id },
      data: {
        ...data,
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
   */
  async uploadApproval(id: string, approvalPdfUrl: string) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    if (contravention.status !== 'PENDING_UPLOAD') {
      throw new AppError('Contravention is not pending approval upload', 400);
    }

    const updated = await prisma.contravention.update({
      where: { id },
      data: {
        status: 'PENDING_REVIEW',
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
