import { Router, Response } from 'express';
import contraventionService from '../services/contravention.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createContraventionSchema,
  updateContraventionSchema,
  userUpdateContraventionSchema,
  resubmitContraventionSchema,
  uploadApprovalSchema,
  markCompleteSchema,
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
      const result = await contraventionService.findAll(req.query as any);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/contraventions - Create new contravention (any authenticated user)
router.post(
  '/',
  authenticate,
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
// Admins can upload/replace approval documents regardless of status
router.post(
  '/:id/upload-approval',
  authenticate,
  validateBody(uploadApprovalSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const isAdmin = req.user!.role === 'ADMIN';
      const contravention = await contraventionService.uploadApproval(
        req.params.id,
        req.body.approvalPdfUrl,
        isAdmin
      );
      res.json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/contraventions/:id/complete - Mark as complete (admin only, transitions PENDING_REVIEW -> COMPLETED)
router.post(
  '/:id/complete',
  authenticate,
  requireAdmin,
  validateBody(markCompleteSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const contravention = await contraventionService.markComplete(
        req.params.id,
        req.user!.userId,
        req.body.notes
      );
      res.json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/contraventions/:id/user-edit - User edits their own contravention
// Users can only edit contraventions they created, and only when status is PENDING_APPROVAL or REJECTED
router.patch(
  '/:id/user-edit',
  authenticate,
  validateBody(userUpdateContraventionSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const contravention = await contraventionService.userUpdate(
        req.params.id,
        req.user!.userId,
        req.body
      );
      res.json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/contraventions/:id/resubmit - Resubmit a rejected contravention
// Only the user who created the contravention can resubmit it
router.post(
  '/:id/resubmit',
  authenticate,
  validateBody(resubmitContraventionSchema),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const contravention = await contraventionService.resubmit(
        req.params.id,
        req.user!.userId,
        req.body
      );
      res.json({ success: true, data: contravention });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
