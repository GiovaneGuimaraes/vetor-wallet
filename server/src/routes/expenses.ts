import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewFixedExpense } from '@vetor-wallet/shared';
import { normalizeCategory } from '../services/categories';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: 'SELECT * FROM fixed_expenses WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    });
    res.json(result.rows);
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { name, category = '', amount } = req.body as Partial<NewFixedExpense>;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name é obrigatório' });
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }

    // Categoria é gravada na forma canônica (T-028) — ver services/categories.ts.
    const normalizedCategory = normalizeCategory(typeof category === 'string' ? category : '');

    const insert = await db.execute({
      sql: 'INSERT INTO fixed_expenses (user_id, name, category, amount) VALUES (?, ?, ?, ?)',
      args: [userId, name.trim(), normalizedCategory, amount],
    });

    const newId = insert.lastInsertRowid ?? 0;
    const row = await db.execute({
      sql: 'SELECT * FROM fixed_expenses WHERE id = ?',
      args: [Number(newId)],
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
      sql: 'DELETE FROM fixed_expenses WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Despesa fixa não encontrada' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
