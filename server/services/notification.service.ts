import { prisma } from '../config/database';
import { emailService } from './email.service';
import slackService from './slack.service';

export type NotificationType =
  | 'CONTRAVENTION_LOGGED'
  | 'CONTRAVENTION_ACKNOWLEDGED'
  | 'CONTRAVENTION_RESOLVED'
  | 'DISPUTE_SUBMITTED'
  | 'DISPUTE_DECIDED'
  | 'ESCALATION_TRIGGERED'
  | 'TRAINING_ASSIGNED'
  | 'TRAINING_DUE'
  | 'TRAINING_OVERDUE'
  | 'POINTS_UPDATED'
  | 'ACKNOWLEDGMENT_REMINDER'
  | 'APPROVAL_REQUESTED'
  | 'APPROVER_ROLE_REQUESTED';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export const notificationService = {
  /**
   * Create a notification for a user (in-app)
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
   * Sends both in-app notification and email
   */
  async notifyContraventionLogged(params: {
    employeeUserId: string;
    employeeEmail: string;
    employeeName: string;
    contraventionId: string;
    referenceNo: string;
    typeName: string;
    severity?: string;  // Optional - for backwards compatibility
    points: number;
  }) {
    // Create in-app notification
    const notification = await this.create({
      userId: params.employeeUserId,
      type: 'CONTRAVENTION_LOGGED',
      title: 'New Contravention Logged',
      message: `A contravention (${params.typeName}) has been logged against you. ${params.points} points have been added.`,
      link: `/contraventions/${params.contraventionId}`,
    });

    // Send email notification (don't fail if email fails)
    try {
      await emailService.sendContraventionLoggedEmail({
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        referenceNo: params.referenceNo,
        typeName: params.typeName,
        severity: params.severity || 'N/A',
        points: params.points,
        contraventionId: params.contraventionId,
      });
    } catch (emailError) {
      console.error(`[Notification] Email to employee ${params.employeeEmail} failed:`, emailError);
    }

    return notification;
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
   * Sends both in-app notification and email
   */
  async notifyEscalationTriggered(params: {
    employeeUserId: string;
    employeeEmail: string;
    employeeName: string;
    level: string;
    totalPoints: number;
    actionsRequired: string[];
  }) {
    // Create in-app notification
    const notification = await this.create({
      userId: params.employeeUserId,
      type: 'ESCALATION_TRIGGERED',
      title: 'Escalation Level Reached',
      message: `You have reached escalation ${params.level} with ${params.totalPoints} points. Please review required actions.`,
      link: '/escalations',
    });

    // Send email notification (don't fail if email fails)
    try {
      await emailService.sendEscalationEmail({
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        level: params.level,
        totalPoints: params.totalPoints,
        actionsRequired: params.actionsRequired,
      });
    } catch (emailError) {
      console.error(`[Notification] Escalation email to ${params.employeeEmail} failed:`, emailError);
    }

    return notification;
  },

  /**
   * Notify employee about assigned training
   * Sends both in-app notification and email
   */
  async notifyTrainingAssigned(params: {
    employeeUserId: string;
    employeeEmail: string;
    employeeName: string;
    courseName: string;
    dueDate: Date;
    provider: string;
    durationHours: number;
  }) {
    const formattedDate = params.dueDate.toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    // Create in-app notification
    const notification = await this.create({
      userId: params.employeeUserId,
      type: 'TRAINING_ASSIGNED',
      title: 'Training Assigned',
      message: `You have been assigned "${params.courseName}". Please complete by ${formattedDate}.`,
      link: '/training',
    });

    // Send email notification (don't fail if email fails)
    try {
      await emailService.sendTrainingAssignedEmail({
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        courseName: params.courseName,
        dueDate: params.dueDate,
        provider: params.provider,
        durationHours: params.durationHours,
      });
    } catch (emailError) {
      console.error(`[Notification] Training email to ${params.employeeEmail} failed:`, emailError);
    }

    return notification;
  },

  /**
   * Send acknowledgment reminder for pending contraventions
   */
  async sendAcknowledgmentReminder(params: {
    employeeUserId: string;
    employeeEmail: string;
    employeeName: string;
    contraventionId: string;
    referenceNo: string;
    daysSinceLogged: number;
  }) {
    // Create in-app notification
    const notification = await this.create({
      userId: params.employeeUserId,
      type: 'ACKNOWLEDGMENT_REMINDER',
      title: 'Acknowledgment Reminder',
      message: `Contravention ${params.referenceNo} is pending acknowledgment for ${params.daysSinceLogged} days.`,
      link: `/contraventions/${params.contraventionId}`,
    });

    // Send email reminder (don't fail if email fails)
    try {
      await emailService.sendAcknowledgmentReminderEmail({
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        referenceNo: params.referenceNo,
        daysSinceLogged: params.daysSinceLogged,
        contraventionId: params.contraventionId,
      });
    } catch (emailError) {
      console.error(`[Notification] Reminder email to ${params.employeeEmail} failed:`, emailError);
    }

    return notification;
  },

  /**
   * Send training overdue notification
   */
  async notifyTrainingOverdue(params: {
    employeeUserId: string;
    employeeEmail: string;
    employeeName: string;
    courseName: string;
    dueDate: Date;
    daysOverdue: number;
  }) {
    // Create in-app notification
    const notification = await this.create({
      userId: params.employeeUserId,
      type: 'TRAINING_OVERDUE',
      title: 'Training Overdue',
      message: `Your training "${params.courseName}" is ${params.daysOverdue} days overdue.`,
      link: '/training',
    });

    // Send email notification (don't fail if email fails)
    try {
      await emailService.sendTrainingOverdueEmail({
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        courseName: params.courseName,
        dueDate: params.dueDate,
        daysOverdue: params.daysOverdue,
      });
    } catch (emailError) {
      console.error(`[Notification] Training overdue email to ${params.employeeEmail} failed:`, emailError);
    }

    return notification;
  },

  /**
   * Notify approver when an approval is requested
   * Sends both in-app notification and email
   */
  async notifyApprovalRequested(params: {
    approverUserId: string;
    approverEmail: string;
    approverName: string;
    contraventionId: string;
    referenceNo: string;
    employeeName: string;
    submitterName: string;
    typeName: string;
    severity?: string;  // Optional - for backwards compatibility
    // Additional fields for email
    vendor?: string;
    valueSgd?: number | null;
    incidentDate?: Date | string;
    description?: string;
    justification?: string;
    mitigation?: string;
  }) {
    // Create in-app notification
    const notification = await this.create({
      userId: params.approverUserId,
      type: 'APPROVAL_REQUESTED',
      title: 'Approval Request',
      message: `${params.submitterName} has requested your approval for contravention ${params.referenceNo} (${params.typeName}) for ${params.employeeName}.`,
      link: `/approvals`,
    });

    // Send email notification (don't fail if email fails - approver can still see in-app notification)
    try {
      await emailService.sendApprovalRequestEmail({
        approverEmail: params.approverEmail,
        approverName: params.approverName,
        referenceNo: params.referenceNo,
        employeeName: params.employeeName,
        typeName: params.typeName,
        severity: params.severity || 'N/A',
        contraventionId: params.contraventionId,
        // Pass additional fields for email
        vendor: params.vendor,
        valueSgd: params.valueSgd,
        incidentDate: params.incidentDate,
        description: params.description,
        justification: params.justification,
        mitigation: params.mitigation,
      });
    } catch (emailError) {
      // Log but don't fail - in-app notification was already created
      console.error(`[Notification] Email to approver ${params.approverEmail} failed (may be blacklisted):`, emailError);
    }

    return notification;
  },

  /**
   * Notify all admins and approvers when a user requests approver role
   * Sends in-app notification, email, and Slack DM to all admins and approvers
   */
  async notifyApproverRoleRequested(params: {
    requestingUserId: string;
    requestingUserName: string;
    requestingUserEmail: string;
    position: string;
  }) {
    // Get all admin users
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true, email: true, name: true },
    });

    // Get all approver users (excluding the requesting user)
    const approvers = await prisma.user.findMany({
      where: {
        role: 'APPROVER',
        isActive: true,
        id: { not: params.requestingUserId },
      },
      select: { id: true, email: true, name: true },
    });

    // Combine admins and approvers (admins may also be approvers, so deduplicate by id)
    const adminIds = new Set(admins.map((a: { id: string }) => a.id));
    const uniqueRecipients = [
      ...admins,
      ...approvers.filter((a: { id: string }) => !adminIds.has(a.id)),
    ];

    if (uniqueRecipients.length === 0) {
      console.warn('[Notification] No admins or approvers found to notify about approver request');
      return [];
    }

    console.log(`[Notification] Notifying ${uniqueRecipients.length} admins/approvers about approver request from ${params.requestingUserName}`);

    // Create in-app notifications for all admins and approvers
    const notifications = await Promise.all(
      uniqueRecipients.map((recipient: { id: string; email: string; name: string }) =>
        this.create({
          userId: recipient.id,
          type: 'APPROVER_ROLE_REQUESTED',
          title: 'New Approver Request',
          message: `${params.requestingUserName} (${params.position}) has requested approver permissions.`,
          link: '/settings?tab=users',
        })
      )
    );

    // Send emails to all admins and approvers
    await Promise.all(
      uniqueRecipients.map((recipient: { id: string; email: string; name: string }) =>
        emailService.sendApproverRoleRequestEmail({
          adminEmail: recipient.email,
          adminName: recipient.name,
          requestingUserName: params.requestingUserName,
          requestingUserEmail: params.requestingUserEmail,
          position: params.position,
        })
      )
    );

    // Send Slack notification to channel (with interactive buttons)
    if (slackService.isConfigured()) {
      await slackService.sendApproverRoleRequestToChannel({
        requestingUserId: params.requestingUserId,
        requestingUserName: params.requestingUserName,
        requestingUserEmail: params.requestingUserEmail,
        position: params.position,
      });
    }

    return notifications;
  },

  /**
   * Get all admin user IDs for broadcasting notifications
   */
  async getAdminUserIds(): Promise<string[]> {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    return admins.map((a: { id: string }) => a.id);
  },

  /**
   * Get email sandbox status
   */
  getEmailSandboxStatus() {
    return emailService.getSandboxStatus();
  },
};
