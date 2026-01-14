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
import prisma from '../config/database';

const router = Router();

// Cookie configuration
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.nodeEnv === 'production', // Only HTTPS in production
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

    // Create JWT payload
    const payload: JwtPayload = {
      userId: user.userId,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    // Generate JWT token
    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);

    // Set JWT as HTTP-only cookie
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    // Also return token in response body for clients that prefer it
    res.json({
      success: true,
      data: {
        token,
        user: {
          ...payload,
          isProfileComplete: user.isProfileComplete,
          position: user.position,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/demo-login - Demo login for testing (bypasses OTP)
// Demo users: DemoUser@open.gov.sg, DemoAdmin@open.gov.sg, DemoApprover@open.gov.sg
router.post('/demo-login', async (req, res: Response, next) => {
  try {
    const { email } = req.body;

    // Only allow specific demo emails
    const demoEmails = [
      'demouser@open.gov.sg',
      'demoadmin@open.gov.sg',
      'demoapprover@open.gov.sg',
    ];

    const normalizedEmail = email?.toLowerCase().trim();
    if (!normalizedEmail || !demoEmails.includes(normalizedEmail)) {
      res.status(400).json({
        success: false,
        error: 'Invalid demo account',
      });
      return;
    }

    // Find or create the demo user
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Create the demo user
      const roleMap: Record<string, 'USER' | 'ADMIN' | 'APPROVER'> = {
        'demouser@open.gov.sg': 'USER',
        'demoadmin@open.gov.sg': 'ADMIN',
        'demoapprover@open.gov.sg': 'APPROVER',
      };

      const nameMap: Record<string, string> = {
        'demouser@open.gov.sg': 'Demo User',
        'demoadmin@open.gov.sg': 'Demo Admin',
        'demoapprover@open.gov.sg': 'Demo Approver',
      };

      const employeeIdMap: Record<string, string> = {
        'demouser@open.gov.sg': 'DEMO-USER',
        'demoadmin@open.gov.sg': 'DEMO-ADMIN',
        'demoapprover@open.gov.sg': 'DEMO-APPROVER',
      };

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          employeeId: employeeIdMap[normalizedEmail],
          name: nameMap[normalizedEmail],
          role: roleMap[normalizedEmail],
          isActive: true,
          isProfileComplete: true,
          position: `Demo ${roleMap[normalizedEmail]}`,
        },
      });

      // Create points record for new demo user
      await prisma.employeePoints.create({
        data: {
          employeeId: user.id,
          totalPoints: 0,
        },
      });
    }

    // Create JWT payload
    const payload: JwtPayload = {
      userId: user.id,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role as 'USER' | 'ADMIN' | 'APPROVER',
    };

    // Generate JWT token
    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);

    // Set JWT as HTTP-only cookie
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      success: true,
      data: {
        token,
        user: {
          ...payload,
          isProfileComplete: user.isProfileComplete,
          position: user.position,
        },
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
    secure: config.nodeEnv === 'production',
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

    if (!name || !position) {
      res.status(400).json({
        success: false,
        error: 'Name and position are required',
      });
      return;
    }

    // Update user profile
    const updatedUser = await authService.completeProfile(userId, {
      name,
      position,
      requestApprover: requestApprover || false,
    });

    // Create new JWT with updated info
    const payload: JwtPayload = {
      userId: updatedUser.id,
      employeeId: updatedUser.employeeId,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);

    // Set updated JWT as HTTP-only cookie
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      success: true,
      data: {
        user: {
          userId: updatedUser.id,
          employeeId: updatedUser.employeeId,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          isProfileComplete: updatedUser.isProfileComplete,
          position: updatedUser.position,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
