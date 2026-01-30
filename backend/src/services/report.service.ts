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

    // Get pending approval uploads
    const pendingAcknowledgment = await prisma.contravention.count({
      where: { status: 'PENDING_UPLOAD' },
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

    // Get high points issues (5+ points, not completed)
    const highPointsIssues = await prisma.contravention.count({
      where: {
        points: { gte: 5 },
        status: { not: 'COMPLETED' },
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
      PENDING_UPLOAD: 0,
      PENDING_REVIEW: 0,
      COMPLETED: 0,
    };
    statusCounts.forEach((s) => {
      byStatus[s.status] = s._count;
    });

    // Get points breakdown
    const allContraventionsForPoints = await prisma.contravention.findMany({
      select: { points: true },
    });

    const byPoints: Record<string, number> = {
      '1-2': 0,
      '3-4': 0,
      '5+': 0,
    };
    allContraventionsForPoints.forEach((c) => {
      if (c.points >= 5) byPoints['5+']++;
      else if (c.points >= 3) byPoints['3-4']++;
      else byPoints['1-2']++;
    });

    // Get employees at risk (Stage 2+ - 10 or more points)
    const employeesAtRisk = await prisma.employeePoints.findMany({
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
    });

    // Get monthly trend (last 12 months) - single query instead of 12
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const contraventionsByMonth = await prisma.contravention.findMany({
      where: {
        incidentDate: {
          gte: twelveMonthsAgo,
        },
      },
      select: {
        incidentDate: true,
      },
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

    return {
      summary: {
        totalContraventions,
        pendingAcknowledgment,
        thisMonth,
        highPointsIssues,
        totalValueAffected: Number(valueSum._sum.valueSgd) || 0,
      },
      byStatus: byStatus as DashboardStats['byStatus'],
      byPoints: byPoints as DashboardStats['byPoints'],
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
        byPoints: {
          '1-2': allContraventions.filter((c) => c.points >= 1 && c.points <= 2).length,
          '3-4': allContraventions.filter((c) => c.points >= 3 && c.points <= 4).length,
          '5+': allContraventions.filter((c) => c.points >= 5).length,
        },
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
