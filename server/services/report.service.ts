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
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Run ALL queries in parallel for maximum speed
    const [
      totalContraventions,
      pendingAcknowledgment,
      thisMonth,
      highPointsIssues,
      valueSum,
      statusCounts,
      employeesAtRisk,
      contraventionsByMonth,
      contraventionsForPoints,
    ] = await Promise.all([
      // Total contraventions
      prisma.contravention.count(),
      // Pending approval uploads
      prisma.contravention.count({
        where: { status: 'PENDING_UPLOAD' },
      }),
      // This month's contraventions
      prisma.contravention.count({
        where: {
          createdAt: {
            gte: startOfCurrentMonth,
            lte: endOfCurrentMonth,
          },
        },
      }),
      // High points employees (Stage 2+ / 10+ points) - replaces criticalIssues
      prisma.employeePoints.count({
        where: {
          totalPoints: { gte: 10 },
        },
      }),
      // Total value affected
      prisma.contravention.aggregate({
        _sum: { valueSgd: true },
      }),
      // Status breakdown
      prisma.contravention.groupBy({
        by: ['status'],
        _count: true,
      }),
      // Employees at risk (Stage 2 and 3 - 10+ points)
      prisma.employeePoints.findMany({
        where: {
          currentLevel: {
            in: ['LEVEL_2', 'LEVEL_3'],
          },
        },
        include: {
          employee: {
            select: { id: true, name: true },
          },
        },
        orderBy: { totalPoints: 'desc' },
        take: 10,
      }),
      // Monthly trend (last 12 months)
      prisma.contravention.findMany({
        where: {
          incidentDate: {
            gte: twelveMonthsAgo,
          },
        },
        select: {
          incidentDate: true,
        },
      }),
      // All contraventions for points breakdown
      prisma.contravention.findMany({
        select: {
          points: true,
        },
      }),
    ]);

    // Process status counts
    const byStatus: Record<string, number> = {
      PENDING_UPLOAD: 0,
      PENDING_REVIEW: 0,
      COMPLETED: 0,
    };
    statusCounts.forEach((s) => {
      byStatus[s.status] = s._count;
    });

    // Build month counts map
    const monthCounts: Record<string, number> = {};
    contraventionsByMonth.forEach((c) => {
      const month = formatDate(c.incidentDate).substring(0, 7); // YYYY-MM
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });

    // Generate all 12 months (including zeros)
    const monthlyTrend: { month: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = formatDate(startOfMonth(date)).substring(0, 7);
      monthlyTrend.push({
        month,
        count: monthCounts[month] || 0,
      });
    }

    // Calculate byPoints breakdown (1-2, 3-4, 5+)
    const byPoints: Record<string, number> = {
      '1-2': 0,
      '3-4': 0,
      '5+': 0,
    };
    contraventionsForPoints.forEach((c) => {
      const pts = c.points;
      if (pts >= 1 && pts <= 2) {
        byPoints['1-2']++;
      } else if (pts >= 3 && pts <= 4) {
        byPoints['3-4']++;
      } else if (pts >= 5) {
        byPoints['5+']++;
      }
    });

    return {
      summary: {
        totalContraventions,
        pendingAcknowledgment,
        thisMonth,
        highPointsIssues,
        totalValueAffected: Number(valueSum._sum.valueSgd) || 0,
      },
      byStatus: byStatus as DashboardStats['byStatus'],
      byPoints,
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
              select: { id: true, points: true },
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
      };
    });
  }

  /**
   * Get team breakdown (only teams with at least one contravention)
   */
  async getTeamBreakdown() {
    const teams = await prisma.team.findMany({
      where: { contraventions: { some: {} } },
      include: {
        contraventions: {
          select: { employeeId: true, points: true },
        },
      },
    });

    return teams.map((team) => {
      const contraventions = team.contraventions;
      const employeeIds = new Set(contraventions.map((c) => c.employeeId));
      const totalPoints = contraventions.reduce((sum, c) => sum + c.points, 0);

      return {
        id: team.id,
        name: team.name,
        employeeCount: employeeIds.size,
        contraventionCount: contraventions.length,
        totalPoints,
        byPoints: {
          '1-2': contraventions.filter((c) => c.points >= 1 && c.points <= 2).length,
          '3-4': contraventions.filter((c) => c.points >= 3 && c.points <= 4).length,
          '5+': contraventions.filter((c) => c.points >= 5).length,
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
            points: true,
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
