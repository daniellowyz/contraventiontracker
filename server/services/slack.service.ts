/**
 * Slack Service - Slack integration for Contravention Tracker
 * Features:
 * - Pull active users from Slack workspace
 * - Post announcements for confirmed contraventions
 * - Handle interactive approvals from Slack
 * - Create contraventions via Slack modal
 */

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    email?: string;
    display_name?: string;
    real_name?: string;
    first_name?: string;
    last_name?: string;
    image_72?: string;
  };
  is_bot?: boolean;
  is_app_user?: boolean;
  deleted?: boolean;
  is_restricted?: boolean;
  is_ultra_restricted?: boolean;
}

interface SlackUserListResponse {
  ok: boolean;
  members?: SlackUser[];
  response_metadata?: {
    next_cursor?: string;
  };
  error?: string;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
  message?: unknown;
  view?: unknown;
  trigger_id?: string;
}

export interface NormalizedSlackUser {
  slackId: string;
  email: string;
  name: string;
  displayName: string;
  isActive: boolean;
  avatarUrl?: string;
}

export interface ContraventionAnnouncement {
  referenceNo: string;
  employeeName: string;
  teamName: string;
  typeName: string;
  severity?: string;  // Optional - for backwards compatibility
  points: number;
  valueSgd?: number;
  vendor?: string;
  incidentDate: string;
  description: string;
  justification: string;
  mitigation: string;
  contraventionId: string;
}

export interface ApprovalRequest {
  approvalId: string;
  referenceNo: string;
  employeeName: string;
  typeName: string;
  severity?: string;  // Optional - for backwards compatibility
  requesterName: string;
  approverEmail: string;
  contraventionId: string;
  approvalPdfUrl?: string;
}

export interface RejectionAnnouncement {
  referenceNo: string;
  employeeName: string;
  teamName: string;
  typeName: string;
  rejectedBy: string;
  reason?: string;
  contraventionId: string;
  loggedByName: string;
}

export interface OpsNotification {
  type: 'pending_review' | 'new_approver_request' | 'approver_request_processed';
  title: string;
  message: string;
  fields?: Array<{ label: string; value: string }>;
  actionUrl?: string;
  actionText?: string;
}

export class SlackService {
  private token: string | undefined;
  private managementChannelId: string | undefined; // For approved contraventions (management visibility)
  private opsChannelId: string | undefined; // For ops team (admin action items)
  private baseUrl = 'https://slack.com/api';
  private appUrl: string;

  constructor() {
    this.token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN;
    this.managementChannelId = process.env.SLACK_CHANNEL_ID; // Existing channel for management
    this.opsChannelId = process.env.SLACK_OPS_CHANNEL_ID || 'C09NTF4LTC5'; // Ops channel for admin notifications
    this.appUrl = process.env.APP_URL || 'https://contraventiontracker.hack2026.gov.sg';
  }

  /**
   * Check if Slack integration is configured
   */
  isConfigured(): boolean {
    return !!this.token;
  }

  /**
   * Fetch all users from Slack workspace
   * Handles pagination automatically
   */
  async fetchAllUsers(): Promise<NormalizedSlackUser[]> {
    if (!this.token) {
      throw new Error('Slack token not configured. Set SLACK_TOKEN environment variable.');
    }

    console.log('[SlackService] Starting to fetch users from Slack...');
    console.log('[SlackService] Token configured:', this.token ? `${this.token.substring(0, 10)}...` : 'NOT SET');

    const allUsers: NormalizedSlackUser[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      pageCount++;
      console.log(`[SlackService] Fetching page ${pageCount}...`);

      const response = await this.fetchUsersPage(cursor);

      if (!response.ok) {
        console.error('[SlackService] Slack API error:', response.error);
        throw new Error(`Slack API error: ${response.error}`);
      }

      console.log(`[SlackService] Page ${pageCount}: Got ${response.members?.length || 0} members`);

      if (response.members) {
        const validUsers = response.members.filter(user => this.isValidUser(user));
        console.log(`[SlackService] Page ${pageCount}: ${validUsers.length} users passed domain filter`);

        const normalizedUsers = validUsers.map(user => this.normalizeUser(user));
        allUsers.push(...normalizedUsers);
      }

      cursor = response.response_metadata?.next_cursor;
    } while (cursor);

    console.log(`[SlackService] Fetch complete. Total users: ${allUsers.length}`);
    return allUsers;
  }

