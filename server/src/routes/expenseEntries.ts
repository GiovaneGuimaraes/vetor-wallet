import { Router, Request, Response } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewExpenseEntry, ExpenseEntryUpdate } from '@vetor-wallet/shared';
import { normalizeCategory } from '../services/categories';

const router = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mês corrente no fuso local do processo (YYYY-MM). Usado como default de
 * `GET /api/expense-entries` quando o cliente não informa `?month=`.
 * `toISOString()` seria UTC e viraria o mês cedo demais no BRT (UTC-3).
 */
export function currentMonth(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const MAX_SUMMARY_MONTHS = 24;
const DEFAULT_SUMMARY_MONTHS = 6;

/**
 * Desloca um mês `YYYY-MM` em `delta` meses, virando o ano quando necessário.
 * Duplicada de propósito de `web/src/routes/expenseMonth.ts > shiftMonth` —
 * mesmo padrão de duplicação de `services/categories.ts` (T-028): `shared/`
 * é types-only, então cada pacote tem sua própria cópia da função de runtime.
 */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return monthKey;

  const total = year * 12 + monthIndex + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth + 1).padStart(2, '0')}`;
}

router.use(requireAuth);

// T-033: precisa vir ANTES de qualquer rota GET com `/:id` no mesmo router
// (não há uma hoje, mas evita a armadilha de "summary" casar como um `:id`
// se uma for adicionada no futuro). Agrega o total de lançamentos variáveis
// por mês, dos últimos `months` meses até o mês corrente.
router.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const rawMonths = req.query.months;

    let months = DEFAULT_SUMMARY_MONTHS;
    if (rawMonths !== undefined) {
      if (typeof rawMonths !== 'string' || !/^\d+$/.test(rawMonths)) {
        res.status(400).json({ error: `months inválido (use um inteiro entre 1 e ${MAX_SUMMARY_MONTHS})` });
        return;
      }
      months = Number(rawMonths);
      if (months < 1 || months > MAX_SUMMARY_MONTHS) {
        res
          .status(400)
          .json({ error: `months inválido (use um inteiro entre 1 e ${MAX_SUMMARY_MONTHS})` });
        return;
      }
    }

    const endMonth = currentMonth();
    const startMonth = shiftMonthKey(endMonth, -(months - 1));

    const result = await db.execute({
      sql: `SELECT substr(date, 1, 7) as month, SUM(amount) as total FROM expense_entries
            WHERE user_id = ? AND substr(date, 1, 7) BETWEEN ? AND ?
            GROUP BY month
            ORDER BY month ASC`,
      args: [userId, startMonth, endMonth],
    });

    const monthsSummary = result.rows.map((row) => ({
      month: String(row.month),
      total: Number(row.total),
    }));
    res.json({ months: monthsSummary });
  }),
);

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
      sql: `SELECT * FROM expense_entries
            WHERE user_id = ? AND substr(date, 1, 7) = ?
            ORDER BY date DESC, created_at DESC`,
      args: [userId, month],
    });
    res.json({ month, entries: result.rows });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { description, category = '', amount, date } = req.body as Partial<NewExpenseEntry>;

    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'description é obrigatória' });
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (!date || typeof date !== 'string' || !DATE_RE.test(date)) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }

    // Categoria é gravada na forma canônica (T-028) — ver services/categories.ts.
    const normalizedCategory = normalizeCategory(typeof category === 'string' ? category : '');

    const insert = await db.execute({
      sql: 'INSERT INTO expense_entries (user_id, description, category, amount, date) VALUES (?, ?, ?, ?, ?)',
      args: [userId, description.trim(), normalizedCategory, amount, date],
    });

    const newId = insert.lastInsertRowid ?? 0;
    const row = await db.execute({
      sql: 'SELECT * FROM expense_entries WHERE id = ?',
      args: [Number(newId)],
    });
    res.status(201).json(row.rows[0]);
  }),
);

// T-031: edição parcial, espelhando o padrão de PATCH /api/goals/:id. Editar
// `date` pode mover o lançamento para outro mês — a rota não impede isso; a
// visão mensal do cliente é que deve tirar o item da lista exibida.
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const { description, category, amount, date } = req.body as ExpenseEntryUpdate;

    if (
      description === undefined &&
      category === undefined &&
      amount === undefined &&
      date === undefined
    ) {
      res.status(400).json({ error: 'informe ao menos um campo para atualizar' });
      return;
    }
    if (description !== undefined && (typeof description !== 'string' || !description.trim())) {
      res.status(400).json({ error: 'description não pode ser vazia' });
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
    if (date !== undefined && (typeof date !== 'string' || !DATE_RE.test(date))) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM expense_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lançamento de despesa não encontrado' });
      return;
    }

    const fields: string[] = [];
    const args: (string | number)[] = [];
    if (description !== undefined) {
      fields.push('description = ?');
      args.push(description.trim());
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
    if (date !== undefined) {
      fields.push('date = ?');
      args.push(date);
    }
    args.push(id);

    await db.execute({
      sql: `UPDATE expense_entries SET ${fields.join(', ')} WHERE id = ?`,
      args,
    });

    const row = await db.execute({
      sql: 'SELECT * FROM expense_entries WHERE id = ?',
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
      sql: 'DELETE FROM expense_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Lançamento de despesa não encontrado' });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
