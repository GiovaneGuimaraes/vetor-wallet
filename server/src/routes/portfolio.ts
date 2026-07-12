import { Router, Request, Response } from 'express';
import { db } from '../db';
import { fetchQuotes } from '../services/quotes';
import { buildPositionMap, buildPortfolioSummary } from '../services/portfolio';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { Operation } from '@vetor-wallet/shared';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { walletId } = req.query;

    let sql = 'SELECT * FROM operations WHERE user_id = ?';
    const args: (number | string)[] = [userId];

    if (walletId !== undefined) {
      sql += ' AND wallet_id = ?';
      args.push(Number(walletId));
    }

    sql += ' ORDER BY date ASC, created_at ASC';

    const result = await db.execute({ sql, args });
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
