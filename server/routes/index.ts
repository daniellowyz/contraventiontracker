import { Router } from 'express';
import authRoutes from './auth.routes';
import contraventionRoutes from './contravention.routes';
import employeeRoutes from './employee.routes';
import reportRoutes from './report.routes';
import adminRoutes from './admin.routes';
import notificationRoutes from './notification.routes';
import approvalRoutes from './approval.routes';
import slackRoutes from './slack.routes';
import prisma from '../config/database';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Keep-alive cron endpoint - pings database to prevent Supabase free tier from pausing
router.get('/cron/keep-alive', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Database pinged successfully', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Keep-alive ping failed:', error);
    res.status(500).json({ status: 'error', message: 'Database ping failed', timestamp: new Date().toISOString() });
  }
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/contraventions', contraventionRoutes);
router.use('/employees', employeeRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/approvals', approvalRoutes);
router.use('/slack', slackRoutes);

export default router;
