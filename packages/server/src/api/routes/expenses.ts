import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewFixedExpense, FixedExpenseUpdate } from '@vetor-wallet/shared';
import { normalizeCategory } from '../services/categories';
import { isValidMoneyAmount, moneyAmountError } from '../services/money';

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
    if (!isValidMoneyAmount(amount)) {
      res.status(400).json({ error: moneyAmountError(amount) });
      return;
    }

    // Categoria é gravada na forma canônica (T-028) — ver services/categories.ts.
    const normalizedCategory = normalizeCategory(typeof category === 'string' ? category : '');

    const insert = await db.execute({
      sql: 'INSERT INTO fixed_expenses (user_id, name, category, amount) VALUES (?, ?, ?, ?)',
      args: [userId, name.trim(), normalizedCategory, amount],
    });

    const newId = insert.lastInsertRowid ?? 0;
    // Re-SELECT também filtrado por user_id (T-059, simetria com o PATCH — T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?',
      args: [Number(newId), userId],
    });
    res.status(201).json(row.rows[0]);
  }),
);

// T-031: edição parcial, espelhando o padrão de PATCH /api/goals/:id.
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const { name, category, amount } = req.body as FixedExpenseUpdate;

    if (name === undefined && category === undefined && amount === undefined) {
      res.status(400).json({ error: 'informe ao menos um campo para atualizar' });
      return;
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: 'name não pode ser vazio' });
      return;
    }
    if (category !== undefined && typeof category !== 'string') {
      res.status(400).json({ error: 'category deve ser texto' });
      return;
    }
    if (
      amount !== undefined &&
      (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
    ) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (amount !== undefined && !isValidMoneyAmount(amount)) {
      res.status(400).json({ error: moneyAmountError(amount) });
      return;
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM fixed_expenses WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Despesa fixa não encontrada' });
      return;
    }

    const fields: string[] = [];
    const args: (string | number)[] = [];
    if (name !== undefined) {
      fields.push('name = ?');
      args.push(name.trim());
    }
    if (category !== undefined) {
      // Mesma forma canônica da criação (T-028) — ver services/categories.ts.
      fields.push('category = ?');
      args.push(normalizeCategory(category));
    }
    if (amount !== undefined) {
      fields.push('amount = ?');
      args.push(amount);
    }
    args.push(id, userId);

    await db.execute({
      sql: `UPDATE fixed_expenses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });

    // Re-SELECT também filtrado por user_id (T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    res.json(row.rows[0]);
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