  /**
   * Fetch a single page of users
   */
  private async fetchUsersPage(cursor?: string): Promise<SlackUserListResponse> {
    const params = new URLSearchParams({
      limit: '200',
    });

    if (cursor) {
      params.append('cursor', cursor);
    }

    const response = await fetch(`${this.baseUrl}/users.list?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Filter out bots, apps, and deleted users
   */
  private isValidUser(user: SlackUser): boolean {
    // Skip bots, apps, and deleted users
    if (user.is_bot || user.is_app_user || user.deleted) {
      return false;
    }

    // Skip users without email (likely not real users)
    if (!user.profile?.email) {
      return false;
    }

    // Only include users with allowed domains
    const email = user.profile.email.toLowerCase();
    const allowedDomains = ['@open.gov.sg', '@tech.gov.sg', '@ogp.gov.sg'];
    const hasAllowedDomain = allowedDomains.some(domain => email.endsWith(domain));

    return hasAllowedDomain;
  }

  /**
   * Normalize Slack user data to our format
   */
  private normalizeUser(user: SlackUser): NormalizedSlackUser {
    const profile = user.profile || {};

    // Build display name from available fields
    const displayName = profile.display_name ||
                       profile.real_name ||
                       user.real_name ||
                       `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
                       user.name;

    return {
      slackId: user.id,
      email: profile.email!.toLowerCase(),
      name: profile.real_name || user.real_name || displayName,
      displayName,
      isActive: !user.deleted && !user.is_restricted && !user.is_ultra_restricted,
      avatarUrl: profile.image_72,
    };
  }

  /**
   * Get users who are in Slack but not in our database
   */
  async getNewUsers(existingEmails: string[]): Promise<NormalizedSlackUser[]> {
    const slackUsers = await this.fetchAllUsers();
    const existingSet = new Set(existingEmails.map(e => e.toLowerCase()));

    return slackUsers.filter(user => !existingSet.has(user.email));
  }

  /**
   * Get users who are in our database but deactivated/removed from Slack
   */
  async getDeactivatedUsers(existingEmails: string[]): Promise<string[]> {
    const slackUsers = await this.fetchAllUsers();
    const slackEmailSet = new Set(slackUsers.map(u => u.email));

    return existingEmails.filter(email => !slackEmailSet.has(email.toLowerCase()));
  }

  // ==================== MESSAGING METHODS ====================

  /**
   * Post a message to a Slack channel
   */
  async postMessage(channel: string, blocks: unknown[], text: string): Promise<SlackApiResponse> {
    if (!this.token) {
      throw new Error('Slack token not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        blocks,
        text, // Fallback text for notifications
      }),
    });

    const result = await response.json() as SlackApiResponse;
    if (!result.ok) {
      console.error('[SlackService] postMessage error:', result.error);
      throw new Error(`Slack API error: ${result.error}`);
    }

