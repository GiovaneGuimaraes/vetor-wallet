import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { createSqliteQuery } from '../sqliteQuery';
import { isValidMoneyAmount, moneyAmountError } from '@vetor-wallet/validation-core';
import { createAlertRule, deleteAlertRule, listAlertRules } from '@vetor-wallet/alerts-core';
import type { NewAlertRule } from '@vetor-wallet/shared';

const router = Router();

// Mesma ponte das demais rotas migradas (T-114): o core fala `Query` com
// `$1, $2…` e este adaptador os traduz para o libSQL de hoje.
const query = createSqliteQuery(db);

const VALID_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PCT', 'ALLOCATION_PCT'];

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    res.json(await listAlertRules({ query, userId }));
  })
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { ticker, type, threshold } = req.body as Partial<NewAlertRule>;

    if (!ticker || typeof ticker !== 'string' || !ticker.trim()) {
      res.status(400).json({ error: 'ticker obrigatório' });
      return;
    }
    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type deve ser um de: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (
      threshold === undefined ||
      typeof threshold !== 'number' ||
      !Number.isFinite(threshold) ||
      threshold <= 0
    ) {
      res.status(400).json({ error: 'threshold deve ser maior que 0' });
      return;
    }
    // T-059: mesmo padrão da T-052 (isValidMoneyAmount), aplicado a threshold.
    if (!isValidMoneyAmount(threshold)) {
      res.status(400).json({ error: moneyAmountError(threshold, 'threshold') });
      return;
    }

    const alertRule = await createAlertRule({
      query,
      userId,
      ticker: ticker.trim().toUpperCase(),
      type,
      threshold,
    });
    res.status(201).json(alertRule);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    if (!(await deleteAlertRule({ query, userId, id }))) {
      res.status(404).json({ error: 'Regra não encontrada' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
