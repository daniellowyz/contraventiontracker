/**
 * Slack Service - Pull active users from Slack workspace
 * Uses users:read permission to list all workspace members
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

export interface NormalizedSlackUser {
  slackId: string;
  email: string;
  name: string;
  displayName: string;
  isActive: boolean;
  avatarUrl?: string;
}

export class SlackService {
  private token: string | undefined;
  private baseUrl = 'https://slack.com/api';

  constructor() {
    this.token = process.env.SLACK_TOKEN;
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
}

export default new SlackService();
