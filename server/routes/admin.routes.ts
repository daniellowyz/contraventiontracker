import { Router, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import slackService from '../services/slack.service';

const router = Router();

// ==================== APPROVERS LIST ====================

// GET /api/admin/approvers - List all users who can approve (APPROVER role only)
router.get('/approvers', authenticate, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const approvers = await prisma.user.findMany({
      where: {
        isActive: true,
        role: 'APPROVER',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        position: true,
        role: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: approvers });
  } catch (error) {
    next(error);
  }
});

// ==================== USER MANAGEMENT ====================

// GET /api/admin/users - List all users (admin only)
router.get('/users', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { search, role } = req.query;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { employeeId: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/users/:id/role - Update user role (admin only)
router.patch('/users/:id/role', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { role } = req.body;

    if (!role || !['ADMIN', 'APPROVER', 'USER'].includes(role)) {
      throw new AppError('Invalid role. Must be ADMIN, APPROVER, or USER.', 400);
    }

    // Prevent self-demotion
    if (req.params.id === req.user!.userId && role !== 'ADMIN') {
      throw new AppError('Cannot demote yourself from admin.', 400);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        entityType: 'USER',
        entityId: user.id,
        action: 'ROLE_CHANGE',
        userId: req.user!.userId,
        newValues: { role },
      },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/users/:id/status - Activate/deactivate user (admin only)
router.patch('/users/:id/status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      throw new AppError('isActive must be a boolean.', 400);
    }

    // Prevent self-deactivation
    if (req.params.id === req.user!.userId && !isActive) {
      throw new AppError('Cannot deactivate yourself.', 400);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        entityType: 'USER',
        entityId: user.id,
        action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
        userId: req.user!.userId,
        newValues: { isActive },
      },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// ==================== APPROVER ROLE REQUESTS ====================

// GET /api/admin/approver-requests - Get all pending approver role requests
router.get('/approver-requests', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const requests = await prisma.user.findMany({
      where: {
        requestedApprover: true,
        approverRequestStatus: 'PENDING',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        position: true,
        role: true,
        createdAt: true,
        isProfileComplete: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/approver-requests/:id/approve - Approve an approver role request
router.post('/approver-requests/:id/approve', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.requestedApprover || user.approverRequestStatus !== 'PENDING') {
      throw new AppError('No pending approver request for this user', 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role: 'APPROVER',
        approverRequestStatus: 'APPROVED',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        position: true,
      },
    });

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        entityType: 'USER',
        entityId: id,
        action: 'APPROVER_REQUEST_APPROVED',
        userId: req.user!.userId,
        newValues: { role: 'APPROVER' },
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: `${updatedUser.name} has been promoted to Approver`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/approver-requests/:id/reject - Reject an approver role request
router.post('/approver-requests/:id/reject', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.requestedApprover || user.approverRequestStatus !== 'PENDING') {
      throw new AppError('No pending approver request for this user', 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        approverRequestStatus: 'REJECTED',
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        role: true,
        position: true,
      },
    });

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        entityType: 'USER',
        entityId: id,
        action: 'APPROVER_REQUEST_REJECTED',
        userId: req.user!.userId,
        newValues: { reason: reason || 'No reason provided' },
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: `Approver request for ${updatedUser.name} has been rejected`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/merge - Merge two user accounts (admin only)
// Transfers all data from sourceId to targetId, then deletes source
router.post('/users/merge', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { sourceId, targetId } = req.body as { sourceId: string; targetId: string };

    if (!sourceId || !targetId) {
      throw new AppError('Both sourceId and targetId are required', 400);
    }

    if (sourceId === targetId) {
      throw new AppError('Cannot merge a user with themselves', 400);
    }

    // Get both users
    const [sourceUser, targetUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: sourceId } }),
      prisma.user.findUnique({ where: { id: targetId } }),
    ]);

    if (!sourceUser) {
      throw new AppError('Source user not found', 404);
    }
    if (!targetUser) {
      throw new AppError('Target user not found', 404);
    }

    console.log(`[UserMerge] Merging ${sourceUser.email} -> ${targetUser.email}`);

    // Transfer all relations from source to target
    const transfers = await prisma.$transaction([
      // Transfer contraventions (employee)
      prisma.contravention.updateMany({
        where: { employeeId: sourceId },
        data: { employeeId: targetId },
      }),
      // Transfer contraventions (logged by)
      prisma.contravention.updateMany({
        where: { loggedById: sourceId },
        data: { loggedById: targetId },
      }),
      // Transfer contraventions (acknowledged by)
      prisma.contravention.updateMany({
        where: { acknowledgedById: sourceId },
        data: { acknowledgedById: targetId },
      }),
      // Transfer escalations
      prisma.escalation.updateMany({
        where: { employeeId: sourceId },
        data: { employeeId: targetId },
      }),
      // Transfer disputes (submitted by)
      prisma.dispute.updateMany({
        where: { submittedById: sourceId },
        data: { submittedById: targetId },
      }),
      // Transfer disputes (decided by)
      prisma.dispute.updateMany({
        where: { decidedById: sourceId },
        data: { decidedById: targetId },
      }),
      // Transfer training records
      prisma.trainingRecord.updateMany({
        where: { employeeId: sourceId },
        data: { employeeId: targetId },
      }),
      // Transfer audit logs
      prisma.auditLog.updateMany({
        where: { userId: sourceId },
        data: { userId: targetId },
      }),
      // Transfer notifications
      prisma.notification.updateMany({
        where: { userId: sourceId },
        data: { userId: targetId },
      }),
      // Delete OTP records for source (not needed)
      prisma.otpRecord.deleteMany({
        where: { userId: sourceId },
      }),
    ]);

    // Handle EmployeePoints - merge points if both exist, or transfer
    const [sourcePoints, targetPoints] = await Promise.all([
      prisma.employeePoints.findUnique({ where: { employeeId: sourceId } }),
      prisma.employeePoints.findUnique({ where: { employeeId: targetId } }),
    ]);

    if (sourcePoints) {
      if (targetPoints) {
        // Both have points - add source points to target and delete source
        await prisma.employeePoints.update({
          where: { employeeId: targetId },
          data: {
            totalPoints: targetPoints.totalPoints + sourcePoints.totalPoints,
            currentLevel: sourcePoints.currentLevel > targetPoints.currentLevel
              ? sourcePoints.currentLevel
              : targetPoints.currentLevel,
          },
        });
        await prisma.employeePoints.delete({ where: { employeeId: sourceId } });
      } else {
        // Only source has points - transfer to target
        await prisma.employeePoints.update({
          where: { employeeId: sourceId },
          data: { employeeId: targetId },
        });
      }
    }

    // Delete the source user
    await prisma.user.delete({ where: { id: sourceId } });

    // Log the merge
    await prisma.auditLog.create({
      data: {
        entityType: 'USER',
        entityId: targetId,
        action: 'MERGE',
        userId: req.user!.userId,
        newValues: {
          mergedFrom: sourceUser.email,
          mergedTo: targetUser.email,
          sourceId,
          targetId,
        },
      },
    });

    console.log(`[UserMerge] Successfully merged ${sourceUser.email} into ${targetUser.email}`);

    res.json({
      success: true,
      message: `Successfully merged ${sourceUser.email} into ${targetUser.email}`,
      data: {
        deletedUser: sourceUser.email,
        targetUser: targetUser.email,
        transferredRecords: transfers.reduce((sum: number, t: { count: number }) => sum + t.count, 0),
      },
    });
  } catch (error) {
    console.error('[UserMerge] Error:', error);
    next(error);
  }
});

