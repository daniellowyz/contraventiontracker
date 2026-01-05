import prisma from '../config/database';
import { startOfMonth, endOfMonth, formatDate } from '../utils/dateUtils';
import { DashboardStats } from '../types';

export class ReportService {
  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    // Get total contraventions
    const totalContraventions = await prisma.contravention.count();

    // Get pending acknowledgments
    const pendingAcknowledgment = await prisma.contravention.count({
      where: { status: 'PENDING' },
    });

    // Get this month's contraventions
    const thisMonth = await prisma.contravention.count({
      where: {
        createdAt: {
          gte: startOfCurrentMonth,
          lte: endOfCurrentMonth,
        },
      },
    });

    // Get critical issues
    const criticalIssues = await prisma.contravention.count({
      where: {
        severity: 'CRITICAL',
        status: { not: 'RESOLVED' },
      },
    });

    // Get total value affected
    const valueSum = await prisma.contravention.aggregate({
      _sum: { valueSgd: true },
    });

    // Get status breakdown
    const statusCounts = await prisma.contravention.groupBy({
      by: ['status'],
      _count: true,
    });

    const byStatus: Record<string, number> = {
      PENDING: 0,
      ACKNOWLEDGED: 0,
      DISPUTED: 0,
      CONFIRMED: 0,
      RESOLVED: 0,
      ESCALATED: 0,
    };
    statusCounts.forEach((s) => {
      byStatus[s.status] = s._count;
    });

    // Get severity breakdown
    const severityCounts = await prisma.contravention.groupBy({
      by: ['severity'],
      _count: true,
    });

    const bySeverity: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    severityCounts.forEach((s) => {
      bySeverity[s.severity] = s._count;
    });

    // Get employees at risk (Level 3+)
    const employeesAtRisk = await prisma.employeePoints.findMany({
      where: {
        currentLevel: {
          in: ['LEVEL_3', 'LEVEL_4', 'LEVEL_5'],
        },
      },
      include: {
        employee: {
          select: { id: true, name: true },
        },
      },
      orderBy: { totalPoints: 'desc' },
      take: 10,
    });

    // Get monthly trend (last 12 months)
    const monthlyTrend: { month: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      const count = await prisma.contravention.count({
        where: {
          incidentDate: {
            gte: start,
            lte: end,
          },
        },
      });

      monthlyTrend.push({
        month: formatDate(start).substring(0, 7), // YYYY-MM
        count,
      });
    }

    return {
      summary: {
        totalContraventions,
        pendingAcknowledgment,
        thisMonth,
        criticalIssues,
        totalValueAffected: Number(valueSum._sum.valueSgd) || 0,
      },
      byStatus: byStatus as DashboardStats['byStatus'],
      bySeverity: bySeverity as DashboardStats['bySeverity'],
      employeesAtRisk: employeesAtRisk.map((ep) => ({
        id: ep.employee.id,
        name: ep.employee.name,
        points: ep.totalPoints,
        level: ep.currentLevel,
      })),
      monthlyTrend,
    };
  }

  /**
   * Get department breakdown
   */
  async getDepartmentBreakdown() {
    const departments = await prisma.department.findMany({
      include: {
        employees: {
          include: {
            contraventions: {
              select: { id: true, severity: true, points: true },
            },
          },
        },
      },
    });

    return departments.map((dept) => {
      const allContraventions = dept.employees.flatMap((e) => e.contraventions);
      const totalPoints = allContraventions.reduce((sum, c) => sum + c.points, 0);

      return {
        id: dept.id,
        name: dept.name,
        employeeCount: dept.employees.length,
        contraventionCount: allContraventions.length,
        totalPoints,
        bySeverity: {
          LOW: allContraventions.filter((c) => c.severity === 'LOW').length,
          MEDIUM: allContraventions.filter((c) => c.severity === 'MEDIUM').length,
          HIGH: allContraventions.filter((c) => c.severity === 'HIGH').length,
          CRITICAL: allContraventions.filter((c) => c.severity === 'CRITICAL').length,
        },
      };
    });
  }

  /**
   * Get contravention type breakdown
   */
  async getTypeBreakdown() {
    const types = await prisma.contraventionType.findMany({
      include: {
        _count: {
          select: { contraventions: true },
        },
        contraventions: {
          select: { valueSgd: true },
        },
      },
    });

    return types.map((type) => ({
      id: type.id,
      name: type.name,
      category: type.category,
      count: type._count.contraventions,
      totalValue: type.contraventions.reduce((sum, c) => sum + Number(c.valueSgd || 0), 0),
    }));
  }

  /**
   * Get repeat offenders
   */
  async getRepeatOffenders() {
    const employees = await prisma.user.findMany({
      include: {
        department: { select: { name: true } },
        pointsRecord: true,
        _count: {
          select: { contraventions: true },
        },
        contraventions: {
          orderBy: { incidentDate: 'desc' },
          take: 5,
          select: {
            id: true,
            referenceNo: true,
            severity: true,
            incidentDate: true,
            type: { select: { name: true } },
          },
        },
      },
      where: {
        contraventions: {
          some: {},
        },
      },
      orderBy: {
        contraventions: {
          _count: 'desc',
        },
      },
    });

    // Filter to those with 2+ contraventions
    return employees
      .filter((e) => e._count.contraventions >= 2)
      .map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department?.name || 'Unknown',
        contraventionCount: e._count.contraventions,
        totalPoints: e.pointsRecord?.totalPoints || 0,
        currentLevel: e.pointsRecord?.currentLevel,
        recentContraventions: e.contraventions,
      }));
  }

  /**
   * Export data (returns raw data for Excel export)
   */
  async exportData() {
    const contraventions = await prisma.contravention.findMany({
      include: {
        employee: {
          select: { name: true, employeeId: true, department: { select: { name: true } } },
        },
        type: { select: { name: true, category: true } },
        loggedBy: { select: { name: true } },
      },
      orderBy: { incidentDate: 'desc' },
    });

    return contraventions.map((c) => ({
      'Reference No': c.referenceNo,
      'Employee Name': c.employee.name,
      'Employee ID': c.employee.employeeId,
      Department: c.employee.department?.name || '',
      'Contravention Type': c.type.name,
      Category: c.type.category,
      Vendor: c.vendor || '',
      'Value (S$)': c.valueSgd ? Number(c.valueSgd) : '',
      Severity: c.severity,
      Points: c.points,
      Status: c.status,
      'Incident Date': formatDate(c.incidentDate),
      'Created Date': formatDate(c.createdAt),
      Description: c.description,
      'Logged By': c.loggedBy.name,
    }));
  }
}

export default new ReportService();
