import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewIncomeSource, IncomeSourceType, IncomeSourceUpdate } from '@vetor-wallet/shared';

const router = Router();

const VALID_TYPES: IncomeSourceType[] = ['SALARIO', 'FREELA', 'OUTRO'];

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: 'SELECT * FROM income_sources WHERE user_id = ? ORDER BY created_at DESC',
      args: [userId],
    });
    res.json(result.rows);
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { name, type = 'OUTRO', amount } = req.body as Partial<NewIncomeSource>;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name é obrigatório' });
      return;
    }
    if (type !== undefined && !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type deve ser um de: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }

    const insert = await db.execute({
      sql: 'INSERT INTO income_sources (user_id, name, type, amount) VALUES (?, ?, ?, ?)',
      args: [userId, name.trim(), type, amount],
    });

    const newId = insert.lastInsertRowid ?? 0;
    const row = await db.execute({
      sql: 'SELECT * FROM income_sources WHERE id = ?',
      args: [Number(newId)],
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
    const { name, type, amount } = req.body as IncomeSourceUpdate;

    if (name === undefined && type === undefined && amount === undefined) {
      res.status(400).json({ error: 'informe ao menos um campo para atualizar' });
      return;
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: 'name não pode ser vazio' });
      return;
    }
    if (type !== undefined && !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type deve ser um de: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (
      amount !== undefined &&
      (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
    ) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM income_sources WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Fonte de renda não encontrada' });
      return;
    }

    const fields: string[] = [];
    const args: (string | number)[] = [];
    if (name !== undefined) {
      fields.push('name = ?');
      args.push(name.trim());
    }
    if (type !== undefined) {
      fields.push('type = ?');
      args.push(type);
    }
    if (amount !== undefined) {
      fields.push('amount = ?');
      args.push(amount);
    }
    args.push(id, userId);

    await db.execute({
      sql: `UPDATE income_sources SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });

    const row = await db.execute({
      sql: 'SELECT * FROM income_sources WHERE id = ?',
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
      sql: 'DELETE FROM income_sources WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Fonte de renda não encontrada' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
