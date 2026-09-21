import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import type { NewFixedExpense, FixedExpenseUpdate } from '@vetor-wallet/shared';
import {
  listFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
} from '@vetor-wallet/expenses-core';
import { isValidMoneyAmount, moneyAmountError } from '@vetor-wallet/validation-core';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    res.json(await listFixedExpenses({ db, userId }));
  })
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

    // A normalização da categoria (T-028) mora no core, junto da gravação.
    const expense = await createFixedExpense({
      db,
      userId,
      name,
      category: typeof category === 'string' ? category : '',
      amount,
    });
    res.status(201).json(expense);
  })
);

// T-031: edição parcial.
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

    const expense = await updateFixedExpense({
      db,
      userId,
      id,
      changes: { name, category, amount },
    });
    if (expense === null) {
      res.status(404).json({ error: 'Despesa fixa não encontrada' });
      return;
    }
    res.json(expense);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    if (!(await deleteFixedExpense({ db, userId, id }))) {
      res.status(404).json({ error: 'Despesa fixa não encontrada' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
