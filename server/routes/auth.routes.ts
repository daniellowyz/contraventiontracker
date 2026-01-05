import { Router, Response } from 'express';
import authService from '../services/auth.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { loginSchema, registerSchema, changePasswordSchema } from '../validators/auth.schema';
import { AuthenticatedRequest } from '../types';

const router = Router();

// POST /api/auth/login
router.post('/login', validateBody(loginSchema), async (req, res: Response, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register (admin only)
router.post(
  '/register',
  authenticate,
  requireAdmin,
  validateBody(registerSchema),
  async (req, res: Response, next) => {
    try {
      const user = await authService.register(req.body);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const user = await authService.getCurrentUser(req.user!.userId);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      await authService.changePassword(
        req.user!.userId,
        req.body.currentPassword,
        req.body.newPassword
      );
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
