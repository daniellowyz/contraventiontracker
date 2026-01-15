import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import slackService from '../services/slack.service';
import approvalService from '../services/approval.service';
import contraventionService from '../services/contravention.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Slack interaction payload types
interface SlackInteractionPayload {
  type: string;
  trigger_id?: string;
  callback_id?: string;
  user: {
    id: string;
    username: string;
    name: string;
  };
  channel?: {
    id: string;
  };
  message?: {
    ts: string;
  };
  actions?: Array<{
    action_id: string;
    value: string;
    block_id?: string;
  }>;
  view?: {
    callback_id: string;
    state: {
      values: Record<string, Record<string, { value?: string; selected_option?: { value: string }; selected_date?: string }>>;
    };
    private_metadata?: string;
  };
  response_url?: string;
}

interface SlackSlashCommandPayload {
  command: string;
  text: string;
  trigger_id: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  response_url: string;
}

/**
 * Verify Slack request signature
 * In production, you should verify the signature using SLACK_SIGNING_SECRET
 */
function verifySlackRequest(req: Request): boolean {
  // For now, just check that it looks like a Slack request
  // In production, implement proper signature verification
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];

  // Basic validation - in production, verify the signature
  if (!timestamp) {
    console.warn('[Slack] Missing timestamp header');
    return false;
  }

  // Check that the timestamp is recent (within 5 minutes)
  const requestTime = parseInt(timestamp as string, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - requestTime) > 300) {
    console.warn('[Slack] Request timestamp too old');
    return false;
  }

  return true;
}

// POST /api/slack/interactions - Handle Slack interactive components
router.post('/interactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Slack sends the payload as a URL-encoded string in the "payload" field
    const payloadString = req.body.payload;
    if (!payloadString) {
      // Could be a URL verification challenge
      if (req.body.type === 'url_verification') {
        return res.json({ challenge: req.body.challenge });
      }
      throw new AppError('Missing payload', 400);
    }

    const payload: SlackInteractionPayload = JSON.parse(payloadString);
    console.log('[Slack] Interaction received:', payload.type, payload.callback_id || payload.actions?.[0]?.action_id);

    // Handle different interaction types
    if (payload.type === 'block_actions') {
      await handleBlockActions(payload, res);
    } else if (payload.type === 'view_submission') {
      await handleViewSubmission(payload, res);
    } else if (payload.type === 'shortcut') {
      await handleShortcut(payload, res);
    } else {
      // Acknowledge unknown types
      res.json({ ok: true });
    }
  } catch (error) {
    console.error('[Slack] Interaction error:', error);
    // Always respond to Slack to prevent timeout
    res.json({
      response_type: 'ephemeral',
      text: `Error: ${(error as Error).message}`,
    });
  }
});

// POST /api/slack/commands - Handle Slack slash commands
router.post('/commands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload: SlackSlashCommandPayload = req.body;
    console.log('[Slack] Command received:', payload.command, payload.text);

    // Handle /contravention command
    if (payload.command === '/contravention') {
      const subCommand = payload.text.trim().toLowerCase();

      if (subCommand === 'new' || subCommand === 'create') {
        // Open the contravention creation modal
        await openCreateModal(payload.trigger_id, res);
      } else if (subCommand === 'help') {
        res.json({
          response_type: 'ephemeral',
          text: '*Contravention Tracker Commands:*\n' +
            '• `/contravention new` - Create a new contravention\n' +
            '• `/contravention help` - Show this help message',
        });
      } else {
        // Default: show help
        res.json({
          response_type: 'ephemeral',
          text: 'Unknown command. Use `/contravention help` for available commands.',
        });
      }
    } else {
      res.json({
        response_type: 'ephemeral',
        text: 'Unknown command',
      });
    }
  } catch (error) {
    console.error('[Slack] Command error:', error);
    res.json({
      response_type: 'ephemeral',
      text: `Error: ${(error as Error).message}`,
    });
  }
});

