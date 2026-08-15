import { Router, Request, Response } from 'express';
import { db } from '@vetor-wallet/db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription';
import { toCents } from '@vetor-wallet/savings-core';
import {
  isValidIsoDate,
  isValidMoneyAmount,
  moneyAmountError,
} from '@vetor-wallet/validation-core';
import type {
  NewSavingsEntry,
  SavingsEntryType,
  SavingsEntry,
  SavingsEntryUpdate,
  SavingsSummary,
} from '@vetor-wallet/shared';

const router = Router();

const VALID_TYPES: SavingsEntryType[] = ['DEPOSIT', 'WITHDRAW', 'YIELD'];

router.use(requireAuth);
router.use(requireActiveSubscription);

// Somado em centavos inteiros, alinhado a `computeBalance`
// (@vetor-wallet/savings-core): somar em float direto pode divergir em um centavo de
// `balance = totalDeposits + totalYield - totalWithdrawals` em razões grandes.
// Desde a T-091b1 (Metas removida) o `balance` é também o saldo LIVRE: não há
// mais reserva a descontar, e lançamento legado com `goal_id` conta integral.
function buildSummary(entries: SavingsEntry[]): SavingsSummary {
  let depositsCents = 0;
  let yieldCents = 0;
  let withdrawalsCents = 0;

  for (const entry of entries) {
    const cents = toCents(entry.amount);
    if (entry.type === 'DEPOSIT') depositsCents += cents;
    else if (entry.type === 'YIELD') yieldCents += cents;
    else if (entry.type === 'WITHDRAW') withdrawalsCents += cents;
  }

  return {
    balance: (depositsCents + yieldCents - withdrawalsCents) / 100,
    totalDeposits: depositsCents / 100,
    totalYield: yieldCents / 100,
    totalWithdrawals: withdrawalsCents / 100,
  };
}

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const result = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE user_id = ? ORDER BY date DESC, created_at DESC',
      args: [userId],
    });
    const entries = result.rows as unknown as SavingsEntry[];
    res.json({ entries, summary: buildSummary(entries) });
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

    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type deve ser um de: ${VALID_TYPES.join(', ')}` });
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

    // A coluna `goal_id` ainda existe no schema (a T-091b2 é quem a remove),
    // mas nada novo é gravado nela: fica NULL por omissão.
    const insert = await db.execute({
      sql: 'INSERT INTO savings_entries (user_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)',
      args: [userId, type, amount, date, note ?? ''],
    });

    const newId = insert.lastInsertRowid ?? 0;
    // Re-SELECT também filtrado por user_id (T-059, simetria com o PATCH — T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE id = ? AND user_id = ?',
      args: [Number(newId), userId],
    });
    res.status(201).json(row.rows[0]);
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

    const existing = await db.execute({
      sql: 'SELECT id FROM savings_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lançamento de poupança não encontrado' });
      return;
    }

    const fields: string[] = [];
    const args: (string | number | null)[] = [];
    if (type !== undefined) {
      fields.push('type = ?');
      args.push(type);
    }
    if (amount !== undefined) {
      fields.push('amount = ?');
      args.push(amount);
    }
    if (date !== undefined) {
      fields.push('date = ?');
      args.push(date);
    }
    if (note !== undefined) {
      fields.push('note = ?');
      args.push(note);
    }
    args.push(id, userId);

    await db.execute({
      sql: `UPDATE savings_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });

    // Re-SELECT também filtrado por user_id (T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE id = ? AND user_id = ?',
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
      sql: 'DELETE FROM savings_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Lançamento de poupança não encontrado' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
