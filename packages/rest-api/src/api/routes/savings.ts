import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import {
  SAVINGS_ENTRY_TYPES,
  isSavingsEntryType,
  summariseSavings,
  listSavingsEntries,
  createSavingsEntry,
  updateSavingsEntry,
  deleteSavingsEntry,
} from '@vetor-wallet/savings-core';
import {
  isValidIsoDate,
  isValidMoneyAmount,
  moneyAmountError,
} from '@vetor-wallet/validation-core';
import type { NewSavingsEntry, SavingsEntryUpdate } from '@vetor-wallet/shared';

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const entries = await listSavingsEntries({ db, userId });
    res.json({ entries, summary: summariseSavings(entries) });
  })
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    // `goalId` saiu do contrato na T-091b1 (Metas removida). Um cliente antigo
    // que ainda mande o campo tem ele IGNORADO em silêncio — é o que a API já
    // faz com qualquer campo desconhecido em todas as outras rotas.
    const { type, amount, date, note = '' } = req.body as Partial<NewSavingsEntry>;

    if (!isSavingsEntryType(type)) {
      res.status(400).json({ error: `type deve ser um de: ${SAVINGS_ENTRY_TYPES.join(', ')}` });
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
    if (!date || !isValidIsoDate(date)) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }

    const entry = await createSavingsEntry({ db, userId, type, amount, date, note });
    res.status(201).json(entry);
  })
);

/**
 * T-031: edição parcial de um lançamento.
 *
 * O vínculo com meta saiu na T-091b1 (Metas removida do app): `goalId` deixou
 * de ser aceito e, como qualquer campo desconhecido no resto da API, é
 * **ignorado em silêncio** — um corpo só com `goalId` cai no 400 de "informe ao
 * menos um campo para atualizar".
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const { type, amount, date, note } = req.body as SavingsEntryUpdate;

    if (type === undefined && amount === undefined && date === undefined && note === undefined) {
      res.status(400).json({ error: 'informe ao menos um campo para atualizar' });
      return;
    }
    if (type !== undefined && !isSavingsEntryType(type)) {
      res.status(400).json({ error: `type deve ser um de: ${SAVINGS_ENTRY_TYPES.join(', ')}` });
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
    if (date !== undefined && (typeof date !== 'string' || !isValidIsoDate(date))) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }
    if (note !== undefined && typeof note !== 'string') {
      res.status(400).json({ error: 'note deve ser texto' });
      return;
    }

    const entry = await updateSavingsEntry({
      db,
      userId,
      id,
      changes: { type, amount, date, note },
    });
    if (entry === null) {
      res.status(404).json({ error: 'Lançamento de poupança não encontrado' });
      return;
    }
    res.json(entry);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const apagou = await deleteSavingsEntry({ db, userId, id });
    if (!apagou) {
      res.status(404).json({ error: 'Lançamento de poupança não encontrado' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