// POST /api/slack/events - Handle Slack events (for future use)
router.post('/events', async (req: Request, res: Response) => {
  try {
    // Handle URL verification challenge
    if (req.body.type === 'url_verification') {
      return res.json({ challenge: req.body.challenge });
    }

    console.log('[Slack] Event received:', req.body.event?.type);

    // Acknowledge the event
    res.json({ ok: true });
  } catch (error) {
    console.error('[Slack] Event error:', error);
    res.json({ ok: true });
  }
});

/**
 * Handle block action interactions (button clicks, etc.)
 */
async function handleBlockActions(payload: SlackInteractionPayload, res: Response) {
  const action = payload.actions?.[0];
  if (!action) {
    return res.json({ ok: true });
  }

  const { action_id, value } = action;

  if (action_id === 'approve_contravention' || action_id === 'reject_contravention') {
    const approvalId = value;
    const status = action_id === 'approve_contravention' ? 'APPROVED' : 'REJECTED';

    // Find the user by Slack ID
    const slackUserId = payload.user.id;
    const user = await findUserBySlackId(slackUserId);

    if (!user) {
      return res.json({
        response_type: 'ephemeral',
        text: 'Your Slack account is not linked to a Contravention Tracker account.',
      });
    }

    try {
      // Review the approval
      const approval = await approvalService.reviewApproval(approvalId, user.id, status);

      // Update the original message
      if (payload.channel && payload.message) {
        await slackService.updateApprovalMessage(
          payload.channel.id,
          payload.message.ts,
          approval.contravention.referenceNo,
          status,
          user.name
        );
      }

      // Send confirmation
      res.json({
        response_type: 'ephemeral',
        text: `Successfully ${status.toLowerCase()} contravention ${approval.contravention.referenceNo}`,
      });
    } catch (error) {
      res.json({
        response_type: 'ephemeral',
        text: `Error: ${(error as Error).message}`,
      });
    }
  } else if (action_id === 'open_create_modal') {
    // Open the contravention creation modal
    if (payload.trigger_id) {
      await openCreateModal(payload.trigger_id, res);
    } else {
      res.json({ ok: true });
    }
  } else if (action_id === 'approve_approver_request') {
    // Handle approver role request approval - process synchronously before responding
    const userId = value;
    const approverName = payload.user.name || payload.user.username || 'Admin';

    try {
      // Get the requesting user
      const requestingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, approverRequestStatus: true },
      });

      if (!requestingUser) {
        return res.json({
          response_type: 'ephemeral',
          text: 'User not found.',
        });
      }

      if (requestingUser.approverRequestStatus !== 'PENDING') {
        return res.json({
          response_type: 'ephemeral',
          text: `This request has already been ${requestingUser.approverRequestStatus?.toLowerCase() || 'processed'}.`,
        });
      }

      // Approve: update user role to APPROVER
      await prisma.user.update({
        where: { id: userId },
        data: {
          role: 'APPROVER',
          approverRequestStatus: 'APPROVED',
        },
      });

      // Update the original message to show it's been processed
      if (payload.channel && payload.message) {
        await slackService.updateApproverRequestMessage(
          payload.channel.id,
          payload.message.ts,
          requestingUser.name,
          'APPROVED',
          approverName
        );
      }

      // Respond with success
      res.json({
        response_type: 'ephemeral',
        text: `Successfully approved ${requestingUser.name}'s approver request.`,
      });
    } catch (error) {
      console.error('[Slack] Error processing approver request:', error);
      res.json({
        response_type: 'ephemeral',
        text: `Error: ${(error as Error).message}`,
      });
    }
  } else {
    // Unknown action, just acknowledge
    res.json({ ok: true });
  }
}

/**
 * Handle modal view submissions
 */
