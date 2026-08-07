import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import type { NewCategoryBudget } from '@vetor-wallet/shared';
import { normalizeCategory, isValidMoneyAmount, moneyAmountError } from '@vetor-wallet/validation-core';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: 'SELECT * FROM category_budgets WHERE user_id = ? ORDER BY category ASC',
      args: [userId],
    });
    res.json(result.rows);
  }),
);

/**
 * Upsert por categoria: um orçamento por (user_id, category) — reenviar a
 * mesma categoria substitui o valor anterior em vez de criar um duplicado.
 * A categoria é gravada na forma canônica (T-028), então variações de caixa e
 * de espaço ("Mercado", "mercado ") caem no mesmo registro e substituem o teto
 * em vez de duplicar.
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { category, amount } = req.body as Partial<NewCategoryBudget>;

    const normalizedCategory =
      typeof category === 'string' ? normalizeCategory(category) : '';

    if (!normalizedCategory) {
      res.status(400).json({ error: 'category é obrigatória' });
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (!isValidMoneyAmount(amount)) {
      res.status(400).json({ error: moneyAmountError(amount) });
      return;
    }

    await db.execute({
      sql: `INSERT INTO category_budgets (user_id, category, amount)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, category) DO UPDATE SET amount = excluded.amount`,
      args: [userId, normalizedCategory, amount],
    });

    const row = await db.execute({
      sql: 'SELECT * FROM category_budgets WHERE user_id = ? AND category = ?',
      args: [userId, normalizedCategory],
    });
    res.status(201).json(row.rows[0]);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const result = await db.execute({
      sql: 'DELETE FROM category_budgets WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Orçamento não encontrado' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
