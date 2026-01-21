// Email configuration
const EMAIL_CONFIG = {
  // Google Apps Script webhook URL (primary email method)
  GAS_WEBHOOK_URL: process.env.EMAIL_WEBHOOK_URL || process.env.APPROVAL_WEBHOOK_URL,

  // Sandbox mode: redirect all emails to this address
  SANDBOX_MODE: process.env.EMAIL_SANDBOX_MODE !== 'false', // Default to true
  SANDBOX_EMAIL: process.env.EMAIL_SANDBOX_RECIPIENT || 'daniellow@open.gov.sg',

  // Postmark API (fallback if GAS not configured)
  POSTMARK_API_KEY: process.env.POSTMARK_API_KEY,
  FROM_EMAIL: process.env.EMAIL_FROM || 'contraventiontracker@hack2026.gov.sg',
  FROM_NAME: process.env.EMAIL_FROM_NAME || 'Contravention Tracker',

  // App URL for links in emails
  APP_URL: process.env.APP_URL || 'https://contraventiontracker.vercel.app',
};

export interface EmailParams {
  to: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  originalRecipient?: string; // For sandbox mode tracking
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sandboxMode?: boolean;
  originalRecipient?: string;
}

/**
 * Email Service with Sandbox Mode
 * In sandbox mode, all emails are redirected to the configured sandbox email
 */
