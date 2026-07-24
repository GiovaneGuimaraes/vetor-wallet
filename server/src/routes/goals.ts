import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewGoal, GoalUpdate } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: 'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    });
    res.json(result.rows);
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { name, target_amount, current_amount = 0 } = req.body as Partial<NewGoal>;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name é obrigatório' });
      return;
    }
    if (typeof target_amount !== 'number' || Number.isNaN(target_amount) || target_amount <= 0) {
      res.status(400).json({ error: 'target_amount deve ser um número maior que 0' });
      return;
    }
    if (typeof current_amount !== 'number' || Number.isNaN(current_amount) || current_amount < 0) {
      res.status(400).json({ error: 'current_amount deve ser um número maior ou igual a 0' });
      return;
    }

    const insert = await db.execute({
      sql: 'INSERT INTO goals (user_id, name, target_amount, current_amount) VALUES (?, ?, ?, ?)',
      args: [userId, name.trim(), target_amount, current_amount],
    });

    const newId = insert.lastInsertRowid ?? 0;
    const row = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [Number(newId)],
    });
    res.status(201).json(row.rows[0]);
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const { name, target_amount, current_amount } = req.body as GoalUpdate;

    if (name === undefined && target_amount === undefined && current_amount === undefined) {
      res.status(400).json({ error: 'informe ao menos um campo para atualizar' });
      return;
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: 'name não pode ser vazio' });
      return;
    }
    if (
      target_amount !== undefined &&
      (typeof target_amount !== 'number' || Number.isNaN(target_amount) || target_amount <= 0)
    ) {
      res.status(400).json({ error: 'target_amount deve ser um número maior que 0' });
      return;
    }
    if (
      current_amount !== undefined &&
      (typeof current_amount !== 'number' || Number.isNaN(current_amount) || current_amount < 0)
    ) {
      res.status(400).json({ error: 'current_amount deve ser um número maior ou igual a 0' });
      return;
    }

    const existing = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Meta não encontrada' });
      return;
    }

    const fields: string[] = [];
    const args: (string | number)[] = [];
    if (name !== undefined) {
      fields.push('name = ?');
      args.push(name.trim());
    }
    if (target_amount !== undefined) {
      fields.push('target_amount = ?');
      args.push(target_amount);
    }
    if (current_amount !== undefined) {
      fields.push('current_amount = ?');
      args.push(current_amount);
    }
    args.push(id);

    await db.execute({
      sql: `UPDATE goals SET ${fields.join(', ')} WHERE id = ?`,
      args,
    });

    const row = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id],
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
      sql: 'DELETE FROM goals WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Meta não encontrada' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
