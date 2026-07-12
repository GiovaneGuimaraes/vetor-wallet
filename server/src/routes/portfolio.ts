import { Router, Request, Response } from 'express';
import { db } from '../db';
import { fetchQuotes } from '../services/quotes';
import { buildPositionMap, buildPortfolioSummary } from '../services/portfolio';
import { asyncHandler } from '../middleware/asyncHandler';
import type { Operation } from '@vetor-wallet/shared';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await db.execute('SELECT * FROM operations ORDER BY date ASC, created_at ASC');
    const ops = result.rows as unknown as Operation[];

    const positionMap = buildPositionMap(ops);

    const activeTickers: string[] = [];
    for (const [ticker, pos] of positionMap.entries()) {
      if (pos.quantity > 0) activeTickers.push(ticker);
    }

    const quotes = await fetchQuotes(activeTickers);
    const summary = buildPortfolioSummary(positionMap, quotes);

    res.json(summary);
  }),
);

export default router;
