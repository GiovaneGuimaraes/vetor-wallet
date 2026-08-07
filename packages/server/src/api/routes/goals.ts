import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import type { NewGoal, GoalUpdate } from '@vetor-wallet/shared';
import { listGoalsWithProgress, getGoalWithProgress, getGoalLinkAggregate } from '@vetor-wallet/savings-core';
import { isValidMoneyAmount, moneyAmountError } from '@vetor-wallet/validation-core';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    res.json(await listGoalsWithProgress(userId));
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
    if (typeof target_amount !== 'number' || !Number.isFinite(target_amount) || target_amount <= 0) {
      res.status(400).json({ error: 'target_amount deve ser um número maior que 0' });
      return;
    }
    if (!isValidMoneyAmount(target_amount)) {
      res.status(400).json({ error: moneyAmountError(target_amount, 'target_amount') });
      return;
    }
    if (typeof current_amount !== 'number' || !Number.isFinite(current_amount) || current_amount < 0) {
      res.status(400).json({ error: 'current_amount deve ser um número maior ou igual a 0' });
      return;
    }
    if (!isValidMoneyAmount(current_amount)) {
      res.status(400).json({ error: moneyAmountError(current_amount, 'current_amount') });
      return;
    }

    const insert = await db.execute({
      sql: 'INSERT INTO goals (user_id, name, target_amount, current_amount) VALUES (?, ?, ?, ?)',
      args: [userId, name.trim(), target_amount, current_amount],
    });

    const newId = Number(insert.lastInsertRowid ?? 0);
    res.status(201).json(await getGoalWithProgress(userId, newId));
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
      (typeof target_amount !== 'number' || !Number.isFinite(target_amount) || target_amount <= 0)
    ) {
      res.status(400).json({ error: 'target_amount deve ser um número maior que 0' });
      return;
    }
    if (target_amount !== undefined && !isValidMoneyAmount(target_amount)) {
      res.status(400).json({ error: moneyAmountError(target_amount, 'target_amount') });
      return;
    }
    if (
      current_amount !== undefined &&
      (typeof current_amount !== 'number' || !Number.isFinite(current_amount) || current_amount < 0)
    ) {
      res.status(400).json({ error: 'current_amount deve ser um número maior ou igual a 0' });
      return;
    }
    if (current_amount !== undefined && !isValidMoneyAmount(current_amount)) {
      res.status(400).json({ error: moneyAmountError(current_amount, 'current_amount') });
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

    // T-024: metas alimentadas por lançamentos de poupança têm progresso
    // derivado — editar `current_amount` à mão criaria duas fontes de verdade.
    if (current_amount !== undefined) {
      const aggregate = await getGoalLinkAggregate(userId, Number(id));
      if (aggregate) {
        res.status(400).json({
          error:
            'Esta meta tem lançamentos de poupança vinculados: o valor atual é calculado automaticamente ' +
            '(aportes − retiradas vinculados) e não pode ser editado manualmente. Ajuste os lançamentos em /poupanca.',
        });
        return;
      }
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
    args.push(id, userId);

    await db.execute({
      sql: `UPDATE goals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });

    res.json(await getGoalWithProgress(userId, Number(id)));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const existing = await db.execute({
      sql: 'SELECT id FROM goals WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Meta não encontrada' });
      return;
    }

    // T-024: os lançamentos vinculados continuam existindo na poupança (o saldo
    // não muda), mas perdem o vínculo. O UPDATE precisa vir ANTES do DELETE:
    // `savings_entries.goal_id` é FOREIGN KEY e o libsql aplica a constraint,
    // então apagar a meta com lançamentos ainda apontando para ela falharia.
    await db.batch(
      [
        {
          sql: 'UPDATE savings_entries SET goal_id = NULL WHERE goal_id = ? AND user_id = ?',
          args: [id, userId],
        },
        {
          sql: 'DELETE FROM goals WHERE id = ? AND user_id = ?',
          args: [id, userId],
        },
      ],
      'write',
    );
    res.status(204).send();
  }),
);

export default router;