    return result;
  }

  /**
   * Announce an APPROVED contravention to the management channel
   * This is called only when a contravention is fully approved (not during creation)
   * Format focused on learning and transparency - shows full details including mitigation
   */
  async announceApprovedContravention(data: ContraventionAnnouncement): Promise<void> {
    if (!this.token || !this.managementChannelId) {
      console.log('[SlackService] Slack not configured, skipping approved contravention announcement');
      return;
    }

    const severityEmoji: Record<string, string> = {
      'LOW': ':large_blue_circle:',
      'MEDIUM': ':large_yellow_circle:',
      'HIGH': ':large_orange_circle:',
      'CRITICAL': ':red_circle:',
    };

    const emoji = data.severity ? (severityEmoji[data.severity] || ':white_circle:') : ':memo:';
    const viewUrl = `${this.appUrl}/contraventions/${data.contraventionId}`;

    // Format value if present
    const valueStr = data.valueSgd
      ? `$${data.valueSgd.toLocaleString('en-SG', { minimumFractionDigits: 2 })}`
      : null;

    // Build the details line
    let detailsLine = `${emoji} ${data.points} pts`;
    if (valueStr) {
      detailsLine += ` • ${valueStr}`;
    }
    if (data.vendor) {
      detailsLine += ` • ${data.vendor}`;
    }

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `:clipboard: Contravention: ${data.referenceNo}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.employeeName}* • ${data.teamName}\n:calendar: ${data.incidentDate}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Type:* ${data.typeName}\n${detailsLine}`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*What happened:*\n${data.description}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Why it happened:*\n${data.justification}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*How we'll prevent this:*\n${data.mitigation}`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
              emoji: true,
            },
            url: viewUrl,
            action_id: 'view_contravention_details',
          },
        ],
      },
    ];

    const text = `Contravention ${data.referenceNo} for ${data.employeeName} - ${data.typeName}`;

    try {
      await this.postMessage(this.managementChannelId, blocks, text);
      console.log(`[SlackService] Announced approved contravention ${data.referenceNo} to management channel`);
    } catch (error) {
      console.error('[SlackService] Failed to announce approved contravention:', error);
    }
  }

  /**
   * Send an approval request notification to an approver via DM
   */
  async sendApprovalRequest(data: ApprovalRequest): Promise<void> {
    if (!this.token) {
      console.log('[SlackService] Slack not configured, skipping approval request');
      return;
    }

    // Find the user by email to get their Slack ID
    const slackUserId = await this.findUserByEmail(data.approverEmail);
    if (!slackUserId) {
      console.log(`[SlackService] Could not find Slack user for ${data.approverEmail}`);
      return;
    }

    const severityEmoji = data.severity ? this.getSeverityEmoji(data.severity) : ':memo:';
    const viewUrl = `${this.appUrl}/contraventions/${data.contraventionId}`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji} Approval Request`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.requesterName}* has submitted a contravention for your approval.`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Reference:*\n${data.referenceNo}`,
          },
          {
            type: 'mrkdwn',
            text: `*Employee:*\n${data.employeeName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${data.typeName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Points:*\nSee details`,
          },
        ],
      },
      {
        type: 'actions',
        block_id: `approval_${data.approvalId}`,
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Approve',
              emoji: true,
            },
            style: 'primary',
            action_id: 'approve_contravention',
            value: data.approvalId,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Reject',
              emoji: true,
            },
            style: 'danger',
            action_id: 'reject_contravention',
            value: data.approvalId,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
              emoji: true,
            },
            url: viewUrl,
            action_id: 'view_contravention_approval',
          },
        ],
      },
    ];

    // Add document link if available
    if (data.approvalPdfUrl) {
      blocks.splice(3, 0, {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Supporting Document:* <${data.approvalPdfUrl}|View PDF>`,
        },
      });
    }

    const text = `Approval request for contravention ${data.referenceNo} from ${data.requesterName}`;

    try {
      await this.postMessage(slackUserId, blocks, text);
      console.log(`[SlackService] Sent approval request to ${data.approverEmail}`);
    } catch (error) {
      console.error('[SlackService] Failed to send approval request:', error);
    }
  }

  /**
   * Update a message to show the approval result
   */
  async updateApprovalMessage(
    channel: string,
    ts: string,
    referenceNo: string,
    status: 'APPROVED' | 'REJECTED',
    reviewerName: string
  ): Promise<void> {
    if (!this.token) return;

    const emoji = status === 'APPROVED' ? ':white_check_mark:' : ':x:';
    const statusText = status === 'APPROVED' ? 'Approved' : 'Rejected';

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *Contravention ${referenceNo}* has been *${statusText}* by ${reviewerName}`,
        },
      },
    ];

    try {
      await fetch(`${this.baseUrl}/chat.update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          ts,
          blocks,
          text: `Contravention ${referenceNo} ${statusText.toLowerCase()} by ${reviewerName}`,
        }),
      });
    } catch (error) {
      console.error('[SlackService] Failed to update approval message:', error);
    }
  }

  /**
   * Open a modal for creating a new contravention
   */
  async openContraventionModal(triggerId: string, employees: Array<{ id: string; name: string }>, types: Array<{ id: string; name: string }>, teams: Array<{ id: string; name: string }>): Promise<void> {
    if (!this.token) {
      throw new Error('Slack token not configured');
    }

    const view = {
      type: 'modal',
      callback_id: 'create_contravention_modal',
      title: {
        type: 'plain_text',
        text: 'New Contravention',
      },
      submit: {
        type: 'plain_text',
        text: 'Submit',
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
      },
      blocks: [
        {
          type: 'input',
          block_id: 'employee_block',
          element: {
            type: 'static_select',
            action_id: 'employee_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select employee',
            },
            options: employees.slice(0, 100).map(e => ({
              text: { type: 'plain_text' as const, text: e.name.substring(0, 75) },
              value: e.id,
            })),
          },
          label: {
            type: 'plain_text',
            text: 'Employee',
          },
        },
        {
          type: 'input',
          block_id: 'type_block',
          element: {
            type: 'static_select',
            action_id: 'type_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select type',
            },
            options: types.map(t => ({
              text: { type: 'plain_text' as const, text: t.name.substring(0, 75) },
              value: t.id,
            })),
          },
          label: {
            type: 'plain_text',
            text: 'Contravention Type',
          },
        },
        {
          type: 'input',
          block_id: 'team_block',
          element: {
            type: 'static_select',
            action_id: 'team_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select team',
            },
            options: teams.map(t => ({
              text: { type: 'plain_text' as const, text: t.name.substring(0, 75) },
              value: t.id,
            })),
          },
          label: {
            type: 'plain_text',
            text: 'Team',
          },
        },
        {
          type: 'input',
          block_id: 'vendor_block',
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'vendor_input',
            placeholder: {
              type: 'plain_text',
              text: 'Enter vendor name (optional)',
            },
          },
          label: {
            type: 'plain_text',
            text: 'Vendor',
          },
        },
        {
          type: 'input',
          block_id: 'value_block',
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'value_input',
            placeholder: {
              type: 'plain_text',
              text: 'Enter value in SGD (optional)',
            },
          },
          label: {
            type: 'plain_text',
            text: 'Value (SGD)',
          },
        },
        {
          type: 'input',
          block_id: 'date_block',
          element: {
            type: 'datepicker',
            action_id: 'date_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select date',
            },
          },
          label: {
            type: 'plain_text',
            text: 'Incident Date',
          },
        },
        {
          type: 'input',
          block_id: 'description_block',
          element: {
            type: 'plain_text_input',
            action_id: 'description_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Describe the contravention...',
            },
          },
          label: {
            type: 'plain_text',
            text: 'Description',
          },
        },
        {
          type: 'input',
          block_id: 'justification_block',
          element: {
            type: 'plain_text_input',
            action_id: 'justification_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Explain the justification...',
            },
          },
          label: {
            type: 'plain_text',
            text: 'Justification',
          },
        },
        {
          type: 'input',
          block_id: 'mitigation_block',
          element: {
            type: 'plain_text_input',
            action_id: 'mitigation_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Describe mitigation measures...',
            },
          },
          label: {
            type: 'plain_text',
            text: 'Mitigation Measures',
          },
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/views.open`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trigger_id: triggerId,
        view,
      }),
    });

    const result = await response.json() as SlackApiResponse;
    if (!result.ok) {
      console.error('[SlackService] views.open error:', result.error);
      throw new Error(`Slack API error: ${result.error}`);
    }
  }

  /**
   * Find a Slack user ID by email
   */
  async findUserByEmail(email: string): Promise<string | null> {
    if (!this.token) return null;

    try {
      const response = await fetch(`${this.baseUrl}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      const result = await response.json() as { ok: boolean; user?: { id: string }; error?: string };
      if (result.ok && result.user) {
        return result.user.id;
      }
      return null;
    } catch (error) {
      console.error('[SlackService] lookupByEmail error:', error);
      return null;
    }
  }

  /**
   * Get the emoji for a severity level
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return ':rotating_light:';
      case 'HIGH':
        return ':warning:';
      case 'MEDIUM':
        return ':large_orange_diamond:';
      case 'LOW':
        return ':large_blue_diamond:';
      default:
        return ':memo:';
    }
  }

  /**
   * Post announcement to the management channel
   */
  async postToManagementChannel(text: string): Promise<void> {
    if (!this.token || !this.managementChannelId) {
      console.log('[SlackService] Management channel not configured, skipping post');
      return;
    }

    await this.postMessage(this.managementChannelId, [], text);
  }

  /**
   * Post announcement to the ops channel
   */
  async postToOpsChannel(text: string): Promise<void> {
    if (!this.token || !this.opsChannelId) {
      console.log('[SlackService] Ops channel not configured, skipping post');
      return;
    }

    await this.postMessage(this.opsChannelId, [], text);
  }

  /**
   * Get the configured management channel ID
   */
  getManagementChannelId(): string | undefined {
    return this.managementChannelId;
  }

  /**
   * Get the configured ops channel ID
   */
  getOpsChannelId(): string | undefined {
    return this.opsChannelId;
  }

  /**
   * Send approver role request notification to the ops channel
   * This notifies admins that a new user is requesting approver permissions
   */
  async sendApproverRoleRequestToChannel(data: {
    requestingUserId: string;
    requestingUserName: string;
    requestingUserEmail: string;
    position: string;
  }): Promise<void> {
    if (!this.token || !this.opsChannelId) {
      console.log('[SlackService] Slack not configured, skipping approver request notification');
      return;
    }

    // Use the ops channel for admin notifications
    const channelId = this.opsChannelId;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':raising_hand: New Approver Request',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.requestingUserName}* has requested approver permissions.`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Name:*\n${data.requestingUserName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${data.requestingUserEmail}`,
          },
          {
            type: 'mrkdwn',
            text: `*Position:*\n${data.position}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Approve',
              emoji: true,
            },
            style: 'primary',
            action_id: 'approve_approver_request',
            value: data.requestingUserId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_Click Approve or reject via the web app_ • cc @finance',
          },
        ],
      },
    ];

    const text = `${data.requestingUserName} (${data.position}) has requested approver permissions @finance`;

    try {
      await this.postMessage(channelId, blocks, text);
      console.log(`[SlackService] Sent approver request to channel ${channelId}`);
    } catch (error) {
      console.error('[SlackService] Failed to send approver request to channel:', error);
    }
  }

  /**
   * Update approver request message after it's been processed
   */
  async updateApproverRequestMessage(
    channelId: string,
    messageTs: string,
    requestingUserName: string,
    status: 'APPROVED' | 'REJECTED',
    reviewerName: string
  ): Promise<void> {
    if (!this.token) return;

    const statusEmoji = status === 'APPROVED' ? ':white_check_mark:' : ':x:';
    const statusColor = status === 'APPROVED' ? '#22c55e' : '#ef4444';
    const statusText = status === 'APPROVED' ? 'approved' : 'rejected';

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusEmoji} Approver Request ${status}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${requestingUserName}*'s approver request has been *${statusText}* by ${reviewerName}.`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Processed on ${new Date().toLocaleString('en-SG')}_`,
          },
        ],
      },
    ];

    try {
      const response = await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          ts: messageTs,
          blocks,
          text: `${requestingUserName}'s approver request has been ${statusText} by ${reviewerName}`,
        }),
      });

      const result = await response.json() as { ok: boolean; error?: string };
      if (!result.ok) {
        console.error('[SlackService] Failed to update message:', result.error);
      }
    } catch (error) {
      console.error('[SlackService] Error updating approver request message:', error);
    }
  }

  /**
   * Notify ops channel when a contravention is pending admin review
   * This is sent to the ops channel for admin team visibility
   */
  async notifyPendingAdminReview(data: {
    referenceNo: string;
    employeeName: string;
    typeName: string;
    severity?: string;  // Optional - for backwards compatibility
    reason: string; // Why it went to admin review (e.g., "Rejected by approver", "Escalated")
    contraventionId: string;
  }): Promise<void> {
    if (!this.token || !this.opsChannelId) {
      console.log('[SlackService] Slack not configured, skipping pending review notification');
      return;
    }

    const severityEmoji = data.severity ? this.getSeverityEmoji(data.severity) : ':memo:';
    const viewUrl = `${this.appUrl}/contraventions/${data.contraventionId}`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji} Contravention Pending Admin Review`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `A contravention requires admin attention.`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Reference:*\n${data.referenceNo}`,
          },
          {
            type: 'mrkdwn',
            text: `*Employee:*\n${data.employeeName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${data.typeName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\nPending Review`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason for review:*\n${data.reason}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Review Now',
              emoji: true,
            },
            style: 'primary',
            url: viewUrl,
            action_id: 'review_contravention',
          },
        ],
      },
      {
        type: 'divider',
      },
    ];

    const text = `Contravention ${data.referenceNo} requires admin review - ${data.reason}`;

    try {
      await this.postMessage(this.opsChannelId, blocks, text);
      console.log(`[SlackService] Notified ops channel about pending review for ${data.referenceNo}`);
    } catch (error) {
      console.error('[SlackService] Failed to notify pending review:', error);
    }
  }

  /**
   * Announce a rejected contravention to the ops channel
   * This is for ops visibility when contraventions are rejected
   */
  async announceRejection(data: RejectionAnnouncement): Promise<void> {
    if (!this.token || !this.opsChannelId) {
      console.log('[SlackService] Slack not configured, skipping rejection announcement');
      return;
    }

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `❌ Contravention Rejected: ${data.referenceNo}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.employeeName}* • ${data.teamName}\n*Type:* ${data.typeName}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Rejected by:* ${data.rejectedBy}`,
        },
      },
      ...(data.reason ? [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason:*\n${data.reason}`,
        },
      }] : []),
      {
        type: 'divider',
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details',
              emoji: true,
            },
            url: `${this.appUrl}/contraventions/${data.contraventionId}`,
            action_id: 'view_rejected_contravention',
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Originally logged by ${data.loggedByName}_`,
          },
        ],
      },
    ];

    const text = `Contravention ${data.referenceNo} for ${data.employeeName} was rejected by ${data.rejectedBy}`;

    try {
      await this.postMessage(this.opsChannelId, blocks, text);
      console.log(`[SlackService] Announced rejection of ${data.referenceNo} to ops channel`);
    } catch (error) {
      console.error('[SlackService] Failed to announce rejection:', error);
    }
  }

}

export default new SlackService();
