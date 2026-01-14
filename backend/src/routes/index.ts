import { Router } from 'express';
import authRoutes from './auth.routes';
import contraventionRoutes from './contravention.routes';
import employeeRoutes from './employee.routes';
import reportRoutes from './report.routes';
import adminRoutes from './admin.routes';
import notificationRoutes from './notification.routes';
import approvalRoutes from './approval.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/contraventions', contraventionRoutes);
router.use('/employees', employeeRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/approvals', approvalRoutes);

export default router;
