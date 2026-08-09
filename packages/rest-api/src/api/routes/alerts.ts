import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { isValidMoneyAmount, moneyAmountError } from '@vetor-wallet/validation-core';
import type { NewAlertRule } from '@vetor-wallet/shared';

const router = Router();

const VALID_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PCT', 'ALLOCATION_PCT'];

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: 'SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    });
    res.json(result.rows);
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

    const insert = await db.execute({
      sql: 'INSERT INTO alert_rules (ticker, type, threshold, user_id) VALUES (?, ?, ?, ?)',
      args: [ticker.trim().toUpperCase(), type, threshold, userId],
    });

    const newId = insert.lastInsertRowid ?? 0;
    // T-065: re-SELECT também filtrado por user_id (simetria com o padrão da
    // T-059/T-051 em operations/savings) — os ids vêm do próprio INSERT deste
    // request, então na prática já é seguro, mas o filtro custa só um argumento
    // a mais e fecha a mesma classe de descuido documentada alhures.
    const row = await db.execute({
      sql: 'SELECT * FROM alert_rules WHERE id = ? AND user_id = ?',
      args: [Number(newId), userId],
    });
    res.status(201).json(row.rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const result = await db.execute({
      sql: 'DELETE FROM alert_rules WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Regra não encontrada' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