export const emailService = {
  /**
   * Send an email (respecting sandbox mode)
   */
  async send(params: EmailParams): Promise<EmailResult> {
    const isSandbox = EMAIL_CONFIG.SANDBOX_MODE;
    const actualRecipient = isSandbox ? EMAIL_CONFIG.SANDBOX_EMAIL : params.to;

    // Modify subject and body in sandbox mode
    let subject = params.subject;
    let htmlBody = params.htmlBody;

    if (isSandbox) {
      subject = `[SANDBOX] ${params.subject}`;
      htmlBody = `
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
          <strong>⚠️ SANDBOX MODE</strong><br>
          This email was originally intended for: <strong>${params.to}</strong><br>
          It has been redirected to you for testing purposes.
        </div>
        ${params.htmlBody}
      `;
    }

    try {
      // Log the email attempt
      console.log(`[Email] ${isSandbox ? '[SANDBOX]' : ''} Sending to: ${actualRecipient} | Subject: ${subject}`);

      // If Postmark is configured, send via API
      if (EMAIL_CONFIG.POSTMARK_API_KEY) {
        const response = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': EMAIL_CONFIG.POSTMARK_API_KEY,
          },
          body: JSON.stringify({
            From: `${EMAIL_CONFIG.FROM_NAME} <${EMAIL_CONFIG.FROM_EMAIL}>`,
            To: actualRecipient,
            Subject: subject,
            HtmlBody: htmlBody,
            TextBody: params.textBody || this.htmlToText(htmlBody),
            MessageStream: 'outbound',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json() as { Message?: string };
          throw new Error(errorData.Message || 'Failed to send email');
        }

        const result = await response.json() as { MessageID?: string };

        return {
          success: true,
          messageId: result.MessageID,
          sandboxMode: isSandbox,
          originalRecipient: isSandbox ? params.to : undefined,
        };
      }

      // If no email provider configured, log to console (for development)
      console.log(`[Email] No email provider configured. Email details:`);
      console.log(`  To: ${actualRecipient}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Body preview: ${params.textBody?.substring(0, 100) || 'HTML email'}...`);

      return {
        success: true,
        messageId: `local-${Date.now()}`,
        sandboxMode: isSandbox,
        originalRecipient: isSandbox ? params.to : undefined,
      };

    } catch (error) {
      console.error('[Email] Failed to send:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        sandboxMode: isSandbox,
        originalRecipient: isSandbox ? params.to : undefined,
      };
    }
  },

  /**
   * Simple HTML to text converter
   */
  htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Send webhook to Google Apps Script
   */
  async sendViaWebhook(payload: Record<string, unknown>): Promise<EmailResult> {
    if (!EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      console.log('[Email] GAS_WEBHOOK_URL not configured, skipping webhook');
      return { success: false, error: 'Webhook URL not configured' };
    }

    try {
      console.log(`[Email] Sending webhook: ${payload.type}`);
      const response = await fetch(EMAIL_CONFIG.GAS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[Email] Webhook sent successfully:', result);
      return { success: true, messageId: `gas-${Date.now()}` };
    } catch (error) {
      console.error('[Email] Webhook failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  /**
   * Send notification when a contravention is logged
   */
  async sendContraventionLoggedEmail(params: {
    employeeEmail: string;
    employeeName: string;
    referenceNo: string;
    typeName: string;
    severity: string;
    points: number;
    contraventionId: string;
  }): Promise<EmailResult> {
    // Try to send via Google Apps Script webhook first
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      return this.sendViaWebhook({
        type: 'CONTRAVENTION_LOGGED',
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        referenceNo: params.referenceNo,
        typeName: params.typeName,
        severity: params.severity,
        points: params.points,
        contraventionId: params.contraventionId,
      });
    }

    // Fallback to direct email (Postmark or console log)
    const viewUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Contravention Logged: ${params.referenceNo}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Contravention Notification</h2>

          <p>Dear ${params.employeeName},</p>

          <p>A contravention has been logged against you with the following details:</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Reference No</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.referenceNo}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Type</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.typeName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Severity</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.severity}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Points</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.points}</td>
            </tr>
          </table>

          <p>Please acknowledge this contravention within 5 working days.</p>

          <p style="margin: 20px 0;">
            <a href="${viewUrl}" style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Contravention
            </a>
          </p>

          <p style="color: #6b7280; font-size: 14px;">
            If you believe this contravention was logged in error, you may submit a dispute through the system.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated message from the Contravention Tracker system.
          </p>
        </div>
      `,
    });
  },

  /**
   * Send acknowledgment reminder email
   */
  async sendAcknowledgmentReminderEmail(params: {
    employeeEmail: string;
    employeeName: string;
    referenceNo: string;
    daysSinceLogged: number;
    contraventionId: string;
  }): Promise<EmailResult> {
    // Try to send via Google Apps Script webhook first
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      return this.sendViaWebhook({
        type: 'ACKNOWLEDGMENT_REMINDER',
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        referenceNo: params.referenceNo,
        daysSinceLogged: params.daysSinceLogged,
        contraventionId: params.contraventionId,
      });
    }

    const viewUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Reminder: Acknowledge Contravention ${params.referenceNo}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Acknowledgment Reminder</h2>

          <p>Dear ${params.employeeName},</p>

          <p>This is a reminder that contravention <strong>${params.referenceNo}</strong> was logged ${params.daysSinceLogged} days ago and is still pending acknowledgment.</p>

          <p style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 4px;">
            <strong>Action Required:</strong> Please acknowledge this contravention as soon as possible.
          </p>

          <p style="margin: 20px 0;">
            <a href="${viewUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Acknowledge Now
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated reminder from the Contravention Tracker system.
          </p>
        </div>
      `,
    });
  },

  /**
   * Send training assigned email
   */
  async sendTrainingAssignedEmail(params: {
    employeeEmail: string;
    employeeName: string;
    courseName: string;
    dueDate: Date;
    provider: string;
    durationHours: number;
  }): Promise<EmailResult> {
    // Try to send via Google Apps Script webhook first
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      return this.sendViaWebhook({
        type: 'TRAINING_ASSIGNED',
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        courseName: params.courseName,
        dueDate: params.dueDate.toISOString(),
        provider: params.provider,
        durationHours: params.durationHours,
      });
    }

    const formattedDate = params.dueDate.toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const trainingUrl = `${EMAIL_CONFIG.APP_URL}/training`;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Training Assigned: ${params.courseName}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Training Assignment</h2>

          <p>Dear ${params.employeeName},</p>

          <p>You have been assigned the following training course:</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Course</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.courseName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Provider</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.provider}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Duration</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.durationHours} hours</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Due Date</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${formattedDate}</td>
            </tr>
          </table>

          <p>Completing this training will reduce your contravention points by 1.</p>

          <p style="margin: 20px 0;">
            <a href="${trainingUrl}" style="background-color: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Training Details
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated message from the Contravention Tracker system.
          </p>
        </div>
      `,
    });
  },

  /**
   * Send escalation notification email
   */
  async sendEscalationEmail(params: {
    employeeEmail: string;
    employeeName: string;
    level: string;
    totalPoints: number;
    actionsRequired: string[];
  }): Promise<EmailResult> {
    // Try to send via Google Apps Script webhook first
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      return this.sendViaWebhook({
        type: 'ESCALATION_TRIGGERED',
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        level: params.level,
        totalPoints: params.totalPoints,
        actionsRequired: params.actionsRequired,
      });
    }

    const levelNames: Record<string, string> = {
      LEVEL_1: 'Level 1 - Verbal Advisory',
      LEVEL_2: 'Level 2 - Mandatory Training',
      LEVEL_3: 'Level 3 - Performance Impact',
    };

    const levelColors: Record<string, string> = {
      LEVEL_1: '#eab308',
      LEVEL_2: '#f97316',
      LEVEL_3: '#dc2626',
    };

    const escalationsUrl = `${EMAIL_CONFIG.APP_URL}/escalations`;
    const levelName = levelNames[params.level] || params.level;
    const levelColor = levelColors[params.level] || '#ef4444';

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Escalation Alert: ${levelName}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${levelColor};">⚠️ Escalation Notification</h2>

          <p>Dear ${params.employeeName},</p>

          <p>Your contravention points have reached <strong>${params.totalPoints}</strong>, triggering an escalation to:</p>

          <div style="background-color: #fef2f2; border-left: 4px solid ${levelColor}; padding: 16px; margin: 20px 0;">
            <strong style="color: ${levelColor}; font-size: 18px;">${levelName}</strong>
          </div>

          <p><strong>Required Actions:</strong></p>
          <ul style="margin: 16px 0;">
            ${params.actionsRequired.map(action => `<li style="margin: 8px 0;">${action}</li>`).join('')}
          </ul>

          <p style="margin: 20px 0;">
            <a href="${escalationsUrl}" style="background-color: ${levelColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Escalation Details
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated message from the Contravention Tracker system.
          </p>
        </div>
      `,
    });
  },

  /**
   * Send training overdue reminder
   */
  async sendTrainingOverdueEmail(params: {
    employeeEmail: string;
    employeeName: string;
    courseName: string;
    dueDate: Date;
    daysOverdue: number;
  }): Promise<EmailResult> {
    // Try to send via Google Apps Script webhook first
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      return this.sendViaWebhook({
        type: 'TRAINING_OVERDUE',
        employeeEmail: params.employeeEmail,
        employeeName: params.employeeName,
        courseName: params.courseName,
        dueDate: params.dueDate.toISOString(),
        daysOverdue: params.daysOverdue,
      });
    }

    const formattedDate = params.dueDate.toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const trainingUrl = `${EMAIL_CONFIG.APP_URL}/training`;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `OVERDUE: Training "${params.courseName}" - ${params.daysOverdue} days overdue`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">⚠️ Training Overdue</h2>

          <p>Dear ${params.employeeName},</p>

          <p>Your assigned training is now <strong style="color: #dc2626;">${params.daysOverdue} days overdue</strong>.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Course</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.courseName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Due Date</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Days Overdue</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${params.daysOverdue}</td>
            </tr>
          </table>

          <p style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 4px;">
            <strong>Urgent:</strong> Please complete this training immediately to avoid further escalation.
          </p>

          <p style="margin: 20px 0;">
            <a href="${trainingUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Complete Training
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated reminder from the Contravention Tracker system.
          </p>
        </div>
      `,
    });
  },

  /**
   * Send OTP email for authentication
   * Uses dedicated GAS OTP handler for cleaner delivery (no CC)
   */
  async sendOtpEmail(params: {
    email: string;
    otp: string;
    expiresAt: Date;
  }): Promise<EmailResult> {
    const expiryMinutes = Math.round((params.expiresAt.getTime() - Date.now()) / 60000);

    // If GAS webhook is configured, use dedicated OTP handler
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      try {
        console.log(`[Email] Sending OTP via GAS webhook to: ${params.email}`);

        const response = await fetch(EMAIL_CONFIG.GAS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'OTP',
            email: params.email,
            otp: params.otp,
            expiryMinutes,
          }),
        });

        const result = await response.json() as { success: boolean; error?: string };

        if (!result.success) {
          throw new Error(result.error || 'GAS webhook failed');
        }

        return {
          success: true,
          sandboxMode: EMAIL_CONFIG.SANDBOX_MODE,
        };
      } catch (error) {
        console.error('[Email] GAS OTP webhook failed:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }

    // Fallback to generic send method (Postmark or console log)
    return this.send({
      to: params.email,
      subject: `Your login code: ${params.otp}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Contravention Tracker Login</h2>

          <p>Your one-time password (OTP) is:</p>

          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${params.otp}</span>
          </div>

          <p style="color: #6b7280; font-size: 14px;">
            This code will expire in <strong>${expiryMinutes} minutes</strong>.
          </p>

          <p style="color: #6b7280; font-size: 14px;">
            If you did not request this code, please ignore this email.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated message from the Contravention Tracker system.
          </p>
        </div>
      `,
      textBody: `Your Contravention Tracker login code is: ${params.otp}\n\nThis code will expire in ${expiryMinutes} minutes.\n\nIf you did not request this code, please ignore this email.`,
    });
  },

  /**
   * Send approval request email to approver
   */
  async sendApprovalRequestEmail(params: {
    approverEmail: string;
    approverName: string;
    referenceNo: string;
    employeeName: string;
    typeName: string;
    severity: string;
    contraventionId: string;
  }): Promise<EmailResult> {
    // Try to send via Google Apps Script webhook first
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      return this.sendViaWebhook({
        type: 'APPROVAL_REQUESTED',
        approverEmail: params.approverEmail,
        approverName: params.approverName,
        referenceNo: params.referenceNo,
        employeeName: params.employeeName,
        typeName: params.typeName,
        severity: params.severity,
        contraventionId: params.contraventionId,
        appUrl: EMAIL_CONFIG.APP_URL,
      });
    }

    const approvalUrl = `${EMAIL_CONFIG.APP_URL}/approvals`;
    const viewContraventionUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    const severityColors: Record<string, string> = {
      LOW: '#22c55e',
      MEDIUM: '#eab308',
      HIGH: '#f97316',
      CRITICAL: '#dc2626',
    };
    const severityColor = severityColors[params.severity] || '#6b7280';

    return this.send({
      to: params.approverEmail,
      toName: params.approverName,
      subject: `Action Required: Approval Request for ${params.referenceNo}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Approval Request</h2>

          <p>Dear ${params.approverName},</p>

          <p><strong>${params.employeeName}</strong> has requested your approval for a procurement contravention.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Reference No</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.referenceNo}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Employee</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.employeeName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Type</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.typeName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Severity</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">
                <span style="background-color: ${severityColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                  ${params.severity}
                </span>
              </td>
            </tr>
          </table>

          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 12px 0; font-weight: bold; color: #1e40af;">Action Required</p>
            <p style="margin: 0; color: #1e3a8a;">Please click the button below to review the details and approve or reject this request.</p>
          </div>

          <p style="margin: 24px 0; text-align: center;">
            <a href="${approvalUrl}" style="background-color: #22c55e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-right: 12px;">
              ✓ Go to Approvals
            </a>
          </p>

          <p style="margin: 16px 0; text-align: center;">
            <a href="${viewContraventionUrl}" style="color: #1e40af; text-decoration: underline;">
              View full contravention details →
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated message from the Contravention Tracker system.
          </p>
        </div>
      `,
    });
  },

  /**
   * Send notification to admin when a user requests approver role
   */
  async sendApproverRoleRequestEmail(params: {
    adminEmail: string;
    adminName: string;
    requestingUserName: string;
    requestingUserEmail: string;
    position: string;
  }): Promise<EmailResult> {
    // Try to send via Google Apps Script webhook first
    if (EMAIL_CONFIG.GAS_WEBHOOK_URL) {
      return this.sendViaWebhook({
        type: 'APPROVER_ROLE_REQUESTED',
        adminEmail: params.adminEmail,
        adminName: params.adminName,
        requestingUserName: params.requestingUserName,
        requestingUserEmail: params.requestingUserEmail,
        position: params.position,
        appUrl: EMAIL_CONFIG.APP_URL,
      });
    }

    const approverRequestsUrl = `${EMAIL_CONFIG.APP_URL}/settings/approver-requests`;

    return this.send({
      to: params.adminEmail,
      toName: params.adminName,
      subject: `New Approver Request: ${params.requestingUserName}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">New Approver Request</h2>

          <p>Dear ${params.adminName},</p>

          <p>A user has requested to become an approver in the Contravention Tracker system.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Name</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.requestingUserName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Email</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.requestingUserEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: bold;">Position</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${params.position}</td>
            </tr>
          </table>

          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 12px 0; font-weight: bold; color: #1e40af;">Action Required</p>
            <p style="margin: 0; color: #1e3a8a;">Please log in to review and approve or reject this request.</p>
          </div>

          <p style="margin: 24px 0; text-align: center;">
            <a href="${approverRequestsUrl}" style="background-color: #1e40af; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Review Request
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated message from the Contravention Tracker system.
          </p>
        </div>
      `,
    });
  },

  /**
   * Get current sandbox status
   */
  getSandboxStatus() {
    return {
      enabled: EMAIL_CONFIG.SANDBOX_MODE,
      sandboxEmail: EMAIL_CONFIG.SANDBOX_EMAIL,
      emailProviderConfigured: !!EMAIL_CONFIG.POSTMARK_API_KEY,
      gasWebhookConfigured: !!EMAIL_CONFIG.GAS_WEBHOOK_URL,
    };
  },
};

export default emailService;