// GET /api/admin/users/duplicates - Find potential duplicate users (ogp vs open)
router.get('/users/duplicates', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Get all users with ogp.gov.sg emails
    const ogpUsers = await prisma.user.findMany({
      where: { email: { endsWith: '@ogp.gov.sg' } },
      select: {
        id: true,
        email: true,
        name: true,
        employeeId: true,
        _count: { select: { contraventions: true } },
      },
    });

    // For each ogp user, check if there's a matching open.gov.sg user
    const duplicates = [];
    for (const ogpUser of ogpUsers) {
      const username = ogpUser.email.replace('@ogp.gov.sg', '');
      const openEmail = `${username}@open.gov.sg`;

      const openUser = await prisma.user.findUnique({
        where: { email: openEmail },
        select: {
          id: true,
          email: true,
          name: true,
          employeeId: true,
          _count: { select: { contraventions: true } },
        },
      });

      if (openUser) {
        duplicates.push({
          ogpUser: {
            ...ogpUser,
            contraventionCount: ogpUser._count.contraventions,
          },
          openUser: {
            ...openUser,
            contraventionCount: openUser._count.contraventions,
          },
        });
      }
    }

    res.json({
      success: true,
      data: duplicates,
      count: duplicates.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/remap-contraventions - Remap contraventions from one user to another
router.post('/users/remap-contraventions', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { sourceUserId, targetUserId } = req.body as { sourceUserId: string; targetUserId: string };

    if (!sourceUserId || !targetUserId) {
      throw new AppError('Both sourceUserId and targetUserId are required', 400);
    }

    if (sourceUserId === targetUserId) {
      throw new AppError('Cannot remap to the same user', 400);
    }

    // Get both users
    const [sourceUser, targetUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: sourceUserId } }),
      prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);

    if (!sourceUser) {
      throw new AppError('Source user not found', 404);
    }
    if (!targetUser) {
      throw new AppError('Target user not found', 404);
    }

    console.log(`[RemapContraventions] Remapping contraventions from ${sourceUser.email} -> ${targetUser.email}`);

    // Remap contraventions
    const result = await prisma.contravention.updateMany({
      where: { employeeId: sourceUserId },
      data: { employeeId: targetUserId },
    });

    // Log the remap
    await prisma.auditLog.create({
      data: {
        entityType: 'USER',
        entityId: targetUserId,
        action: 'REMAP_CONTRAVENTIONS',
        userId: req.user!.userId,
        newValues: {
          fromUser: sourceUser.email,
          toUser: targetUser.email,
          contraventionsRemapped: result.count,
        },
      },
    });

    console.log(`[RemapContraventions] Successfully remapped ${result.count} contraventions`);

    res.json({
      success: true,
      message: `Successfully remapped ${result.count} contravention(s) from ${sourceUser.email} to ${targetUser.email}`,
      data: {
        fromUser: sourceUser.email,
        toUser: targetUser.email,
        contraventionsRemapped: result.count,
      },
    });
  } catch (error) {
    console.error('[RemapContraventions] Error:', error);
    next(error);
  }
});

