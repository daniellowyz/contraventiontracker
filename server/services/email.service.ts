// Email Service - Postman.gov.sg Integration
// Replaces Google Apps Script webhook with direct Postman API calls

// Email configuration
const EMAIL_CONFIG = {
  // Postman.gov.sg API
  POSTMAN_API_URL: 'https://api.postman.gov.sg/v1/transactional/email/send',
  POSTMAN_API_KEY: process.env.POSTMAN_API_KEY,

  // Sender configuration
  FROM_NAME: process.env.EMAIL_FROM_NAME || 'Contravention Tracker',
  FROM_EMAIL: 'info@mail.postman.gov.sg', // Postman default sender

  // CC configuration - always CC this email on notifications (except OTP)
  ALWAYS_CC: process.env.EMAIL_ALWAYS_CC || 'adriel@open.gov.sg',

  // Sandbox mode: redirect all emails to this address for testing
  SANDBOX_MODE: process.env.EMAIL_SANDBOX_MODE === 'true',
  SANDBOX_EMAIL: process.env.EMAIL_SANDBOX_RECIPIENT || 'daniellow@open.gov.sg',

  // App URL for links in emails
  APP_URL: process.env.APP_URL || 'https://contraventiontracker.vercel.app',
};

export interface EmailParams {
  to: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  cc?: string[];
  skipCc?: boolean; // For sensitive emails like OTP
  originalRecipient?: string; // For sandbox mode tracking
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sandboxMode?: boolean;
  originalRecipient?: string;
}

interface PostmanResponse {
  id: string;
  from: string;
  recipient: string;
  status: string;
  created_at: string;
  error_code?: string;
  error_sub_type?: string;
}

/**
 * Email Service using Postman.gov.sg API
 * Replaces Google Apps Script webhook for all email sending
 */
