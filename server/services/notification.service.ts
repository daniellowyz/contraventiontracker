import { prisma } from '../config/database';

export type NotificationType =
  | 'CONTRAVENTION_LOGGED'
  | 'CONTRAVENTION_ACKNOWLEDGED'
  | 'CONTRAVENTION_RESOLVED'
  | 'DISPUTE_SUBMITTED'
  | 'DISPUTE_DECIDED'
  | 'ESCALATION_TRIGGERED'
  | 'TRAINING_ASSIGNED'
  | 'TRAINING_DUE'
  | 'POINTS_UPDATED';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export const notificationService = {
  /**
   * Create a notification for a user
   */
  async create(params: CreateNotificationParams) {
    try {
      return await prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          link: params.link,
          channel: 'IN_APP',
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
      // Don't throw - notifications should not break the main flow
      return null;
    }
  },

  /**
   * Notify employee about a new contravention logged against them
   */
  async notifyContraventionLogged(params: {
    employeeUserId: string;
    contraventionId: string;
    referenceNo: string;
    typeName: string;
    severity: string;
    points: number;
  }) {
    return this.create({
      userId: params.employeeUserId,
      type: 'CONTRAVENTION_LOGGED',
      title: 'New Contravention Logged',
      message: `A ${params.severity.toLowerCase()} severity contravention (${params.typeName}) has been logged against you. ${params.points} points have been added.`,
      link: `/contraventions/${params.contraventionId}`,
    });
  },

  /**
   * Notify admin when an employee acknowledges a contravention
   */
  async notifyContraventionAcknowledged(params: {
    adminUserId: string;
    contraventionId: string;
    referenceNo: string;
    employeeName: string;
  }) {
    return this.create({
      userId: params.adminUserId,
      type: 'CONTRAVENTION_ACKNOWLEDGED',
      title: 'Contravention Acknowledged',
      message: `${params.employeeName} has acknowledged contravention ${params.referenceNo}.`,
      link: `/contraventions/${params.contraventionId}`,
    });
  },

  /**
   * Notify employee when a contravention is resolved
   */
  async notifyContraventionResolved(params: {
    employeeUserId: string;
    contraventionId: string;
    referenceNo: string;
  }) {
    return this.create({
      userId: params.employeeUserId,
      type: 'CONTRAVENTION_RESOLVED',
      title: 'Contravention Resolved',
      message: `Contravention ${params.referenceNo} has been marked as resolved.`,
      link: `/contraventions/${params.contraventionId}`,
    });
  },

  /**
   * Notify admins when a dispute is submitted
   */
  async notifyDisputeSubmitted(params: {
    adminUserIds: string[];
    contraventionId: string;
    referenceNo: string;
    employeeName: string;
  }) {
    const notifications = params.adminUserIds.map((adminUserId) =>
      this.create({
        userId: adminUserId,
        type: 'DISPUTE_SUBMITTED',
        title: 'Dispute Submitted',
        message: `${params.employeeName} has submitted a dispute for contravention ${params.referenceNo}.`,
        link: `/contraventions/${params.contraventionId}`,
      })
    );
    return Promise.all(notifications);
  },

  /**
   * Notify employee when their dispute has been decided
   */
  async notifyDisputeDecided(params: {
    employeeUserId: string;
    contraventionId: string;
    referenceNo: string;
    decision: 'UPHELD' | 'OVERTURNED';
  }) {
    const decisionText = params.decision === 'UPHELD' ? 'upheld' : 'overturned';
    return this.create({
      userId: params.employeeUserId,
      type: 'DISPUTE_DECIDED',
      title: `Dispute ${params.decision === 'UPHELD' ? 'Upheld' : 'Overturned'}`,
      message: `Your dispute for contravention ${params.referenceNo} has been ${decisionText}.`,
      link: `/contraventions/${params.contraventionId}`,
    });
  },

  /**
   * Notify employee about escalation level change
   */
  async notifyEscalationTriggered(params: {
    employeeUserId: string;
    level: string;
    totalPoints: number;
  }) {
    return this.create({
      userId: params.employeeUserId,
      type: 'ESCALATION_TRIGGERED',
      title: 'Escalation Level Reached',
      message: `You have reached escalation ${params.level} with ${params.totalPoints} points. Please review required actions.`,
      link: '/escalations',
    });
  },

  /**
   * Notify employee about assigned training
   */
  async notifyTrainingAssigned(params: {
    employeeUserId: string;
    courseName: string;
    dueDate: Date;
  }) {
    const formattedDate = params.dueDate.toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return this.create({
      userId: params.employeeUserId,
      type: 'TRAINING_ASSIGNED',
      title: 'Training Assigned',
      message: `You have been assigned "${params.courseName}". Please complete by ${formattedDate}.`,
      link: '/training',
    });
  },

  /**
   * Get all admin user IDs for broadcasting notifications
   */
  async getAdminUserIds(): Promise<string[]> {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  },
};