async function handleViewSubmission(payload: SlackInteractionPayload, res: Response) {
  const callbackId = payload.view?.callback_id;

  if (callbackId === 'create_contravention_modal') {
    const values = payload.view?.state?.values;
    if (!values) {
      return res.json({
        response_action: 'errors',
        errors: { description_block: 'Missing form data' },
      });
    }

    // Extract form values
    const employeeId = values.employee_block?.employee_select?.selected_option?.value;
    const typeId = values.type_block?.type_select?.selected_option?.value;
    const teamId = values.team_block?.team_select?.selected_option?.value;
    const vendor = values.vendor_block?.vendor_input?.value;
    const valueStr = values.value_block?.value_input?.value;
    const incidentDate = values.date_block?.date_select?.selected_date;
    const description = values.description_block?.description_input?.value;
    const justification = values.justification_block?.justification_input?.value;
    const mitigation = values.mitigation_block?.mitigation_input?.value;

    // Validate required fields
    const errors: Record<string, string> = {};
    if (!employeeId) errors.employee_block = 'Employee is required';
    if (!typeId) errors.type_block = 'Type is required';
    if (!teamId) errors.team_block = 'Team is required';
    if (!incidentDate) errors.date_block = 'Date is required';
    if (!description) errors.description_block = 'Description is required';
    if (!justification) errors.justification_block = 'Justification is required';
    if (!mitigation) errors.mitigation_block = 'Mitigation is required';

    if (Object.keys(errors).length > 0) {
      return res.json({
        response_action: 'errors',
        errors,
      });
    }

    // Find the user who submitted
    const user = await findUserBySlackId(payload.user.id);
    if (!user) {
      return res.json({
        response_action: 'errors',
        errors: { employee_block: 'Your Slack account is not linked' },
      });
    }

    try {
      // Create the contravention
      const contravention = await contraventionService.create({
        employeeId: employeeId!,
        typeId: typeId!,
        teamId: teamId!,
        vendor: vendor || undefined,
        valueSgd: valueStr ? parseFloat(valueStr) : undefined,
        incidentDate: incidentDate!,
        description: description!,
        justification: justification!,
        mitigation: mitigation!,
      }, user.id);

      // Close the modal with a success message
      res.json({
        response_action: 'clear',
      });

      // Send a confirmation message to the user
      await slackService.postMessage(payload.user.id, [],
        `:white_check_mark: Contravention *${contravention.referenceNo}* created successfully!`
      );
    } catch (error) {
      return res.json({
        response_action: 'errors',
        errors: { description_block: (error as Error).message },
      });
    }
  } else {
    // Unknown modal, just close it
    res.json({ response_action: 'clear' });
  }
}

/**
 * Handle shortcuts (global/message shortcuts)
 */
async function handleShortcut(payload: SlackInteractionPayload, res: Response) {
  if (payload.callback_id === 'create_contravention' && payload.trigger_id) {
    await openCreateModal(payload.trigger_id, res);
  } else {
    res.json({ ok: true });
  }
}

/**
 * Open the contravention creation modal
 */
async function openCreateModal(triggerId: string, res: Response) {
  try {
    // Fetch employees, types, and teams for the dropdowns
    const [employees, types, teams] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 100, // Slack limit
      }),
      prisma.contraventionType.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.team.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    await slackService.openContraventionModal(triggerId, employees, types, teams);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Slack] Failed to open modal:', error);
    res.json({
      response_type: 'ephemeral',
      text: `Failed to open form: ${(error as Error).message}`,
    });
  }
}

/**
 * Find a user by their Slack ID
 */
async function findUserBySlackId(slackUserId: string): Promise<{ id: string; name: string; email: string } | null> {
  // First, look up the email from Slack
  const email = await getEmailFromSlackId(slackUserId);
  if (!email) return null;

  // Then find the user in our database
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, name: true, email: true },
  });

  return user;
}

/**
 * Get email from Slack user ID
 */
async function getEmailFromSlackId(slackUserId: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const result = await response.json() as { ok: boolean; user?: { profile?: { email?: string } } };
    if (result.ok && result.user?.profile?.email) {
      return result.user.profile.email;
    }
    return null;
  } catch (error) {
    console.error('[Slack] users.info error:', error);
    return null;
  }
}

export default router;