export const emailService = {
  /**
   * Send an email via Postman.gov.sg API
   */
  async send(params: EmailParams): Promise<EmailResult> {
    const isSandbox = EMAIL_CONFIG.SANDBOX_MODE;
    const actualRecipient = isSandbox ? EMAIL_CONFIG.SANDBOX_EMAIL : params.to;

    // Build CC list (skip in sandbox mode or if explicitly requested)
    let ccRecipients: string[] = [];
    if (!isSandbox && !params.skipCc) {
      if (params.cc && params.cc.length > 0) {
        ccRecipients = [...params.cc];
      }
      // Add always-CC if configured and not already in the list
      if (EMAIL_CONFIG.ALWAYS_CC && !ccRecipients.includes(EMAIL_CONFIG.ALWAYS_CC)) {
        ccRecipients.push(EMAIL_CONFIG.ALWAYS_CC);
      }
    }

    // Modify subject and body in sandbox mode
    let subject = params.subject;
    let htmlBody = params.htmlBody;

    if (isSandbox) {
      subject = `[SANDBOX] ${params.subject}`;
      htmlBody = `
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
          <strong>SANDBOX MODE</strong><br>
          This email was originally intended for: <strong>${params.to}</strong><br>
          ${ccRecipients.length > 0 ? `CC: <strong>${ccRecipients.join(', ')}</strong><br>` : ''}
          It has been redirected to you for testing purposes.
        </div>
        ${params.htmlBody}
      `;
    }

    try {
      // Check if Postman API key is configured
      if (!EMAIL_CONFIG.POSTMAN_API_KEY) {
        console.log('[Email] POSTMAN_API_KEY not configured, logging email to console');
        console.log(`[Email] To: ${actualRecipient}`);
        console.log(`[Email] CC: ${ccRecipients.join(', ') || 'none'}`);
        console.log(`[Email] Subject: ${subject}`);
        console.log(`[Email] Body preview: ${this.htmlToText(htmlBody).substring(0, 200)}...`);

        return {
          success: true,
          messageId: `local-${Date.now()}`,
          sandboxMode: isSandbox,
          originalRecipient: isSandbox ? params.to : undefined,
        };
      }

      // Log the email attempt
      const apiKeyPreview = EMAIL_CONFIG.POSTMAN_API_KEY ? `${EMAIL_CONFIG.POSTMAN_API_KEY.substring(0, 15)}...` : 'NOT SET';
      console.log(`[Email] ${isSandbox ? '[SANDBOX]' : ''} Sending via Postman to: ${actualRecipient} | Subject: ${subject}`);
      console.log(`[Email] API Key configured: ${apiKeyPreview}`);

      // Build request body for Postman API
      const requestBody: Record<string, unknown> = {
        subject,
        body: htmlBody,
        recipient: actualRecipient,
        from: `${EMAIL_CONFIG.FROM_NAME} <${EMAIL_CONFIG.FROM_EMAIL}>`,
      };

      // Add CC if present (only in non-sandbox mode)
      if (ccRecipients.length > 0 && !isSandbox) {
        requestBody.cc = ccRecipients;
      }

      // Send via Postman API
      console.log('[Email] Calling Postman API...');
      const response = await fetch(EMAIL_CONFIG.POSTMAN_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EMAIL_CONFIG.POSTMAN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[Email] Postman API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Email] Postman API error response:', errorText);
        throw new Error(`Postman API failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json() as PostmanResponse;
      console.log('[Email] Postman API success:', { id: result.id, status: result.status });

      return {
        success: true,
        messageId: result.id,
        sandboxMode: isSandbox,
        originalRecipient: isSandbox ? params.to : undefined,
      };

    } catch (error) {
      console.error('[Email] Failed to send via Postman:', error);
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
   * Send OTP email (no CC for security)
   */
  async sendOtpEmail(params: {
    email: string;
    otp: string;
    expiryMinutes: number;
  }): Promise<EmailResult> {
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Contravention Tracker Login</h2>

        <p>Your one-time password (OTP) is:</p>

        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${params.otp}</span>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          This code will expire in <strong>${params.expiryMinutes} minutes</strong>.
        </p>

        <p style="color: #6b7280; font-size: 14px;">
          If you did not request this code, please ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

        <p style="color: #9ca3af; font-size: 12px;">
          This is an automated message from the Contravention Tracker system.
        </p>
      </div>
    `;

    return this.send({
      to: params.email,
      subject: `Your login code: ${params.otp}`,
      htmlBody,
      skipCc: true, // OTP emails should NOT be CC'd for security
    });
  },

  /**
   * Send notification when a contravention is logged (to employee)
   */
  async sendContraventionLoggedEmail(params: {
    employeeEmail: string;
    employeeName: string;
    referenceNo: string;
    typeName: string;
    points: number;
    contraventionId: string;
  }): Promise<EmailResult> {
    const viewUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Contravention Notification</h2>

        <p>Dear ${params.employeeName},</p>

        <p>A contravention has been logged against you with the following details:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Reference No</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.referenceNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Type</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.typeName}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Points</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.points}</td>
          </tr>
        </table>

        <p style="margin: 20px 0;">
          <a href="${viewUrl}" style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Contravention
          </a>
        </p>

        <p style="color: #6b7280; font-size: 14px;">
          If you believe this contravention was logged in error, you may submit a dispute through the system.
        </p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Contravention Logged: ${params.referenceNo}`,
      htmlBody,
    });
  },

  /**
   * Send escalation notification email (to employee)
   */
  async sendEscalationEmail(params: {
    employeeEmail: string;
    employeeName: string;
    level: string;
    totalPoints: number;
    actionsRequired: string[];
  }): Promise<EmailResult> {
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
    const actionsHtml = params.actionsRequired.map(action => `<li style="margin: 8px 0;">${action}</li>`).join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${levelColor};">Escalation Notification</h2>

        <p>Dear ${params.employeeName},</p>

        <p>Your contravention points have reached <strong>${params.totalPoints}</strong>, triggering an escalation to:</p>

        <div style="background-color: #fef2f2; border-left: 4px solid ${levelColor}; padding: 16px; margin: 20px 0;">
          <strong style="color: ${levelColor}; font-size: 18px;">${levelName}</strong>
        </div>

        <p><strong>Required Actions:</strong></p>
        <ul style="margin: 16px 0;">
          ${actionsHtml}
        </ul>

        <p style="margin: 20px 0;">
          <a href="${escalationsUrl}" style="background-color: ${levelColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Escalation Details
          </a>
        </p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Escalation Alert: ${levelName}`,
      htmlBody,
    });
  },

  /**
   * Send training assigned email (to employee)
   */
  async sendTrainingAssignedEmail(params: {
    employeeEmail: string;
    employeeName: string;
    courseName: string;
    dueDate: Date;
    provider: string;
    durationHours: number;
  }): Promise<EmailResult> {
    const trainingUrl = `${EMAIL_CONFIG.APP_URL}/training`;
    const formattedDate = params.dueDate.toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d9488;">Training Assignment</h2>

        <p>Dear ${params.employeeName},</p>

        <p>You have been assigned the following training course:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Course</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.courseName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Provider</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.provider}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Duration</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.durationHours} hours</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #dc2626;">Due Date</td>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #dc2626;">${formattedDate}</td>
          </tr>
        </table>

        <p>Completing this training will reduce your contravention points by 1.</p>

        <p style="margin: 20px 0;">
          <a href="${trainingUrl}" style="background-color: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Training Details
          </a>
        </p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Training Assigned: ${params.courseName}`,
      htmlBody,
    });
  },

  /**
   * Send acknowledgment reminder email (to employee)
   */
  async sendAcknowledgmentReminderEmail(params: {
    employeeEmail: string;
    employeeName: string;
    referenceNo: string;
    daysSinceLogged: number;
    contraventionId: string;
  }): Promise<EmailResult> {
    const viewUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    const htmlBody = `
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

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated reminder from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `Reminder: Acknowledge Contravention ${params.referenceNo}`,
      htmlBody,
    });
  },

  /**
   * Send training overdue reminder (to employee)
   */
  async sendTrainingOverdueEmail(params: {
    employeeEmail: string;
    employeeName: string;
    courseName: string;
    dueDate: Date;
    daysOverdue: number;
  }): Promise<EmailResult> {
    const trainingUrl = `${EMAIL_CONFIG.APP_URL}/training`;
    const formattedDate = params.dueDate.toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Training Overdue</h2>

        <p>Dear ${params.employeeName},</p>

        <p>Your assigned training is now <strong style="color: #dc2626;">${params.daysOverdue} days overdue</strong>.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Course</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.courseName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Due Date</td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #dc2626; font-weight: bold;">${formattedDate}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Days Overdue</td>
            <td style="padding: 10px; border: 1px solid #ddd; color: #dc2626; font-weight: bold;">${params.daysOverdue}</td>
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

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated reminder from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.employeeEmail,
      toName: params.employeeName,
      subject: `OVERDUE: Training "${params.courseName}" - ${params.daysOverdue} days overdue`,
      htmlBody,
    });
  },

  /**
   * Send approval request email (to approver)
   */
  async sendApprovalRequestEmail(params: {
    approverEmail: string;
    approverName: string;
    referenceNo: string;
    employeeName: string;
    employeeEmail?: string;
    typeName: string;
    points: number;
    contraventionId: string;
    description?: string;
    justification?: string;
    mitigation?: string;
    vendor?: string;
    valueSgd?: string;
    incidentDate?: string;
  }): Promise<EmailResult> {
    const approvalUrl = `${EMAIL_CONFIG.APP_URL}/approvals`;
    const viewUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    // Build additional CC for employee if provided
    const additionalCc: string[] = [];
    if (params.employeeEmail && params.employeeEmail.includes('@')) {
      additionalCc.push(params.employeeEmail);
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Contravention Approval Request</h2>
        <p>Dear ${params.approverName},</p>
        <p>A contravention has been logged that requires your approval.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Reference No</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.referenceNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Employee</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.employeeName}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Contravention Type</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.typeName}</td>
          </tr>
          ${params.vendor ? `
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Vendor</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.vendor}</td>
          </tr>
          ` : ''}
          ${params.valueSgd ? `
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Value (SGD)</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.valueSgd}</td>
          </tr>
          ` : ''}
          ${params.incidentDate ? `
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Incident Date</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.incidentDate}</td>
          </tr>
          ` : ''}
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Points</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.points}</td>
          </tr>
        </table>

        ${params.description ? `
        <h3 style="color: #333; margin-top: 20px;">Description</h3>
        <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #007bff;">${params.description}</p>
        ` : ''}

        ${params.justification ? `
        <h3 style="color: #333;">Justification</h3>
        <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #28a745;">${params.justification}</p>
        ` : ''}

        ${params.mitigation ? `
        <h3 style="color: #333;">Mitigation Measures</h3>
        <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #ffc107;">${params.mitigation}</p>
        ` : ''}

        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 12px 0; font-weight: bold; color: #1e40af;">Action Required</p>
          <p style="margin: 0; color: #1e3a8a;">Please click the button below to review and approve or reject this request.</p>
        </div>

        <p style="margin: 24px 0; text-align: center;">
          <a href="${approvalUrl}" style="background-color: #22c55e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Go to Approvals
          </a>
        </p>

        <p style="margin: 16px 0; text-align: center;">
          <a href="${viewUrl}" style="color: #1e40af; text-decoration: underline;">
            View full contravention details
          </a>
        </p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.approverEmail,
      toName: params.approverName,
      subject: `[Action Required] Contravention Approval Request - ${params.referenceNo}`,
      htmlBody,
      cc: additionalCc,
    });
  },

  /**
   * Send notification when contravention is approved (to submitter)
   */
  async sendApprovalApprovedEmail(params: {
    submitterEmail: string;
    submitterName: string;
    referenceNo: string;
    employeeName: string;
    typeName: string;
    approverName: string;
    contraventionId: string;
  }): Promise<EmailResult> {
    const viewUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #22c55e;">Contravention Approved</h2>

        <p>Dear ${params.submitterName},</p>

        <p>Your contravention submission has been <strong style="color: #22c55e;">approved</strong>.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Reference No</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.referenceNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Employee</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.employeeName}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Type</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.typeName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Approved By</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.approverName}</td>
          </tr>
        </table>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #166534;">The contravention is now pending admin review for final processing.</p>
        </div>

        <p style="margin: 20px 0;">
          <a href="${viewUrl}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Contravention
          </a>
        </p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.submitterEmail,
      toName: params.submitterName,
      subject: `Contravention Approved: ${params.referenceNo}`,
      htmlBody,
    });
  },

  /**
   * Send notification when contravention is rejected (to submitter)
   */
  async sendApprovalRejectedEmail(params: {
    submitterEmail: string;
    submitterName: string;
    referenceNo: string;
    employeeName: string;
    typeName: string;
    approverName: string;
    rejectionReason: string;
    contraventionId: string;
  }): Promise<EmailResult> {
    const editUrl = `${EMAIL_CONFIG.APP_URL}/contraventions/${params.contraventionId}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Contravention Rejected</h2>

        <p>Dear ${params.submitterName},</p>

        <p>Your contravention submission has been <strong style="color: #dc2626;">rejected</strong> and requires your attention.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Reference No</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.referenceNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Employee</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.employeeName}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Type</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.typeName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Rejected By</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.approverName}</td>
          </tr>
        </table>

        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #991b1b;">Rejection Reason:</p>
          <p style="margin: 0; color: #7f1d1d;">${params.rejectionReason}</p>
        </div>

        <div style="background-color: #fffbeb; border: 1px solid #fde68a; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 12px 0; font-weight: bold; color: #92400e;">Action Required</p>
          <p style="margin: 0; color: #78350f;">Please review the feedback, make necessary changes, and resubmit the contravention.</p>
        </div>

        <p style="margin: 24px 0; text-align: center;">
          <a href="${editUrl}" style="background-color: #f97316; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Edit and Resubmit
          </a>
        </p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
      </div>
    `;

    return this.send({
      to: params.submitterEmail,
      toName: params.submitterName,
      subject: `[Action Required] Contravention Rejected - ${params.referenceNo}`,
      htmlBody,
    });
  },

  /**
   * Get current email configuration status
   */
  getStatus() {
    return {
      provider: 'Postman.gov.sg',
      configured: !!EMAIL_CONFIG.POSTMAN_API_KEY,
      sandboxMode: EMAIL_CONFIG.SANDBOX_MODE,
      sandboxEmail: EMAIL_CONFIG.SANDBOX_EMAIL,
      fromName: EMAIL_CONFIG.FROM_NAME,
      fromEmail: EMAIL_CONFIG.FROM_EMAIL,
      alwaysCc: EMAIL_CONFIG.ALWAYS_CC,
    };
  },

  /**
   * Get sandbox status (alias for backward compatibility)
   */
  getSandboxStatus() {
    return {
      enabled: EMAIL_CONFIG.SANDBOX_MODE,
      sandboxEmail: EMAIL_CONFIG.SANDBOX_EMAIL,
      emailProviderConfigured: !!EMAIL_CONFIG.POSTMAN_API_KEY,
    };
  },
};

export default emailService;
