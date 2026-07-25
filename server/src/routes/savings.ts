import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../auth/middleware';
import { computeFreeBalance, toCents } from '../services/savings';
import type {
  NewSavingsEntry,
  SavingsEntryType,
  SavingsEntry,
  SavingsEntryUpdate,
  SavingsSummary,
  SavingsTransferRequest,
} from '@vetor-wallet/shared';

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
    const { type, amount, date, note = '', goalId } = req.body as Partial<NewSavingsEntry>;

    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type deve ser um de: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }

    // T-024: vínculo opcional com uma meta financeira.
    let linkedGoalId: number | null = null;
    if (goalId !== undefined && goalId !== null) {
      if (typeof goalId !== 'number' || !Number.isInteger(goalId) || goalId <= 0) {
        res.status(400).json({ error: 'goalId deve ser o id inteiro de uma meta' });
        return;
      }
      if (type === 'YIELD') {
        res.status(400).json({
          error: 'Lançamentos de rendimento (YIELD) não podem ser vinculados a metas',
        });
        return;
      }
      const goal = await db.execute({
        sql: 'SELECT id FROM goals WHERE id = ? AND user_id = ?',
        args: [goalId, userId],
      });
      if (goal.rows.length === 0) {
        res.status(404).json({ error: 'Meta não encontrada' });
        return;
      }
      linkedGoalId = goalId;
    }

    const insert = await db.execute({
      sql: 'INSERT INTO savings_entries (user_id, type, amount, date, note, goal_id) VALUES (?, ?, ?, ?, ?, ?)',
      args: [userId, type, amount, date, note ?? '', linkedGoalId],
    });

    const newId = insert.lastInsertRowid ?? 0;
    const row = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE id = ?',
      args: [Number(newId)],
    });
    res.status(201).json(row.rows[0]);
  }),
);

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * T-041: transferir para uma meta dinheiro que já está na poupança.
 *
 * Grava um **par atômico** no mesmo `db.batch(..., 'write')`: um `WITHDRAW` sem
 * vínculo e um `DEPOSIT` vinculado à meta, mesmo `amount`/`date` e um
 * `transfer_group` comum. Consequências que são o ponto da tarefa:
 *
 * - o **saldo não muda** (−X +X), então a invariante
 *   `saldo = DEPOSIT + YIELD − WITHDRAW` continua valendo e o dinheiro segue na
 *   poupança rendendo — só passa a estar *reservado* para a meta (coerente com
 *   "meta é uma visão sobre os lançamentos, não um cofre separado");
 * - o progresso da meta sobe exatamente X, porque só a perna de DEPOSIT é
 *   vinculada. **A perna de WITHDRAW não pode ter `goal_id`**: com as duas
 *   vinculadas, `fetchGoalLinkAggregates` somaria +X −X = 0 e o progresso não
 *   andaria;
 * - o que cai é o **saldo livre** (`saldo − reservado em metas`), derivado na
 *   leitura por `computeFreeBalance` — e é contra ele, não contra o saldo total,
 *   que o valor pedido é validado.
 *
 * `totalDeposits` e `totalWithdrawals` do `summary` sobem X cada — custo aceito
 * para não inventar um terceiro tipo de lançamento nem coluna de origem.
 *
 * Declarado ANTES das rotas `/:id` para não ser capturado por elas.
 */
