import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/notifications - Get all notifications for the current user
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/unread-count - Get count of unread notifications
router.get('/unread-count', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const count = await prisma.notification.count({
      where: {
        userId: req.user!.userId,
        read: false,
      },
    });
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const notification = await prisma.notification.update({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
      data: { read: true },
    });
    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/read-all - Mark all notifications as read
router.patch('/read-all', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.user!.userId,
        read: false,
      },
      data: { read: true },
    });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

export default router;