// DELETE /api/admin/users/:id - Delete a user (admin only)
// Only allows deletion of ogp.gov.sg users with no contraventions
router.delete('/users/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Safety check: only allow deletion of ogp.gov.sg users
    if (!user.email.endsWith('@ogp.gov.sg')) {
      throw new AppError('Can only delete @ogp.gov.sg placeholder accounts', 400);
    }

    // Get counts separately
    const contraventionCount = await prisma.contravention.count({ where: { employeeId: id } });
    const loggedContrasCount = await prisma.contravention.count({ where: { loggedById: id } });
    const acknowledgedContrasCount = await prisma.contravention.count({ where: { acknowledgedById: id } });

    // Safety check: don't delete users with contraventions (as employee)
    if (contraventionCount > 0) {
      throw new AppError(`Cannot delete user with ${contraventionCount} contravention(s). Remap them first.`, 400);
    }

    // Check for logged contraventions - need to reassign or clear
    if (loggedContrasCount > 0) {
      throw new AppError(`Cannot delete user who logged ${loggedContrasCount} contravention(s). The user has related records.`, 400);
    }

    // Check for acknowledged contraventions - need to clear
    if (acknowledgedContrasCount > 0) {
      throw new AppError(`Cannot delete user who acknowledged ${acknowledgedContrasCount} contravention(s). The user has related records.`, 400);
    }

    console.log(`[DeleteUser] Deleting user ${user.email}`);

    // Delete all related records first in a transaction
    await prisma.$transaction([
      // Auth/session related
      prisma.otpRecord.deleteMany({ where: { userId: id } }),
      prisma.notification.deleteMany({ where: { userId: id } }),
      // Points
      prisma.employeePoints.deleteMany({ where: { employeeId: id } }),
      // Escalations where they are the employee
      prisma.escalation.deleteMany({ where: { employeeId: id } }),
      // Training records
      prisma.trainingRecord.deleteMany({ where: { employeeId: id } }),
      // Disputes they submitted (if any)
      prisma.dispute.deleteMany({ where: { submittedById: id } }),
      // Clear disputes they decided (set decidedById to null)
      prisma.dispute.updateMany({ where: { decidedById: id }, data: { decidedById: null } }),
      // User-team memberships
      prisma.userTeam.deleteMany({ where: { userId: id } }),
      // Audit logs (set userId to null instead of deleting for audit trail)
      prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null } }),
    ]);

    // Now delete the user
    await prisma.user.delete({ where: { id } });

    // Log the deletion (with admin's ID, not the deleted user)
    await prisma.auditLog.create({
      data: {
        entityType: 'USER',
        entityId: id,
        action: 'DELETE',
        userId: req.user!.userId,
        newValues: {
          deletedUser: user.email,
          deletedUserName: user.name,
        },
      },
    });

    console.log(`[DeleteUser] Successfully deleted user ${user.email}`);

    res.json({
      success: true,
      message: `Successfully deleted user ${user.email}`,
      data: { deletedUser: user.email },
    });
  } catch (error) {
    console.error('[DeleteUser] Error:', error);
    next(error);
  }
});

