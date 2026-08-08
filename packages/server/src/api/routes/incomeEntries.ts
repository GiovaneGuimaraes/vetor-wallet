import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import type { NewIncomeEntry, IncomeEntryUpdate } from '@vetor-wallet/shared';
// Mês corrente no fuso local do processo — a MESMA função usada pela visão
// mensal de despesas (T-022). Importada de lá em vez de duplicada: mover o
// helper para um service exigiria editar `expenseEntries.ts`, e mexer em
// despesas está fora do escopo da T-036.
import { currentMonth } from './expenseEntries';
import {
  isValidIsoDate,
  isValidMoneyAmount,
  moneyAmountError,
} from '@vetor-wallet/validation-core';
import {
  duplicateEntryResponse,
  insertEntryWithExternalId,
  validateExternalId,
} from '@vetor-wallet/bank-import-core';

const router = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

router.use(requireAuth);
router.use(requireActiveSubscription);

/**
 * Lançamentos de renda variável de um mês (T-036). Espelha
 * `GET /api/expense-entries?month=` — mesma validação de `month`, mesmo default
 * (mês corrente no fuso local) e mesmo shape de resposta `{ month, entries }`.
 * Sem materialização de recorrência: recorrência de renda está fora de escopo.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const rawMonth = req.query.month;

    if (rawMonth !== undefined && typeof rawMonth !== 'string') {
      res.status(400).json({ error: 'month inválido (use YYYY-MM)' });
      return;
    }
    const month = rawMonth ?? currentMonth();
    if (!MONTH_RE.test(month)) {
      res.status(400).json({ error: 'month inválido (use YYYY-MM)' });
      return;
    }

    const result = await db.execute({
      sql: `SELECT * FROM income_entries
            WHERE user_id = ? AND substr(date, 1, 7) = ?
            ORDER BY date DESC, created_at DESC`,
      args: [userId, month],
    });
    res.json({ month, entries: result.rows });
  })
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { description, amount, date, externalId } = req.body as Partial<NewIncomeEntry>;

    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'description é obrigatória' });
      return;
    }
    // Number.isFinite (T-029): `1e999` chega como Infinity no JSON e passaria
    // por um `typeof === 'number'` sozinho.
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (!isValidMoneyAmount(amount)) {
      res.status(400).json({ error: moneyAmountError(amount) });
      return;
    }
    if (!date || typeof date !== 'string' || !isValidIsoDate(date)) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }

    // T-084: `externalId` opcional (id da transação na origem — OFX/Pluggy).
    // Validado depois de description/amount/date, antes do INSERT.
    const external = validateExternalId(externalId);
    if (!external.ok) {
      res.status(400).json({ error: external.error });
      return;
    }

    // A dedupe é do banco (índice único parcial): o INSERT vai primeiro e a
    // violação de unicidade é traduzida em 409 — ver @vetor-wallet/bank-import-core.
    const result = await insertEntryWithExternalId({
      table: 'income_entries',
      userId,
      values: { description: description.trim(), amount, date },
      externalId: external.value,
    });
    if (result.status === 'duplicate') {
      res.status(409).json(duplicateEntryResponse(result.row));
      return;
    }
    res.status(201).json(result.row);
  })
);

// Edição parcial no padrão T-031: o registro é localizado por `id AND user_id`,
// então o PATCH de um lançamento de outro usuário responde 404 (não vaza
// existência). Editar `date` pode mover o lançamento para outro mês — a rota
// não impede; a visão mensal do cliente é que tira o item da lista exibida.
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const { description, amount, date } = req.body as IncomeEntryUpdate;

    if (description === undefined && amount === undefined && date === undefined) {
      res.status(400).json({ error: 'informe ao menos um campo para atualizar' });
      return;
    }
    if (description !== undefined && (typeof description !== 'string' || !description.trim())) {
      res.status(400).json({ error: 'description não pode ser vazia' });
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

    const existing = await db.execute({
      sql: 'SELECT id FROM income_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lançamento de renda não encontrado' });
      return;
    }

    const fields: string[] = [];
    const args: (string | number)[] = [];
    if (description !== undefined) {
      fields.push('description = ?');
      args.push(description.trim());
    }
    if (amount !== undefined) {
      fields.push('amount = ?');
      args.push(amount);
    }
    if (date !== undefined) {
      fields.push('date = ?');
      args.push(date);
    }
    args.push(id, userId);

    await db.execute({
      sql: `UPDATE income_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });

    // Re-SELECT também filtrado por user_id (T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM income_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    res.json(row.rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const result = await db.execute({
      sql: 'DELETE FROM income_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Lançamento de renda não encontrado' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
