import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { toPlan, type PlanRow } from '@vetor-wallet/billing-core';

const router = Router();

router.use(requireAuth);

/**
 * Vitrine de planos (T-070).
 *
 * ÚNICA rota de dados do app que NÃO filtra por `user_id` — e é intencional:
 * `plans` é catálogo global semeado por `seedPlans()`, não tem coluna de dono.
 * A regra do CLAUDE.md continua valendo para todo o resto.
 *
 * Só planos `active = 1` aparecem: um plano desativado sai da vitrine mas segue
 * resolvível para quem já assinou (ver `getActivePlan`).
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await db.execute(
      'SELECT * FROM plans WHERE active = 1 ORDER BY price_cents ASC',
    );
    res.json((result.rows as unknown as PlanRow[]).map(toPlan));
  }),
);

export default router;