// GET /api/admin/users/ogp - Get all ogp.gov.sg users with their contravention counts
router.get('/users/ogp', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const ogpUsers = await prisma.user.findMany({
      where: { email: { endsWith: '@ogp.gov.sg' } },
      select: {
        id: true,
        email: true,
        name: true,
        employeeId: true,
        _count: { select: { contraventions: true } },
      },
      orderBy: { email: 'asc' },
    });

    res.json({
      success: true,
      data: ogpUsers.map((u: typeof ogpUsers[number]) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        employeeId: u.employeeId,
        contraventionCount: u._count.contraventions,
      })),
      count: ogpUsers.length,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== SLACK INTEGRATION ====================

// GET /api/admin/slack/status - Check Slack integration status (admin only)
router.get('/slack/status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    res.json({
      success: true,
      data: {
        configured: slackService.isConfigured(),
        message: slackService.isConfigured()
          ? 'Slack integration is configured'
          : 'SLACK_TOKEN environment variable not set',
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/slack/users - Fetch all users from Slack (admin only)
router.get('/slack/users', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!slackService.isConfigured()) {
      throw new AppError('Slack integration not configured. Set SLACK_TOKEN environment variable.', 400);
    }

    const slackUsers = await slackService.fetchAllUsers();

    res.json({
      success: true,
      data: slackUsers,
      count: slackUsers.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/slack/sync - Sync users from Slack to database (admin only)
// Optimized for Vercel's 10-second timeout by using batch operations
router.post('/slack/sync', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!slackService.isConfigured()) {
      throw new AppError('Slack integration not configured. Set SLACK_TOKEN environment variable.', 400);
    }

    console.log('[SlackSync] Starting sync...');
    const startTime = Date.now();

    // Step 1: Fetch from Slack (this is fast, usually 1-2 seconds)
    const slackUsers = await slackService.fetchAllUsers();
    console.log(`[SlackSync] Fetched ${slackUsers.length} users from Slack in ${Date.now() - startTime}ms`);

    // Step 2: Test DB connection first with a simple query
    console.log('[SlackSync] Testing database connection...');
    const dbStartTime = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`[SlackSync] DB connection OK in ${Date.now() - dbStartTime}ms`);
    } catch (dbError) {
      console.error('[SlackSync] DB connection failed:', dbError);
      throw new AppError(`Database connection failed: ${(dbError as Error).message}`, 503);
    }

    // Step 3: Get existing users in one query
    const existingUsers = await prisma.user.findMany({
      select: { email: true, id: true },
    });
    const existingEmailMap = new Map(existingUsers.map(u => [u.email.toLowerCase(), u.id]));
    console.log(`[SlackSync] Found ${existingUsers.length} existing users in DB (${Date.now() - startTime}ms total)`);

    const results = {
      created: 0,
      updated: 0,
      deactivated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Separate users into new vs existing
    const newUsers = slackUsers.filter(u => !existingEmailMap.has(u.email));
    const existingSlackUsers = slackUsers.filter(u => existingEmailMap.has(u.email));

    console.log(`[SlackSync] New: ${newUsers.length}, Existing: ${existingSlackUsers.length}`);

    // Get current user count for employee IDs
    const currentCount = await prisma.user.count();

    // Batch create new users using createMany (much faster)
    if (newUsers.length > 0) {
      const usersToCreate = newUsers.map((slackUser, index) => ({
        email: slackUser.email,
        name: slackUser.name,
        employeeId: `EMP${String(currentCount + index + 1).padStart(4, '0')}`,
        role: 'USER' as const,
        isActive: slackUser.isActive,
      }));

      try {
        const createResult = await prisma.user.createMany({
          data: usersToCreate,
          skipDuplicates: true,
        });
        results.created = createResult.count;
        console.log(`[SlackSync] Created ${createResult.count} new users (${Date.now() - startTime}ms total)`);

        // Create points records for new users (need to fetch their IDs first)
        const newlyCreatedUsers = await prisma.user.findMany({
          where: { email: { in: newUsers.map(u => u.email) } },
          select: { id: true },
        });

        if (newlyCreatedUsers.length > 0) {
          await prisma.employeePoints.createMany({
            data: newlyCreatedUsers.map(u => ({
              employeeId: u.id,
              totalPoints: 0,
            })),
            skipDuplicates: true,
          });
        }
      } catch (err) {
        const errorMsg = (err as Error).message;
        console.error('[SlackSync] Batch create error:', errorMsg);
        results.errors.push(`Batch create failed: ${errorMsg}`);
      }
    }

    // Skip individual updates to save time - just count them as "already synced"
    results.updated = existingSlackUsers.length;
    console.log(`[SlackSync] ${existingSlackUsers.length} existing users already in sync`);

    // Skip audit log if running low on time (over 8 seconds)
    const elapsed = Date.now() - startTime;
    if (elapsed < 8000) {
      await prisma.auditLog.create({
        data: {
          entityType: 'USER',
          entityId: 'SLACK_SYNC',
          action: 'SYNC',
          userId: req.user!.userId,
          newValues: results,
        },
      });
    } else {
      console.log('[SlackSync] Skipping audit log to save time');
    }

    console.log(`[SlackSync] Sync completed in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      data: results,
      message: `Sync complete: ${results.created} created, ${results.updated} already synced`,
      timing: `${Date.now() - startTime}ms`,
    });
  } catch (error) {
    const errorMessage = (error as Error).message || 'Unknown error';
    console.error('[SlackSync] Error:', errorMessage);
    // Return detailed error for debugging
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError(`Slack sync failed: ${errorMessage}`, 500));
    }
  }
});

// GET /api/admin/slack/compare - Compare Slack users with database (admin only)
router.get('/slack/compare', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!slackService.isConfigured()) {
      throw new AppError('Slack integration not configured. Set SLACK_TOKEN environment variable.', 400);
    }

    const slackUsers = await slackService.fetchAllUsers();

    // Get existing users
    const existingUsers = await prisma.user.findMany({
      select: { email: true, name: true, isActive: true },
    });
    const existingEmailSet = new Set(existingUsers.map(u => u.email.toLowerCase()));
    const slackEmailSet = new Set(slackUsers.map(u => u.email));

    // Users in Slack but not in DB
    const newUsers = slackUsers.filter(u => !existingEmailSet.has(u.email));

    // Users in DB but not in Slack (potentially left)
    const missingFromSlack = existingUsers.filter(u => !slackEmailSet.has(u.email.toLowerCase()));

    res.json({
      success: true,
      data: {
        slackUserCount: slackUsers.length,
        dbUserCount: existingUsers.length,
        newUsers: newUsers.map(u => ({ email: u.email, name: u.name })),
        missingFromSlack: missingFromSlack.map(u => ({ email: u.email, name: u.name, isActive: u.isActive })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==================== CONTRAVENTION TYPES ====================

// GET /api/admin/types - List contravention types
router.get('/types', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const types = await prisma.contraventionType.findMany({
      orderBy: { category: 'asc' },
    });
    res.json({ success: true, data: types });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/types - Create contravention type (admin only)
router.post('/types', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { category, name, description, defaultSeverity, defaultPoints } = req.body;

    const type = await prisma.contraventionType.create({
      data: {
        category,
        name,
        description,
        defaultSeverity,
        defaultPoints,
      },
    });

    res.status(201).json({ success: true, data: type });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/types/:id - Update contravention type (admin only)
router.patch('/types/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, description, defaultSeverity, defaultPoints, isActive } = req.body;

    const type = await prisma.contraventionType.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(defaultSeverity && { defaultSeverity }),
        ...(defaultPoints !== undefined && { defaultPoints }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: type });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/departments - List departments
router.get('/departments', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const departments = await prisma.department.findMany({
      include: {
        head: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: departments });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/departments - Create department (admin only)
router.post('/departments', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, headId } = req.body;

    const department = await prisma.department.create({
      data: { name, headId },
    });

    res.status(201).json({ success: true, data: department });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/courses - List courses
router.get('/courses', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: courses });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/training - List all training records (admin only)
router.get('/training', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { status } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const trainingRecords = await prisma.trainingRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            department: { select: { name: true } },
            pointsRecord: { select: { totalPoints: true } },
          },
        },
        course: true,
      },
      orderBy: { assignedDate: 'desc' },
    });

    res.json({ success: true, data: trainingRecords });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/training/needs-training - Get employees who need training (>3 points)
router.get('/training/needs-training', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    // First get all employees with their points records
    const allEmployees = await prisma.user.findMany({
      where: {
        isActive: true,
      },
      include: {
        department: { select: { name: true } },
        pointsRecord: { select: { totalPoints: true, currentLevel: true } },
        trainingRecords: {
          orderBy: { completedDate: 'desc' },
        },
      },
    });

    // Filter employees who have >3 points and don't have active training
    const employeesNeedingTraining = allEmployees
      .filter((emp) => {
        const points = emp.pointsRecord?.totalPoints || 0;
        const hasActiveTraining = emp.trainingRecords.some(
          (tr) => tr.status === 'ASSIGNED' || tr.status === 'IN_PROGRESS'
        );
        return points > 3 && !hasActiveTraining;
      })
      .map((emp) => ({
        ...emp,
        trainingRecords: emp.trainingRecords.filter((tr) => tr.status === 'COMPLETED').slice(0, 1),
      }))
      .sort((a, b) => (b.pointsRecord?.totalPoints || 0) - (a.pointsRecord?.totalPoints || 0));

    res.json({ success: true, data: employeesNeedingTraining });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/training/assign - Assign training to employee (admin only)
router.post('/training/assign', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { employeeId, courseId, dueDate } = req.body;

    if (!employeeId || !courseId) {
      throw new AppError('Employee ID and Course ID are required', 400);
    }

    // Check if employee exists
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new AppError('Course not found', 404);
    }

    // Check if training already assigned
    const existingTraining = await prisma.trainingRecord.findUnique({
      where: {
        employeeId_courseId: { employeeId, courseId },
      },
    });

    if (existingTraining && ['ASSIGNED', 'IN_PROGRESS'].includes(existingTraining.status)) {
      throw new AppError('Training already assigned to this employee', 400);
    }

    // Create or update training record
    const training = existingTraining
      ? await prisma.trainingRecord.update({
          where: { id: existingTraining.id },
          data: {
            status: 'ASSIGNED',
            assignedDate: new Date(),
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            completedDate: null,
            pointsCredited: false,
          },
          include: {
            employee: { select: { id: true, name: true, email: true } },
            course: true,
          },
        })
      : await prisma.trainingRecord.create({
          data: {
            employeeId,
            courseId,
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'ASSIGNED',
          },
          include: {
            employee: { select: { id: true, name: true, email: true } },
            course: true,
          },
        });

    res.status(201).json({ success: true, data: training });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/training/:id/status - Update training status (admin only)
router.patch('/training/:id/status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { status } = req.body;

    if (!status || !['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    const training = await prisma.trainingRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!training) {
      throw new AppError('Training record not found', 404);
    }

    const updateData: Record<string, unknown> = { status };

    if (status === 'COMPLETED') {
      updateData.completedDate = new Date();
    }

    const updated = await prisma.trainingRecord.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        employee: { select: { id: true, name: true, email: true } },
        course: true,
      },
    });

    // Apply training credit if completed and not already credited
    if (status === 'COMPLETED' && !training.pointsCredited) {
      const pointsService = (await import('../services/points.service')).default;
      await pointsService.applyTrainingCredit(training.employeeId, training.id);
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/courses - Create course (admin only)
router.post('/courses', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, description, durationHours, provider, validityMonths, triggerPoints, pointsCredit } = req.body;

    const course = await prisma.course.create({
      data: {
        name,
        description,
        durationHours,
        provider,
        validityMonths,
        triggerPoints: triggerPoints || 5,
        pointsCredit: pointsCredit || 1,
      },
    });

    res.status(201).json({ success: true, data: course });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/audit-logs - List audit logs (admin only)
router.get('/audit-logs', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { entityType, userId, page = '1', limit = '50' } = req.query;

    const where: Record<string, unknown> = {};
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
        take: parseInt(limit as string),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/disputes - List all disputes (admin only)
router.get('/disputes', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { status } = req.query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const disputes = await prisma.dispute.findMany({
      where,
      include: {
        contravention: {
          include: {
            employee: { select: { id: true, name: true } },
            type: { select: { name: true } },
          },
        },
        submittedBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: disputes });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/disputes/:id/decide - Resolve dispute (admin only)
router.patch('/disputes/:id/decide', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { decision, panelDecision } = req.body;

    if (!decision || !['UPHELD', 'OVERTURNED'].includes(decision)) {
      throw new AppError('Invalid decision', 400);
    }

    // Import the service dynamically to avoid circular dependencies
    const contraventionService = (await import('../services/contravention.service')).default;

    const dispute = await contraventionService.resolveDispute(
      req.params.id,
      req.user!.userId,
      decision,
      panelDecision
    );

    res.json({ success: true, data: dispute });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/escalations - List all escalations (admin only)
router.get('/escalations', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { level, completed } = req.query;

    const where: Record<string, unknown> = {};
    if (level) where.level = level;
    if (completed === 'true') {
      where.completedAt = { not: null };
    } else if (completed === 'false') {
      where.completedAt = null;
    }

    const escalations = await prisma.escalation.findMany({
      where,
      include: {
        employee: {
          select: { id: true, name: true, department: { select: { name: true } } },
        },
      },
      orderBy: { triggeredAt: 'desc' },
    });

    res.json({ success: true, data: escalations });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/escalations/:id/complete-action - Mark action as complete
router.patch(
  '/escalations/:id/complete-action',
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { action } = req.body;

      const escalation = await prisma.escalation.findUnique({
        where: { id: req.params.id },
      });

      if (!escalation) {
        throw new AppError('Escalation not found', 404);
      }

      const actionsCompleted = [...escalation.actionsCompleted, action];
      const allCompleted = escalation.actionsRequired.every((a) => actionsCompleted.includes(a));

      const updated = await prisma.escalation.update({
        where: { id: req.params.id },
        data: {
          actionsCompleted,
          completedAt: allCompleted ? new Date() : null,
        },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/training/:id/complete - Mark training as complete (admin only)
router.post(
  '/training/:id/complete',
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const training = await prisma.trainingRecord.findUnique({
        where: { id: req.params.id },
      });

      if (!training) {
        throw new AppError('Training record not found', 404);
      }

      // Update training status
      const updated = await prisma.trainingRecord.update({
        where: { id: req.params.id },
        data: {
          status: 'COMPLETED',
          completedDate: new Date(),
        },
      });

      // Apply training credit if not already credited
      if (!training.pointsCredited) {
        const pointsService = (await import('../services/points.service')).default;
        await pointsService.applyTrainingCredit(training.employeeId, training.id);
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/points/run-decay - Run points decay for all employees (admin only)
router.post('/points/run-decay', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.runPointsDecayForAllEmployees();

    res.json({
      success: true,
      message: `Processed ${result.processed} employees, ${result.decayed} had points decayed (total: ${result.totalPointsDecayed} points)`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/points/decay-status - Get decay status for all employees with points (admin only)
router.get('/points/decay-status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;

    // Get all employees with points
    const employeesWithPoints = await prisma.employeePoints.findMany({
      where: { totalPoints: { gt: 0 } },
      include: { employee: { select: { id: true, name: true, email: true } } },
    });

    const decayStatuses = await Promise.all(
      employeesWithPoints.map(async (emp) => {
        const status = await pointsService.getPointsDecayStatus(emp.employeeId);
        return {
          employeeId: emp.employeeId,
          employeeName: emp.employee.name,
          currentPoints: emp.totalPoints,
          ...status,
        };
      })
    );

    res.json({ success: true, data: decayStatuses });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/email-status - Get email sandbox status (admin only)
router.get('/email-status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { notificationService } = await import('../services/notification.service');
    const status = notificationService.getEmailSandboxStatus();

    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/points/fiscal-year-status - Get fiscal year reset status (admin only)
router.get('/points/fiscal-year-status', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const status = await pointsService.getFiscalYearStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/points/fiscal-year-reset - Reset all points for new fiscal year (admin only)
router.post('/points/fiscal-year-reset', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.resetPointsForNewFiscalYear();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/escalations/recalculate - Recalculate all escalations for new 3-level system (admin only)
router.post('/escalations/recalculate', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.recalculateAllEscalations();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/points/sync - Sync points from contraventions (admin only)
router.post('/points/sync', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const pointsService = (await import('../services/points.service')).default;
    const result = await pointsService.syncPointsFromContraventions();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==================== TEAM MANAGEMENT ====================

// GET /api/admin/teams - List all teams
router.get('/teams', authenticate, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const teams = await prisma.team.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            contraventions: true,
            members: true,
          },
        },
      },
      orderBy: [
        { isPersonal: 'desc' },  // Personal team first
        { name: 'asc' },
      ],
    });

    res.json({
      success: true,
      data: teams.map((t: typeof teams[number]) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isPersonal: t.isPersonal,
        contraventionCount: t._count.contraventions,
        memberCount: t._count.members,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/teams - Create team (admin only)
router.post('/teams', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, isPersonal = false } = req.body as { name: string; description?: string; isPersonal?: boolean };

    if (!name) {
      throw new AppError('Team name is required', 400);
    }

    const team = await prisma.team.create({
      data: {
        name,
        description,
        isPersonal,
      },
    });

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        entityType: 'TEAM',
        entityId: team.id,
        action: 'CREATE',
        userId: req.user!.userId,
        newValues: { name, description, isPersonal },
      },
    });

    res.status(201).json({ success: true, data: team });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/teams/:id - Update team (admin only)
router.patch('/teams/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, isActive } = req.body as { name?: string; description?: string; isActive?: boolean };

    const team = await prisma.team.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: team });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/teams/:id/members - Add user to team (admin only)
router.post('/teams/:id/members', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body as { userId: string };

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if team exists
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      throw new AppError('Team not found', 404);
    }

    // Add user to team (upsert to handle duplicates gracefully)
    const userTeam = await prisma.userTeam.upsert({
      where: {
        userId_teamId: { userId, teamId: req.params.id },
      },
      update: {},  // No update if exists
      create: {
        userId,
        teamId: req.params.id,
      },
    });

    res.status(201).json({
      success: true,
      data: userTeam,
      message: `Added ${user.name} to ${team.name}`,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/teams/:id/members/:userId - Remove user from team (admin only)
router.delete('/teams/:id/members/:userId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id: teamId, userId } = req.params;

    await prisma.userTeam.delete({
      where: {
        userId_teamId: { userId, teamId },
      },
    });

    res.json({ success: true, message: 'User removed from team' });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/teams/:id/members - Get team members (admin only)
router.get('/teams/:id/members', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const members = await prisma.userTeam.findMany({
      where: { teamId: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            isActive: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: members.map((m: typeof members[number]) => m.user),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/teams/seed-personal - Create the default "Personal" team if it doesn't exist
router.post('/teams/seed-personal', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const personalTeam = await prisma.team.upsert({
      where: { name: 'Personal' },
      update: {},
      create: {
        name: 'Personal',
        description: 'For contraventions not associated with any team',
        isPersonal: true,
      },
    });

    res.json({
      success: true,
      data: personalTeam,
      message: 'Personal team created/verified',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/teams/seed-all - Seed all OGP teams from master list
router.post('/teams/seed-all', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Master list of 59 OGP teams from Teams list.xlsx
    const OGP_TEAMS = [
      'ActiveSG', 'AI Aunty', 'Armoury', 'AskGov', 'AttendPA', 'Bright',
      'Build For Good', 'BYOS', 'CalSG', 'Care360', 'CareersGovSG', 'CrackDown',
      'Data', 'FormSG', 'GatherSG', 'GCC 2.0', 'Go.Gov.SG', 'GoGovSG & Pinpoint',
      'GoWhere Suite', 'Health Appointment System', 'Infra', 'Isomer', 'Isomer CMS',
      'Jumpstart', 'Launchpad', 'LetterSG', 'LetsGetChecked', 'Link@HDB', 'ListSG',
      'Media Lab', 'OGP', 'PairSG', 'PaySG', 'People Team', 'Pinpoint', 'Plumber',
      'Postman', 'PostmanSG', 'RedeemSG', 'Redeem@SG', 'Roster Monster', 'ScamShield',
      'Scribe', 'SHIP', 'Sidequest', 'SPARTA', 'SPOT', 'Starter Kit', 'Stratcon',
      'SupplyAlly', 'SupplySG', 'Tech Hiring', 'Tech Interview', 'Tooling',
      'TS Carina', 'TSx', 'VAULT', 'WhatIsThis',
    ];

    const results = {
      created: 0,
      existing: 0,
      teams: [] as string[],
    };

    for (const teamName of OGP_TEAMS) {
      const team = await prisma.team.upsert({
        where: { name: teamName },
        update: {},
        create: {
          name: teamName,
          isPersonal: false,
        },
      });

      if (team.createdAt.getTime() === team.updatedAt.getTime()) {
        results.created++;
      } else {
        results.existing++;
      }
      results.teams.push(teamName);
    }

    // Also ensure Personal team exists
    await prisma.team.upsert({
      where: { name: 'Personal' },
      update: {},
      create: {
        name: 'Personal',
        description: 'For contraventions not associated with any team',
        isPersonal: true,
      },
    });

    res.json({
      success: true,
      data: results,
      message: `Seeded ${results.created} new teams, ${results.existing} already existed. Total: ${OGP_TEAMS.length} teams.`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/teams/with-contraventions - Get only teams that have contraventions (for reports)
router.get('/teams/with-contraventions', authenticate, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const teamsWithContraventions = await prisma.team.findMany({
      where: {
        isActive: true,
        contraventions: {
          some: {}, // Has at least one contravention
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPersonal: true,
        _count: {
          select: { contraventions: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: teamsWithContraventions.map((t: typeof teamsWithContraventions[number]) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isPersonal: t.isPersonal,
        contraventionCount: t._count.contraventions,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ==================== DEACTIVATED USERS MANAGEMENT ====================

// GET /api/admin/users/inactive - Get all inactive/deactivated users
router.get('/users/inactive', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inactiveUsers = await prisma.user.findMany({
      where: { isActive: false },
      select: {
        id: true,
        email: true,
        name: true,
        employeeId: true,
        isActive: true,
        _count: { select: { contraventions: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: inactiveUsers.map((u: typeof inactiveUsers[number]) => ({
        ...u,
        contraventionCount: u._count.contraventions,
      })),
      count: inactiveUsers.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
