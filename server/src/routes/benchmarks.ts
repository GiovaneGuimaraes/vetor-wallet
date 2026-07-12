import { Router, Request, Response } from 'express';
import {
  fetchCDIAccumulated,
  fetchIbovespaReturn,
  getPortfolioReturnAndEarliestDate,
} from '../services/benchmarks';
import { asyncHandler } from '../middleware/asyncHandler';
import type { BenchmarkData } from '@vetor-wallet/shared';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const today = new Date().toISOString().split('T')[0];
    const { pct: portfolioPct, earliestDate } = await getPortfolioReturnAndEarliestDate();

    if (!earliestDate) {
      const result: BenchmarkData = {
        period: { from: today, to: today },
        portfolio: null,
        cdi: null,
        ibovespa: null,
      };
      res.json(result);
      return;
    }

    const [cdi, ibovespa] = await Promise.all([
      fetchCDIAccumulated(earliestDate, today),
      fetchIbovespaReturn(earliestDate),
    ]);

    const result: BenchmarkData = {
      period: { from: earliestDate, to: today },
      portfolio: portfolioPct,
      cdi,
      ibovespa,
    };

    res.json(result);
  }),
);

export default router;