router.post(
  '/transfer-to-goal',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { goalId, amount, date, note } = req.body as Partial<SavingsTransferRequest>;

    if (typeof goalId !== 'number' || !Number.isInteger(goalId) || goalId <= 0) {
      res.status(400).json({ error: 'goalId deve ser o id inteiro de uma meta' });
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número maior que 0' });
      return;
    }
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }
    if (note !== undefined && typeof note !== 'string') {
      res.status(400).json({ error: 'note deve ser texto' });
      return;
    }

    const goalResult = await db.execute({
      sql: 'SELECT id, name FROM goals WHERE id = ? AND user_id = ?',
      args: [goalId, userId],
    });
    if (goalResult.rows.length === 0) {
      res.status(404).json({ error: 'Meta não encontrada' });
      return;
    }
    const goalName = String(goalResult.rows[0].name ?? '');

    // Saldo livre = saldo − reservado nas metas. Ler o razão inteiro é o mesmo
    // custo do GET / e mantém o cálculo numa função pura testada.
    const ledger = await db.execute({
      sql: 'SELECT type, amount, goal_id FROM savings_entries WHERE user_id = ?',
      args: [userId],
    });
    const free = computeFreeBalance(
      ledger.rows as unknown as { type: SavingsEntryType; amount: number; goal_id: number | null }[],
    );

    // Comparação em centavos inteiros: em float, transferir exatamente um saldo
    // livre que veio de somas como 0.1 + 0.2 seria rejeitado por ruído.
    if (toCents(amount) > toCents(free)) {
      res.status(400).json({
        error: `Saldo livre insuficiente: você tentou transferir ${fmtBRL.format(
          amount,
        )} e há ${fmtBRL.format(Math.max(0, free))} livres na poupança (o restante já está reservado em metas).`,
      });
      return;
    }

    const transferGroup = randomUUID();
    const legNote = note?.trim() || `Reservado para a meta: ${goalName}`;

    // As duas pernas no MESMO batch transacional: uma falha entre elas deixaria
    // o razão com meia transferência (saldo furado ou meta inflada).
    const [withdrawResult, depositResult] = await db.batch(
      [
        {
          sql: `INSERT INTO savings_entries (user_id, type, amount, date, note, goal_id, transfer_group)
                VALUES (?, 'WITHDRAW', ?, ?, ?, NULL, ?)`,
          args: [userId, amount, date, legNote, transferGroup],
        },
        {
          sql: `INSERT INTO savings_entries (user_id, type, amount, date, note, goal_id, transfer_group)
                VALUES (?, 'DEPOSIT', ?, ?, ?, ?, ?)`,
          args: [userId, amount, date, legNote, goalId, transferGroup],
        },
      ],
      'write',
    );

    const withdrawId = Number(withdrawResult.lastInsertRowid ?? 0);
    const depositId = Number(depositResult.lastInsertRowid ?? 0);
    const rows = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE id IN (?, ?)',
      args: [withdrawId, depositId],
    });
    const created = rows.rows as unknown as SavingsEntry[];

    res.status(201).json({
      withdraw: created.find((entry) => Number(entry.id) === withdrawId),
      deposit: created.find((entry) => Number(entry.id) === depositId),
    });
  }),
);

/**
 * T-031: edição parcial de um lançamento, espelhando `PATCH /api/goals/:id`.
 *
 * O progresso de uma meta vinculada é **derivado na leitura** (T-024, não
 * materializado), então editar `amount`/`type`/vínculo aqui já reflete na meta
 * sem nenhum recálculo — mas por isso mesmo as invariantes do vínculo têm de
 * ser reavaliadas sobre o **estado resultante** do PATCH, não só sobre o que
 * veio no corpo:
 *
 * - `goalId` ausente preserva o vínculo atual; `null` desvincula; um id
 *   revincula (404 se a meta for de outro usuário).
 * - "YIELD não pode ser vinculado" é checado com o tipo e o vínculo
 *   resultantes: `type: 'YIELD'` num lançamento já vinculado responde 400, a
 *   menos que o mesmo request desvincule com `goalId: null`.
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = res.locals.userId as number;
    const { id } = req.params;
    const { type, amount, date, note, goalId } = req.body as SavingsEntryUpdate;

    if (
      type === undefined &&
      amount === undefined &&
      date === undefined &&
      note === undefined &&
      goalId === undefined
    ) {
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
    if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      res.status(400).json({ error: 'date inválida (use YYYY-MM-DD)' });
      return;
    }
    if (note !== undefined && typeof note !== 'string') {
      res.status(400).json({ error: 'note deve ser texto' });
      return;
    }
    if (
      goalId !== undefined &&
      goalId !== null &&
      (typeof goalId !== 'number' || !Number.isInteger(goalId) || goalId <= 0)
    ) {
      res.status(400).json({ error: 'goalId deve ser o id inteiro de uma meta' });
      return;
    }

    const existing = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lançamento de poupança não encontrado' });
      return;
    }
    const current = existing.rows[0] as unknown as SavingsEntry;

    // Estado resultante do PATCH: campo ausente = valor atual preservado.
    const effectiveType: SavingsEntryType = type ?? current.type;
    const effectiveGoalId: number | null =
      goalId !== undefined ? goalId : (current.goal_id ?? null);

    if (effectiveGoalId !== null && effectiveType === 'YIELD') {
      res.status(400).json({
        error: 'Lançamentos de rendimento (YIELD) não podem ser vinculados a metas',
      });
      return;
    }
    // Só valida posse quando o vínculo muda de fato — revalidar o vínculo já
    // gravado seria uma query extra sem ganho (a meta já foi validada quando
    // o vínculo foi criado, e o DELETE de meta desvincula).
    if (goalId !== undefined && goalId !== null && goalId !== current.goal_id) {
      const goal = await db.execute({
        sql: 'SELECT id FROM goals WHERE id = ? AND user_id = ?',
        args: [goalId, userId],
      });
      if (goal.rows.length === 0) {
        res.status(404).json({ error: 'Meta não encontrada' });
        return;
      }
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
    if (goalId !== undefined) {
      fields.push('goal_id = ?');
      args.push(goalId);
    }
    args.push(id);

    await db.execute({
      sql: `UPDATE savings_entries SET ${fields.join(', ')} WHERE id = ?`,
      args,
    });

    const row = await db.execute({
      sql: 'SELECT * FROM savings_entries WHERE id = ?',
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
