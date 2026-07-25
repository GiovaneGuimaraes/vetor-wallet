import { Router, Request, Response } from 'express';
import { db } from '../db';
import { fetchQuotes } from '../services/quotes';
import { buildPositionMap, buildPortfolioSummary } from '../services/portfolio';
import { getPreviousCloseSnapshots, getBRTDate } from '../services/snapshots';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { Operation } from '@vetor-wallet/shared';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;

    // Carteira única (T-050): `?walletId=` é ignorado — o P&L é sempre o
    // consolidado do usuário, inclusive sobre carteiras legadas.
    const result = await db.execute({
      sql: 'SELECT * FROM operations WHERE user_id = ? ORDER BY date ASC, created_at ASC',
      args: [userId],
    });
    const ops = result.rows as unknown as Operation[];

    const positionMap = buildPositionMap(ops);

    const activeTickers: string[] = [];
    for (const [ticker, pos] of positionMap.entries()) {
      if (pos.quantity > 0) activeTickers.push(ticker);
    }

    const { quotes, failed } = await fetchQuotes(activeTickers);

    const todayISO = getBRTDate().toISOString().split('T')[0];
    const previousCloses = await getPreviousCloseSnapshots(activeTickers, todayISO);

    const summary = buildPortfolioSummary(positionMap, quotes, failed, previousCloses);

    res.json(summary);
  }),
);

export default router;
