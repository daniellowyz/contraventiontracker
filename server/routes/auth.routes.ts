import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import authService from '../services/auth.service';
import otpService from '../services/otp.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  requestOtpSchema,
  verifyOtpSchema,
  registerSchema,
} from '../validators/auth.schema';
import { AuthenticatedRequest, JwtPayload } from '../types';
import config from '../config/env';

const router = Router();

// Cookie configuration
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, // Always use HTTPS in production (Vercel)
  sameSite: 'lax' as const,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  path: '/',
};

// POST /api/auth/request-otp - Step 1: Request OTP
router.post('/request-otp', validateBody(requestOtpSchema), async (req, res: Response, next) => {
  try {
    const { email } = req.body;
    const result = await otpService.requestOtp(email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify-otp - Step 2: Verify OTP and get session
router.post('/verify-otp', validateBody(verifyOtpSchema), async (req, res: Response, next) => {
  try {
    const { email, otp } = req.body;
    const user = await otpService.verifyOtp(email, otp);

    // Create JWT payload with new fields
    const payload: JwtPayload = {
      userId: user.userId,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role,
      isProfileComplete: user.isProfileComplete,
      position: user.position,
    };

    // Generate JWT token
    const token = jwt.sign(payload, config.jwtSecret!, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);

    // Set JWT as HTTP-only cookie
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    // Also return token in response body for clients that prefer it
    res.json({
      success: true,
      data: {
        token,
        user: payload,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout - Clear session cookie
router.post('/logout', (req, res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/register (admin only) - Create new user
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

// GET /api/auth/me - Get current user info
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const user = await authService.getCurrentUser(req.user!.userId);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/complete-profile - Complete profile for new users
router.post('/complete-profile', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, position, requestApprover } = req.body;
    const userId = req.user!.userId;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!position || typeof position !== 'string' || position.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Position is required' });
    }

    // Update user profile
    const updatedUser = await authService.completeProfile(userId, {
      name: name.trim(),
      position: position.trim(),
      requestApprover: Boolean(requestApprover),
    });

    // Create new JWT with updated info
    const payload: JwtPayload = {
      userId: updatedUser.id,
      employeeId: updatedUser.employeeId,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      isProfileComplete: updatedUser.isProfileComplete,
      position: updatedUser.position || undefined,
    };

    const token = jwt.sign(payload, config.jwtSecret!, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);

    // Set new cookie
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      success: true,
      data: {
        token,
        user: payload,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
