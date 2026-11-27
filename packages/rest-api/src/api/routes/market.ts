import { Router, Request, Response } from 'express';
import { getMarketUniverse } from '@vetor-wallet/brapi-core';
import { rankMarketMovers } from '@vetor-wallet/portfolio-core';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import type { MarketTodayResponse } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

/**
 * "Mercado hoje": top 5 altas, baixas e mais negociadas da B3 (só dado, sem
 * opinião). Fonte: `/quote/list` da brapi (grátis, sem token, com atraso) via
 * cache de 15 min. Dado de mercado é global — não há filtro por `user_id`.
 * Brapi fora e sem cache → 502 (o web mostra estado de erro).
 */
router.get(
  '/today',
  asyncHandler(async (_req: Request, res: Response) => {
    let universe;
    try {
      universe = await getMarketUniverse();
    } catch {
      res.status(502).json({ error: 'Cotações de mercado indisponíveis no momento' });
      return;
    }
    const body: MarketTodayResponse = {
      ...rankMarketMovers(universe.quotes),
      asOf: new Date(universe.fetchedAt).toISOString(),
    };
    res.json(body);
  })
);

export default router;
