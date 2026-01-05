import { Router, Response } from 'express';
import reportService from '../services/report.service';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import * as XLSX from 'xlsx';

const router = Router();

// GET /api/reports/dashboard - Dashboard stats
router.get('/dashboard', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const stats = await reportService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/by-department - Department breakdown
router.get('/by-department', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const breakdown = await reportService.getDepartmentBreakdown();
    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/by-type - Contravention type breakdown
router.get('/by-type', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const breakdown = await reportService.getTypeBreakdown();
    res.json({ success: true, data: breakdown });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/repeat-offenders - Repeat offenders list
router.get('/repeat-offenders', authenticate, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const offenders = await reportService.getRepeatOffenders();
    res.json({ success: true, data: offenders });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/export - Export to Excel (admin only)
router.get('/export', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = await reportService.exportData();

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Auto-size columns
    const maxWidths: number[] = [];
    data.forEach((row) => {
      Object.values(row).forEach((val, idx) => {
        const len = String(val).length;
        maxWidths[idx] = Math.max(maxWidths[idx] || 10, len);
      });
    });
    worksheet['!cols'] = maxWidths.map((w) => ({ width: Math.min(w + 2, 50) }));

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contraventions');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Send response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=contraventions-export-${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
