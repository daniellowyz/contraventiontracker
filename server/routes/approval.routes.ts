import { Router, Response } from 'express';
import approvalService from '../services/approval.service';
import { authenticate, requireAdmin, requireApprover } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/approvals/pending - Get pending approvals for current user (approver)
router.get('/pending', authenticate, requireApprover, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await approvalService.getPendingApprovals(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/approvals/all - Get all approvals (admin only)
router.get('/all', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await approvalService.getAllApprovals();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/approvals/approvers - Get list of available approvers
router.get('/approvers', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const approvers = await approvalService.getApprovers();
    res.json({ success: true, data: approvers });
  } catch (error) {
    next(error);
  }
});

// POST /api/approvals - Create a new approval request
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { contraventionId, approverId } = req.body;

    if (!contraventionId) {
      return res.status(400).json({ success: false, error: 'Contravention ID is required' });
    }
    if (!approverId) {
      return res.status(400).json({ success: false, error: 'Approver ID is required' });
    }

    const approval = await approvalService.createApprovalRequest(contraventionId, approverId);
    res.status(201).json({ success: true, data: approval });
  } catch (error) {
    next(error);
  }
});

// POST /api/approvals/:id/review - Review an approval request (approve/reject)
router.post('/:id/review', authenticate, requireApprover, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be APPROVED or REJECTED' });
    }

    const approval = await approvalService.reviewApproval(
      id,
      req.user!.userId,
      status,
      notes
    );
    res.json({ success: true, data: approval });
  } catch (error) {
    next(error);
  }
});

export default router;
