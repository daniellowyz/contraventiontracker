import prisma from '../config/database';
import { ContraventionStatus, Severity } from '../types';
import { AppError } from '../middleware/errorHandler';
import generateReferenceNumber from '../utils/generateRefNo';
import pointsService from './points.service';
import { CreateContraventionInput, UpdateContraventionInput, ContraventionFiltersInput } from '../validators/contravention.schema';
import { addBusinessDays } from '../utils/dateUtils';
import { ACKNOWLEDGMENT_CONFIG } from '../config/constants';

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
        summary: data.summary,
        severity,
        points,
        incidentDate: new Date(data.incidentDate),
        evidenceUrls: data.evidenceUrls || [],
        status: 'PENDING',
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

    return contravention;
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
      if (dateFrom) (where.incidentDate as Record<string, Date>).gte = new Date(dateFrom);
      if (dateTo) (where.incidentDate as Record<string, Date>).lte = new Date(dateTo);
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
   * Acknowledge a contravention
   */
  async acknowledge(id: string, acknowledgedById: string, notes?: string) {
    const contravention = await prisma.contravention.findUnique({
      where: { id },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    if (contravention.status !== 'PENDING') {
      throw new AppError('Contravention has already been processed', 400);
    }

    return prisma.contravention.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById,
        summary: notes ? `${contravention.summary || ''}\n\nAcknowledgment notes: ${notes}` : contravention.summary,
      },
      include: {
        employee: true,
        type: true,
      },
    });
  }

  /**
   * Submit a dispute
   */
  async submitDispute(contraventionId: string, submittedById: string, reason: string, evidenceUrls?: string[]) {
    const contravention = await prisma.contravention.findUnique({
      where: { id: contraventionId },
    });

    if (!contravention) {
      throw new AppError('Contravention not found', 404);
    }

    if (contravention.status !== 'PENDING' && contravention.status !== 'ACKNOWLEDGED') {
      throw new AppError('Cannot dispute this contravention', 400);
    }

    // Check dispute deadline
    const deadlineDate = addBusinessDays(contravention.createdAt, ACKNOWLEDGMENT_CONFIG.DEADLINE_DAYS);
    if (new Date() > deadlineDate) {
      throw new AppError('Dispute deadline has passed', 400);
    }

    // Create dispute
    const dispute = await prisma.dispute.create({
      data: {
        contraventionId,
        submittedById,
        reason,
        evidenceUrls: evidenceUrls || [],
        status: 'SUBMITTED',
      },
      include: {
        submittedBy: { select: { id: true, name: true } },
      },
    });

    // Update contravention status
    await prisma.contravention.update({
      where: { id: contraventionId },
      data: { status: 'DISPUTED' },
    });

    return dispute;
  }

  /**
   * Resolve a dispute
   */
  async resolveDispute(
    disputeId: string,
    decidedById: string,
    decision: 'UPHELD' | 'OVERTURNED',
    panelDecision: string
  ) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { contravention: true },
    });

    if (!dispute) {
      throw new AppError('Dispute not found', 404);
    }

    if (dispute.status !== 'SUBMITTED' && dispute.status !== 'UNDER_REVIEW') {
      throw new AppError('Dispute has already been resolved', 400);
    }

    // Update dispute
    const updatedDispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: decision,
        panelDecision,
        decidedAt: new Date(),
        decidedById,
      },
    });

    // Update contravention based on decision
    if (decision === 'OVERTURNED') {
      // Remove points
      const pointsRecord = await prisma.employeePoints.findUnique({
        where: { employeeId: dispute.contravention.employeeId },
      });

      if (pointsRecord) {
        const newTotal = Math.max(0, pointsRecord.totalPoints - dispute.contravention.points);
        const newLevel = pointsService.getEscalationLevel(newTotal);

        await prisma.employeePoints.update({
          where: { employeeId: dispute.contravention.employeeId },
          data: {
            totalPoints: newTotal,
            currentLevel: newLevel,
          },
        });
      }

      await prisma.contravention.update({
        where: { id: dispute.contraventionId },
        data: { status: 'RESOLVED', resolvedDate: new Date() },
      });
    } else {
      await prisma.contravention.update({
        where: { id: dispute.contraventionId },
        data: { status: 'CONFIRMED' },
      });
    }

    return updatedDispute;
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
