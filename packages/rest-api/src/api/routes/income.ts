import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import type { NewIncomeSource, IncomeSourceUpdate } from '@vetor-wallet/shared';
import {
  INCOME_SOURCE_TYPES,
  isIncomeSourceType,
  listIncomeSources,
  createIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
} from '@vetor-wallet/income-core';
import { isValidMoneyAmount, moneyAmountError } from '@vetor-wallet/validation-core';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    res.json(await listIncomeSources({ db, userId }));
  })
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
    if (type !== undefined && !isIncomeSourceType(type)) {
      res.status(400).json({ error: `type deve ser um de: ${INCOME_SOURCE_TYPES.join(', ')}` });
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

    const source = await createIncomeSource({ db, userId, name, type, amount });
    res.status(201).json(source);
  })
);

// T-031: edição parcial.
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
    if (type !== undefined && !isIncomeSourceType(type)) {
      res.status(400).json({ error: `type deve ser um de: ${INCOME_SOURCE_TYPES.join(', ')}` });
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

    const source = await updateIncomeSource({ db, userId, id, changes: { name, type, amount } });
    if (source === null) {
      res.status(404).json({ error: 'Fonte de renda não encontrada' });
      return;
    }
    res.json(source);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    if (!(await deleteIncomeSource({ db, userId, id }))) {
      res.status(404).json({ error: 'Fonte de renda não encontrada' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
