import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewSavingsEntry, SavingsEntryType, SavingsEntry, SavingsSummary } from '@vetor-wallet/shared';

const router = Router();

const VALID_TYPES: SavingsEntryType[] = ['DEPOSIT', 'WITHDRAW', 'YIELD'];

router.use(requireAuth);

function buildSummary(entries: SavingsEntry[]): SavingsSummary {
  let totalDeposits = 0;
  let totalYield = 0;
  let totalWithdrawals = 0;

  for (const entry of entries) {
    if (entry.type === 'DEPOSIT') totalDeposits += entry.amount;
    else if (entry.type === 'YIELD') totalYield += entry.amount;
    else if (entry.type === 'WITHDRAW') totalWithdrawals += entry.amount;
  }

  return {
    balance: totalDeposits + totalYield - totalWithdrawals,
    totalDeposits,
    totalYield,
    totalWithdrawals,
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
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { type, amount, date, note = '' } = req.body as Partial<NewSavingsEntry>;

    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type deve ser um de: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }

    const insert = await db.execute({
      sql: 'INSERT INTO savings_entries (user_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)',
      args: [userId, type, amount, date, note ?? ''],
    });

    const newId = insert.lastInsertRowid ?? 0;
    const row = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE id = ?',
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
      sql: 'DELETE FROM savings_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Lançamento de poupança não encontrado' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
