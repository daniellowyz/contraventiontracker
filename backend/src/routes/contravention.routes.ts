import { Router, Response } from 'express';
import contraventionService from '../services/contravention.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createContraventionSchema,
  updateContraventionSchema,
  contraventionFiltersSchema,
} from '../validators/contravention.schema';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// GET /api/contraventions - List all contraventions
router.get(
  '/',
  authenticate,
  validateQuery(contraventionFiltersSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      // Use parsedQuery which has proper types from zod validation
      const result = await contraventionService.findAll((req as any).parsedQuery);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/contraventions - Create new contravention
// Users can create contraventions for themselves, admins can create for anyone
router.post(
  '/',
  authenticate,
  validateBody(createContraventionSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const isAdmin = req.user!.role === 'ADMIN';
      const employeeId = req.body.employeeId;

      // Non-admins can only create contraventions for themselves
      if (!isAdmin && employeeId !== req.user!.userId) {
        throw new AppError('You can only create contraventions for yourself', 403);
      }

      const contravention = await contraventionService.create(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/contraventions/:id - Get single contravention
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const contravention = await contraventionService.findById(req.params.id);
    res.json({ success: true, data: contravention });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/contraventions/:id - Update contravention (admin only)
router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validateBody(updateContraventionSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const contravention = await contraventionService.update(req.params.id, req.body);
      res.json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/contraventions/:id - Delete contravention (admin only)
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      await contraventionService.delete(req.params.id);
      res.json({ success: true, message: 'Contravention deleted' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/contraventions/:id/upload-approval - Upload approval PDF
// Admins can upload/replace approval documents regardless of status
router.post(
  '/:id/upload-approval',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { approvalPdfUrl } = req.body;
      if (!approvalPdfUrl) {
        return res.status(400).json({ success: false, error: 'approvalPdfUrl is required' });
      }
      const isAdmin = req.user!.role === 'ADMIN';
      const contravention = await contraventionService.uploadApproval(
        req.params.id,
        approvalPdfUrl,
        req.user!.userId,
        isAdmin
      );
      res.json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/contraventions/:id/mark-completed - Mark as completed (admin only)
router.post(
  '/:id/mark-completed',
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const contravention = await contraventionService.markCompleted(
        req.params.id,
        req.user!.userId
      );
      res.json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
