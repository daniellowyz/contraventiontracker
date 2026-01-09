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

// POST /api/contraventions - Create new contravention (admin only)
router.post(
  '/',
  authenticate,
  requireAdmin,
  validateBody(createContraventionSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
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
router.post(
  '/:id/upload-approval',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { approvalPdfUrl } = req.body;
      if (!approvalPdfUrl) {
        return res.status(400).json({ success: false, error: 'approvalPdfUrl is required' });
      }
      const contravention = await contraventionService.uploadApproval(
        req.params.id,
        approvalPdfUrl,
        req.user!.userId
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
