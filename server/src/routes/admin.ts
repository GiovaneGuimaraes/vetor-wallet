import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../auth/middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { runHourlyInsightsJob, type InsightJobResult } from '../services/hourlyInsights';

export function summariseResults(results: InsightJobResult[]) {
  return {
    tickersProcessed: results.filter((r) => !r.error).length,
    saved: results.reduce((sum, r) => sum + r.saved, 0),
    duplicated: results.reduce((sum, r) => sum + r.duplicates, 0),
    failed: results.filter((r) => !!r.error).length,
  };
}

const router = Router();

router.post(
  '/run-insights-job',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.body as { date?: string };
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Formato de data inválido — esperado YYYY-MM-DD' });
      return;
    }
    const results = await runHourlyInsightsJob(date);
    res.json(summariseResults(results));
  }),
);

export default router;
