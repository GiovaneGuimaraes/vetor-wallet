import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import type { NewExpenseEntry, ExpenseEntryUpdate } from '@vetor-wallet/shared';
import { normalizeCategory } from '../services/categories';
import {
  createRecurringExpenseEntry,
  materializeRecurringExpenses,
} from '../services/recurringExpenses';
import { isValidIsoDate } from '../services/dates';
import { isValidMoneyAmount, moneyDecimalsError } from '../services/money';

const router = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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
 * T-035: quantos meses à frente do mês corrente um GET pode materializar
 * ocorrências de recorrência. Navegar ‹/› alguns meses adiante é uso normal;
 * um `?month=9999-12` não é, e sem teto escreveria ocorrências indefinidamente
 * à frente.
 */
export const MATERIALIZATION_HORIZON_MONTHS = 12;

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
    const rawEndMonth = req.query.endMonth;

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

    // T-049: `endMonth` deixa o cliente ancorar a janela no PRÓPRIO fuso (o
    // padrão continua sendo o mês corrente do server — `currentMonth()`).
    // Mesma validação de formato de `month` em `GET /?month=`.
    let endMonth = currentMonth();
    if (rawEndMonth !== undefined) {
      if (typeof rawEndMonth !== 'string' || !MONTH_RE.test(rawEndMonth)) {
        res.status(400).json({ error: 'endMonth inválido (use YYYY-MM)' });
        return;
      }
      endMonth = rawEndMonth;
    }
    const startMonth = shiftMonthKey(endMonth, -(months - 1));

    // T-035/T-049: o histórico tem de refletir as recorrências dos meses da
    // janela, então materializa antes de agregar. Antes da T-049 a janela
    // terminava sempre no mês corrente do SERVER, então nunca incluía mês
    // futuro; agora que o cliente pode informar `endMonth`, um `endMonth`
    // futuro entraria na janela — por isso o mesmo teto de horizonte usado em
    // `GET /?month=` é aplicado aqui: meses além dele ainda são agregados
    // (o SELECT abaixo não tem teto), apenas não geram ocorrência nova.
    const windowMonths: string[] = [];
    for (let i = 0; i < months; i += 1) {
      windowMonths.push(shiftMonthKey(startMonth, i));
    }
    const horizonLimit = shiftMonthKey(currentMonth(), MATERIALIZATION_HORIZON_MONTHS);
    const materializableMonths = windowMonths.filter((m) => m <= horizonLimit);
    if (materializableMonths.length > 0) {
      await materializeRecurringExpenses(userId, materializableMonths);
    }

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

    // T-035: materialização lazy das recorrências ativas do mês consultado —
    // inclusive meses futuros navegados. Roda antes do SELECT para que as
    // ocorrências geradas já apareçam nesta mesma resposta.
    //
    // Teto de horizonte: um GET de `9999-12` não pode virar escrita de
    // ocorrência arbitrariamente à frente (o mês pedido não é limitado por
    // nada além do formato). Meses além do horizonte ainda são listados —
    // apenas não geram nada.
    if (month <= shiftMonthKey(currentMonth(), MATERIALIZATION_HORIZON_MONTHS)) {
      await materializeRecurringExpenses(userId, [month]);
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
    const {
      description,
      category = '',
      amount,
      date,
      recurring,
      dayOfMonth,
    } = req.body as Partial<NewExpenseEntry>;

    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'description é obrigatória' });
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (!isValidMoneyAmount(amount)) {
      res.status(400).json({ error: moneyDecimalsError() });
      return;
    }
    if (!date || typeof date !== 'string' || !isValidIsoDate(date)) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }

    if (recurring !== undefined && typeof recurring !== 'boolean') {
      res.status(400).json({ error: 'recurring deve ser booleano' });
      return;
    }
    // T-035: o dia da recorrência default é o dia do próprio lançamento.
    // Defesa mantida mesmo após `isValidIsoDate` (T-043) já garantir um dia
    // real do calendário: o dia derivado é fixado na faixa do
    // CHECK(day_of_month BETWEEN 1 AND 31) para nunca virar erro de
    // constraint (500) em vez de 400.
    let recurringDay = Math.min(Math.max(Number(date.slice(8, 10)) || 1, 1), 31);
    if (dayOfMonth !== undefined) {
      if (
        typeof dayOfMonth !== 'number' ||
        !Number.isInteger(dayOfMonth) ||
        dayOfMonth < 1 ||
        dayOfMonth > 31
      ) {
        res.status(400).json({ error: 'dayOfMonth deve ser um inteiro entre 1 e 31' });
        return;
      }
      recurringDay = dayOfMonth;
    }

    // Categoria é gravada na forma canônica (T-028) — ver services/categories.ts.
    const normalizedCategory = normalizeCategory(typeof category === 'string' ? category : '');

    // T-035: quando o lançamento é marcado como recorrente, o template nasce
    // ANTES da ocorrência (ela precisa do `recurring_id`) e o mês do próprio
    // lançamento já entra no livro-razão de meses gerados — senão o primeiro
    // GET desse mês materializaria uma segunda cópia idêntica.
    //
    // T-045: as três escritas (template + reserva do mês + primeira
    // ocorrência) rodam numa única transação (`createRecurringExpenseEntry`)
    // — uma falha entre elas não pode deixar template órfão nem mês reservado
    // sem lançamento. Ver doc da função em services/recurringExpenses.ts.
    const entryMonth = date.slice(0, 7);
    let newId: number;
    if (recurring === true) {
      // O piso da materialização é o mês de CRIAÇÃO, não o mês do lançamento:
      // marcar como recorrente um lançamento com data passada (caminho normal
      // da UI — navegar para um mês passado deixa o campo de data em
      // `${mês}-01`) não pode gerar ocorrências em meses já fechados, o que
      // reescreveria total/orçamento/histórico daqueles meses sem o usuário
      // ver. Data futura continua valendo como piso: a recorrência só começa
      // quando o lançamento acontece.
      const startMonth = entryMonth > currentMonth() ? entryMonth : currentMonth();

      const created = await createRecurringExpenseEntry({
        userId,
        description: description.trim(),
        category: normalizedCategory,
        amount,
        date,
        dayOfMonth: recurringDay,
        startMonth,
        entryMonth,
      });
      newId = created.entryId;
    } else {
      const insert = await db.execute({
        sql: `INSERT INTO expense_entries (user_id, description, category, amount, date, recurring_id)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [userId, description.trim(), normalizedCategory, amount, date, null],
      });
      newId = Number(insert.lastInsertRowid ?? 0);
    }

    // Re-SELECT também filtrado por user_id (T-059, simetria com o PATCH — T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM expense_entries WHERE id = ? AND user_id = ?',
      args: [newId, userId],
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
    if (amount !== undefined && !isValidMoneyAmount(amount)) {
      res.status(400).json({ error: moneyDecimalsError() });
      return;
    }
    if (date !== undefined && (typeof date !== 'string' || !isValidIsoDate(date))) {
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
    args.push(id, userId);

    await db.execute({
      sql: `UPDATE expense_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      args,
    });

    // Re-SELECT também filtrado por user_id (T-051).
    const row = await db.execute({
      sql: 'SELECT * FROM expense_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
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
