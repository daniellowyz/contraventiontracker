// Google Apps Script - Contravention Tracker Email Service
// Deploy this as a Web App (Execute as: Me, Who has access: Anyone)

// Configuration
const SENDER_EMAIL = 'finance@open.gov.sg';  // Send from this email (must be configured in Gmail settings)
const ALWAYS_CC = 'adriel@open.gov.sg';      // Always CC this email on all contravention emails
const APP_URL = 'https://contravention-tracker.vercel.app';

// Sandbox mode - set to true to redirect all emails to SANDBOX_EMAIL for testing
const SANDBOX_MODE = false;
const SANDBOX_EMAIL = 'daniellow@open.gov.sg';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'No post data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Invalid JSON: ' + parseError.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Log incoming request
    console.log('Received webhook:', JSON.stringify(data));

    // Route based on email type
    let result;
    switch (data.type) {
      case 'CONTRAVENTION_LOGGED':
        result = sendContraventionLoggedEmail(data);
        break;
      case 'ESCALATION_TRIGGERED':
        result = sendEscalationEmail(data);
        break;
      case 'TRAINING_ASSIGNED':
        result = sendTrainingAssignedEmail(data);
        break;
      case 'ACKNOWLEDGMENT_REMINDER':
        result = sendAcknowledgmentReminderEmail(data);
        break;
      case 'TRAINING_OVERDUE':
        result = sendTrainingOverdueEmail(data);
        break;
      default:
        // Legacy: approval request email (when no type specified)
        if (!data.approverEmail) {
          return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: 'Missing type or approverEmail' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        result = sendApprovalEmail(data);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('Error processing webhook:', error);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests (for testing/health check)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'OK',
      message: 'Contravention Tracker Email Service is running',
      sandboxMode: SANDBOX_MODE,
      fromEmail: SENDER_EMAIL
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get the actual recipient (respecting sandbox mode)
 */
function getRecipient(originalEmail) {
  return SANDBOX_MODE ? SANDBOX_EMAIL : originalEmail;
}

/**
 * Build sandbox banner HTML if in sandbox mode
 */
function getSandboxBanner(originalEmail) {
  if (!SANDBOX_MODE) return '';
  return `
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
      <strong>⚠️ SANDBOX MODE</strong><br>
      This email was originally intended for: <strong>${originalEmail}</strong><br>
      It has been redirected to you for testing purposes.
    </div>
  `;
}

/**
 * Send notification when a new contravention is logged (to employee)
 */
function sendContraventionLoggedEmail(data) {
  const {
    employeeEmail,
    employeeName = 'Employee',
    referenceNo = 'N/A',
    typeName = 'N/A',
    severity = 'N/A',
    points = 0,
    contraventionId = ''
  } = data;

  const viewUrl = `${APP_URL}/contraventions/${contraventionId}`;
  const recipient = getRecipient(employeeEmail);
  const subjectPrefix = SANDBOX_MODE ? '[SANDBOX] ' : '';

  const htmlBody = `
    ${getSandboxBanner(employeeEmail)}
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Contravention Notification</h2>

      <p>Dear ${employeeName},</p>

      <p>A contravention has been logged against you with the following details:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Reference No</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${referenceNo}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Type</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${typeName}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Severity</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${severity}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Points</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${points}</td>
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

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
    </div>
  `;

  const emailOptions = {
    htmlBody: htmlBody,
    name: 'OGP Finance',
    from: SENDER_EMAIL,
    cc: ALWAYS_CC
  };

  GmailApp.sendEmail(recipient, `${subjectPrefix}Contravention Logged: ${referenceNo}`, '', emailOptions);
  return { sent: true, to: recipient, sandbox: SANDBOX_MODE };
}

/**
 * Send escalation notification email (to employee)
 */
function sendEscalationEmail(data) {
  const {
    employeeEmail,
    employeeName = 'Employee',
    level = 'LEVEL_1',
    totalPoints = 0,
    actionsRequired = []
  } = data;

  const levelNames = {
    'LEVEL_1': 'Level 1 - Verbal Advisory',
    'LEVEL_2': 'Level 2 - Mandatory Training',
    'LEVEL_3': 'Level 3 - Performance Impact',
  };

  const levelColors = {
    'LEVEL_1': '#eab308',
    'LEVEL_2': '#f97316',
    'LEVEL_3': '#dc2626',
  };

  const escalationsUrl = `${APP_URL}/escalations`;
  const levelName = levelNames[level] || level;
  const levelColor = levelColors[level] || '#ef4444';
  const actionsHtml = actionsRequired.map(action => `<li style="margin: 8px 0;">${action}</li>`).join('');

  const recipient = getRecipient(employeeEmail);
  const subjectPrefix = SANDBOX_MODE ? '[SANDBOX] ' : '';

  const htmlBody = `
    ${getSandboxBanner(employeeEmail)}
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${levelColor};">⚠️ Escalation Notification</h2>

      <p>Dear ${employeeName},</p>

      <p>Your contravention points have reached <strong>${totalPoints}</strong>, triggering an escalation to:</p>

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

  const emailOptions = {
    htmlBody: htmlBody,
    name: 'OGP Finance',
    from: SENDER_EMAIL,
    cc: ALWAYS_CC
  };

  GmailApp.sendEmail(recipient, `${subjectPrefix}Escalation Alert: ${levelName}`, '', emailOptions);
  return { sent: true, to: recipient, sandbox: SANDBOX_MODE };
}

/**
 * Send training assigned email (to employee)
 */
function sendTrainingAssignedEmail(data) {
  const {
    employeeEmail,
    employeeName = 'Employee',
    courseName = 'Training Course',
    dueDate,
    provider = 'Internal',
    durationHours = 'N/A'
  } = data;

  const trainingUrl = `${APP_URL}/training`;
  const formattedDate = dueDate ? new Date(dueDate).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : 'TBD';

  const recipient = getRecipient(employeeEmail);
  const subjectPrefix = SANDBOX_MODE ? '[SANDBOX] ' : '';

  const htmlBody = `
    ${getSandboxBanner(employeeEmail)}
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d9488;">Training Assignment</h2>

      <p>Dear ${employeeName},</p>

      <p>You have been assigned the following training course:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Course</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${courseName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Provider</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${provider}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Duration</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${durationHours} hours</td>
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

  const emailOptions = {
    htmlBody: htmlBody,
    name: 'OGP Finance',
    from: SENDER_EMAIL,
    cc: ALWAYS_CC
  };

  GmailApp.sendEmail(recipient, `${subjectPrefix}Training Assigned: ${courseName}`, '', emailOptions);
  return { sent: true, to: recipient, sandbox: SANDBOX_MODE };
}

/**
 * Send acknowledgment reminder email (to employee)
 */
function sendAcknowledgmentReminderEmail(data) {
  const {
    employeeEmail,
    employeeName = 'Employee',
    referenceNo = 'N/A',
    daysSinceLogged = 0,
    contraventionId = ''
  } = data;

  const viewUrl = `${APP_URL}/contraventions/${contraventionId}`;
  const recipient = getRecipient(employeeEmail);
  const subjectPrefix = SANDBOX_MODE ? '[SANDBOX] ' : '';

  const htmlBody = `
    ${getSandboxBanner(employeeEmail)}
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Acknowledgment Reminder</h2>

      <p>Dear ${employeeName},</p>

      <p>This is a reminder that contravention <strong>${referenceNo}</strong> was logged ${daysSinceLogged} days ago and is still pending acknowledgment.</p>

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

  const emailOptions = {
    htmlBody: htmlBody,
    name: 'OGP Finance',
    from: SENDER_EMAIL,
    cc: ALWAYS_CC
  };

  GmailApp.sendEmail(recipient, `${subjectPrefix}Reminder: Acknowledge Contravention ${referenceNo}`, '', emailOptions);
  return { sent: true, to: recipient, sandbox: SANDBOX_MODE };
}

/**
 * Send training overdue reminder (to employee)
 */
function sendTrainingOverdueEmail(data) {
  const {
    employeeEmail,
    employeeName = 'Employee',
    courseName = 'Training Course',
    dueDate,
    daysOverdue = 0
  } = data;

  const trainingUrl = `${APP_URL}/training`;
  const formattedDate = dueDate ? new Date(dueDate).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : 'N/A';

  const recipient = getRecipient(employeeEmail);
  const subjectPrefix = SANDBOX_MODE ? '[SANDBOX] ' : '';

  const htmlBody = `
    ${getSandboxBanner(employeeEmail)}
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">⚠️ Training Overdue</h2>

      <p>Dear ${employeeName},</p>

      <p>Your assigned training is now <strong style="color: #dc2626;">${daysOverdue} days overdue</strong>.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Course</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${courseName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Due Date</td>
          <td style="padding: 10px; border: 1px solid #ddd; color: #dc2626; font-weight: bold;">${formattedDate}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Days Overdue</td>
          <td style="padding: 10px; border: 1px solid #ddd; color: #dc2626; font-weight: bold;">${daysOverdue}</td>
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

  const emailOptions = {
    htmlBody: htmlBody,
    name: 'OGP Finance',
    from: SENDER_EMAIL,
    cc: ALWAYS_CC
  };

  GmailApp.sendEmail(recipient, `${subjectPrefix}OVERDUE: Training "${courseName}" - ${daysOverdue} days overdue`, '', emailOptions);
  return { sent: true, to: recipient, sandbox: SANDBOX_MODE };
}

/**
 * Legacy: Send approval request email (to approver)
 */
function sendApprovalEmail(data) {
  const {
    referenceNo = 'N/A',
    approverEmail,
    employeeEmail = '',
    employeeName = 'Unknown',
    contraventionType = 'N/A',
    vendor = 'N/A',
    valueSgd = 'N/A',
    incidentDate = 'N/A',
    description = 'N/A',
    justification = 'N/A',
    mitigation = 'N/A'
  } = data;

  const recipient = getRecipient(approverEmail);
  const subjectPrefix = SANDBOX_MODE ? '[SANDBOX] ' : '';

  const htmlBody = `
    ${getSandboxBanner(approverEmail)}
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Contravention Approval Request</h2>
      <p>Dear Approver,</p>
      <p>A contravention has been logged that requires your approval.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Reference No</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${referenceNo}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Employee</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${employeeName}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Contravention Type</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${contraventionType}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Vendor</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${vendor}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Value (SGD)</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${valueSgd}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Incident Date</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${incidentDate}</td>
        </tr>
      </table>

      <h3 style="color: #333; margin-top: 20px;">Description</h3>
      <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #007bff;">${description}</p>

      <h3 style="color: #333;">Justification</h3>
      <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #28a745;">${justification}</p>

      <h3 style="color: #333;">Mitigation Measures</h3>
      <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #ffc107;">${mitigation}</p>

      <p style="margin-top: 30px;">Please review and respond to this contravention approval request.</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #666; font-size: 12px;">This is an automated message from the Contravention Tracker system.</p>
    </div>
  `;

  // Build CC list - always include ALWAYS_CC, optionally add employee email
  let ccList = [ALWAYS_CC];
  if (employeeEmail && employeeEmail.includes('@') && employeeEmail !== ALWAYS_CC) {
    ccList.push(employeeEmail);
  }

  const emailOptions = {
    htmlBody: htmlBody,
    name: 'OGP Finance',
    from: SENDER_EMAIL,
    cc: ccList.join(',')
  };

  GmailApp.sendEmail(recipient, `${subjectPrefix}[Action Required] Contravention Approval Request - ${referenceNo}`, '', emailOptions);
  return { sent: true, to: recipient, sandbox: SANDBOX_MODE };
}

// ============ TEST FUNCTIONS ============

/**
 * Test contravention logged email
 */
function testContraventionLogged() {
  const testData = {
    type: 'CONTRAVENTION_LOGGED',
    employeeEmail: 'daniellow@open.gov.sg',
    employeeName: 'Test User',
    referenceNo: 'CTR-2026-TEST',
    typeName: 'Missing AOR',
    severity: 'HIGH',
    points: 3,
    contraventionId: 'test-123'
  };

  const result = sendContraventionLoggedEmail(testData);
  Logger.log('Result: ' + JSON.stringify(result));
}

/**
 * Test approval email (legacy)
 */
function testApprovalEmail() {
  const testData = {
    referenceNo: 'CONTRA-2026-TEST',
    approverEmail: 'daniellow@open.gov.sg',
    employeeEmail: 'test@example.com',
    employeeName: 'John Doe',
    contraventionType: 'DC Procurement - Missing AOR',
    vendor: 'Test Vendor Pte Ltd',
    valueSgd: '$10,000',
    incidentDate: '6 January 2026',
    description: 'Test description',
    justification: 'Test justification',
    mitigation: 'Test mitigation'
  };

  sendApprovalEmail(testData);
  Logger.log('Approval email sent');
}

/**
 * Test the doPost function with mock data
 */
function testDoPost() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        type: 'CONTRAVENTION_LOGGED',
        employeeEmail: 'daniellow@open.gov.sg',
        employeeName: 'Test User',
        referenceNo: 'CTR-2026-TEST',
        typeName: 'Missing AOR',
        severity: 'HIGH',
        points: 3,
        contraventionId: 'test-123'
      })
    }
  };

  const result = doPost(mockEvent);
  Logger.log('Result: ' + result.getContent());
}
