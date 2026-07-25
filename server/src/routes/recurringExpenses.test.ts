import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// DB temp própria por arquivo de teste; `import` estático de '../db' seria
// hoisted acima desta linha, então os módulos vêm por import dinâmico no
// beforeAll (mesmo padrão de expenseEntries.test.ts).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-recurring-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

interface EntryBody {
  id: number;
  description: string;
  category: string;
  amount: number;
  date: string;
  recurring_id: number | null;
}

interface RecurringBody {
  id: number;
  description: string;
  category: string;
  amount: number;
  day_of_month: number;
  start_month: string;
  active: number;
  ended_at: string | null;
}

describe('recurring expenses (T-035)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let nextEmail = 0;

  /** Um usuário novo por cenário — recorrências são por usuário e persistem. */
  async function freshAgent() {
    nextEmail += 1;
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: `recurring-${nextEmail}@test.com`, password: 'password123' });
    return agent;
  }

  /** Cria um lançamento marcado como recorrente e devolve a recorrência ativa. */
  async function createRecurring(
    agent: ReturnType<typeof request.agent>,
    body: Record<string, unknown>,
  ) {
    const created = await agent.post('/api/expense-entries').send({ recurring: true, ...body });
    expect(created.status).toBe(201);
    const list = await agent.get('/api/recurring-expenses');
    expect(list.status).toBe(200);
    return {
      entry: created.body as EntryBody,
      recurrence: (list.body as RecurringBody[]).find(
        (r) => r.id === (created.body as EntryBody).recurring_id,
      )!,
    };
  }

  function entriesOf(res: { body: { entries: EntryBody[] } }) {
    return res.body.entries;
  }

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { default: entriesRouter } = await import('./expenseEntries');
    const { default: recurringRouter } = await import('./recurringExpenses');
    const { errorHandler } = await import('../middleware/errorHandler');

    await initDb();

    app = express();
    app.use(express.json());
    app.use(
      session({
        name: 'sid',
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      }),
    );
    app.use('/api/auth', authRouter);
    app.use('/api/expense-entries', entriesRouter);
    app.use('/api/recurring-expenses', recurringRouter);
    app.use(errorHandler);

    agentA = await freshAgent();
    agentB = await freshAgent();
  });

  it('returns 401 on /api/recurring-expenses without session', async () => {
    const res = await request(app).get('/api/recurring-expenses');
    expect(res.status).toBe(401);
  });

  it('creates a recurrence together with the entry and links both', async () => {
    const { entry, recurrence } = await createRecurring(agentA, {
      description: 'Assinatura',
      category: 'Streaming',
      amount: 39.9,
      date: '2026-07-10',
    });

    expect(entry.recurring_id).toBe(recurrence.id);
    expect(recurrence).toMatchObject({
      description: 'Assinatura',
      // Categoria normalizada como na criação de lançamento (T-028).
      category: 'streaming',
      amount: 39.9,
      day_of_month: 10,
      start_month: '2026-07',
      active: 1,
      ended_at: null,
    });
  });

  it('does not create a recurrence for a plain entry (recurring_id null)', async () => {
    const agent = await freshAgent();
    const created = await agent
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 12, date: '2026-07-03' });
    expect(created.status).toBe(201);
    expect(created.body.recurring_id).toBe(null);

    const list = await agent.get('/api/recurring-expenses');
    expect(list.body).toEqual([]);
  });

  it('rejects non-boolean recurring and out-of-range dayOfMonth (400)', async () => {
    const badRecurring = await agentA
      .post('/api/expense-entries')
      .send({ description: 'X', amount: 10, date: '2026-07-01', recurring: 'sim' });
    expect(badRecurring.status).toBe(400);

    for (const dayOfMonth of [0, 32, 1.5, '10']) {
      const res = await agentA
        .post('/api/expense-entries')
        .send({ description: 'X', amount: 10, date: '2026-07-01', recurring: true, dayOfMonth });
      expect(res.status).toBe(400);
    }
  });

  it('uses an explicit dayOfMonth instead of the entry day', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Mensalidade',
      amount: 100,
      date: '2026-07-03',
      dayOfMonth: 20,
    });
    expect(recurrence.day_of_month).toBe(20);

    const august = await agent.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(august).find((e) => e.recurring_id === recurrence.id)?.date).toBe(
      '2026-08-20',
    );
  });

  // ── Critério de aceite: materialização idempotente ─────────────────────────
  it('materializes the next month exactly once — re-GET does not duplicate', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Academia',
      amount: 120,
      date: '2026-07-05',
    });

    const first = await agent.get('/api/expense-entries?month=2026-08');
    expect(first.status).toBe(200);
    const firstOccurrences = entriesOf(first).filter((e) => e.recurring_id === recurrence.id);
    expect(firstOccurrences).toHaveLength(1);
    expect(firstOccurrences[0]).toMatchObject({
      description: 'Academia',
      amount: 120,
      date: '2026-08-05',
    });

    const second = await agent.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(second).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
    // O id é o mesmo — não foi gerada e substituída, foi simplesmente reusada.
    expect(entriesOf(second).find((e) => e.recurring_id === recurrence.id)?.id).toBe(
      firstOccurrences[0].id,
    );
  });

  it('does not duplicate the creation month (the entry itself is the occurrence)', async () => {
    const agent = await freshAgent();
    const { entry, recurrence } = await createRecurring(agent, {
      description: 'Internet',
      amount: 99,
      date: '2026-07-08',
    });

    const july = await agent.get('/api/expense-entries?month=2026-07');
    const occurrences = entriesOf(july).filter(
      (e) => e.recurring_id === recurrence.id || e.id === entry.id,
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].id).toBe(entry.id);
  });

  it('two simultaneous GETs of the same month do not duplicate (unique key holds)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Nuvem',
      amount: 25,
      date: '2026-07-09',
    });

    const [a, b] = await Promise.all([
      agent.get('/api/expense-entries?month=2026-09'),
      agent.get('/api/expense-entries?month=2026-09'),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const after = await agent.get('/api/expense-entries?month=2026-09');
    expect(entriesOf(after).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  it('does not materialize months before the recurrence start month', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Seguro',
      amount: 80,
      date: '2026-07-15',
    });

    const june = await agent.get('/api/expense-entries?month=2026-06');
    expect(entriesOf(june).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    const may = await agent.get('/api/expense-entries?month=2026-05');
    expect(entriesOf(may)).toEqual([]);
  });

  it('materializes future months navigated ahead, one occurrence per month', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Curso',
      amount: 200,
      date: '2026-07-12',
    });

    for (const month of ['2026-08', '2026-09', '2026-10']) {
      const res = await agent.get(`/api/expense-entries?month=${month}`);
      const found = entriesOf(res).filter((e) => e.recurring_id === recurrence.id);
      expect(found).toHaveLength(1);
      expect(found[0].date).toBe(`${month}-12`);
    }
  });

  // ── Critério de aceite: dia 31 em fevereiro ────────────────────────────────
  it('clamps day 31 to the last day of february (and of 30-day months)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Fatura',
      amount: 300,
      date: '2026-01-31',
    });
    expect(recurrence.day_of_month).toBe(31);

    const february = await agent.get('/api/expense-entries?month=2026-02');
    expect(entriesOf(february).find((e) => e.recurring_id === recurrence.id)?.date).toBe(
      '2026-02-28',
    );

    const april = await agent.get('/api/expense-entries?month=2026-04');
    expect(entriesOf(april).find((e) => e.recurring_id === recurrence.id)?.date).toBe(
      '2026-04-30',
    );

    const leapFebruary = await agent.get('/api/expense-entries?month=2028-02');
    expect(entriesOf(leapFebruary).find((e) => e.recurring_id === recurrence.id)?.date).toBe(
      '2028-02-29',
    );
  });

  // ── Critério de aceite: excluir ocorrência não recria ──────────────────────
  it('deleting a materialized occurrence does not recreate it on re-GET', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Revista',
      amount: 30,
      date: '2026-07-04',
    });

    const august = await agent.get('/api/expense-entries?month=2026-08');
    const occurrence = entriesOf(august).find((e) => e.recurring_id === recurrence.id)!;
    expect(occurrence).toBeDefined();

    const del = await agent.delete(`/api/expense-entries/${occurrence.id}`);
    expect(del.status).toBe(204);

    const again = await agent.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(again).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    // Nem num terceiro GET, nem via /summary (que também materializa).
    await agent.get('/api/expense-entries/summary?months=6');
    const third = await agent.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(third).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);
  });

  it('an occurrence can be edited individually without affecting other months', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Luz',
      amount: 150,
      date: '2026-07-06',
    });

    const august = await agent.get('/api/expense-entries?month=2026-08');
    const occurrence = entriesOf(august).find((e) => e.recurring_id === recurrence.id)!;

    const patched = await agent
      .patch(`/api/expense-entries/${occurrence.id}`)
      .send({ amount: 175.5 });
    expect(patched.status).toBe(200);
    expect(patched.body.amount).toBe(175.5);
    // Continua sendo uma ocorrência da recorrência (o vínculo não é perdido).
    expect(patched.body.recurring_id).toBe(recurrence.id);

    const september = await agent.get('/api/expense-entries?month=2026-09');
    expect(entriesOf(september).find((e) => e.recurring_id === recurrence.id)?.amount).toBe(150);
  });

  // ── Critério de aceite: encerrar ───────────────────────────────────────────
  it('ending a recurrence stops generating and keeps what was materialized', async () => {
    const agent = await freshAgent();
    const { entry, recurrence } = await createRecurring(agent, {
      description: 'Podcast',
      amount: 20,
      date: '2026-07-07',
    });

    const august = await agent.get('/api/expense-entries?month=2026-08');
    const augustOccurrence = entriesOf(august).find((e) => e.recurring_id === recurrence.id)!;
    expect(augustOccurrence).toBeDefined();

    const ended = await agent.patch(`/api/recurring-expenses/${recurrence.id}`).send({
      active: false,
    });
    expect(ended.status).toBe(200);
    expect(ended.body.active).toBe(0);
    expect(ended.body.ended_at).not.toBe(null);

    // Não gera mais nada — nem no mês seguinte nunca visitado.
    const september = await agent.get('/api/expense-entries?month=2026-09');
    expect(entriesOf(september).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    // As já materializadas ficam (a de agosto e o lançamento original de julho).
    const augustAgain = await agent.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(augustAgain).some((e) => e.id === augustOccurrence.id)).toBe(true);
    const julyAgain = await agent.get('/api/expense-entries?month=2026-07');
    expect(entriesOf(julyAgain).some((e) => e.id === entry.id)).toBe(true);

    // E sai da lista de recorrências ativas.
    const list = await agent.get('/api/recurring-expenses');
    expect((list.body as RecurringBody[]).some((r) => r.id === recurrence.id)).toBe(false);
  });

  it('ending also stops generating past months never visited', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Doação',
      amount: 50,
      date: '2026-03-02',
    });

    const ended = await agent.delete(`/api/recurring-expenses/${recurrence.id}`);
    expect(ended.status).toBe(204);

    const april = await agent.get('/api/expense-entries?month=2026-04');
    expect(entriesOf(april).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);
  });

  it('ending twice is idempotent', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Jornal',
      amount: 15,
      date: '2026-07-11',
    });

    const first = await agent.delete(`/api/recurring-expenses/${recurrence.id}`);
    expect(first.status).toBe(204);
    const second = await agent.delete(`/api/recurring-expenses/${recurrence.id}`);
    expect(second.status).toBe(204);
    const patch = await agent
      .patch(`/api/recurring-expenses/${recurrence.id}`)
      .send({ active: false });
    expect(patch.status).toBe(200);
  });

  it('rejects reactivation and malformed PATCH bodies (400)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Clube',
      amount: 60,
      date: '2026-07-13',
    });

    const empty = await agent.patch(`/api/recurring-expenses/${recurrence.id}`).send({});
    expect(empty.status).toBe(400);

    const notBoolean = await agent
      .patch(`/api/recurring-expenses/${recurrence.id}`)
      .send({ active: 'false' });
    expect(notBoolean.status).toBe(400);

    const reactivate = await agent
      .patch(`/api/recurring-expenses/${recurrence.id}`)
      .send({ active: true });
    expect(reactivate.status).toBe(400);
  });

  it('returns 404 for a nonexistent recurrence', async () => {
    const patch = await agentA.patch('/api/recurring-expenses/999999').send({ active: false });
    expect(patch.status).toBe(404);
    const del = await agentA.delete('/api/recurring-expenses/999999');
    expect(del.status).toBe(404);
  });

  // ── Isolamento por usuário ────────────────────────────────────────────────
  it('is isolated per user: listing, ending and materialization', async () => {
    const { recurrence } = await createRecurring(agentB, {
      description: 'Só da B',
      amount: 45,
      date: '2026-07-14',
    });

    // A não vê a recorrência de B…
    const listA = await agentA.get('/api/recurring-expenses');
    expect((listA.body as RecurringBody[]).some((r) => r.id === recurrence.id)).toBe(false);

    // …não consegue encerrá-la…
    const patchA = await agentA
      .patch(`/api/recurring-expenses/${recurrence.id}`)
      .send({ active: false });
    expect(patchA.status).toBe(404);
    const delA = await agentA.delete(`/api/recurring-expenses/${recurrence.id}`);
    expect(delA.status).toBe(404);

    // …e o GET de A não materializa ocorrência de B.
    const augustA = await agentA.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(augustA).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    // A recorrência de B segue ativa e materializa no GET de B.
    const listB = await agentB.get('/api/recurring-expenses');
    expect((listB.body as RecurringBody[]).some((r) => r.id === recurrence.id)).toBe(true);
    const augustB = await agentB.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(augustB).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  // ── /summary também materializa ───────────────────────────────────────────
  it('/summary materializes the months of its window, without duplicating', async () => {
    const agent = await freshAgent();
    const { currentMonth, shiftMonthKey } = await import('./expenseEntries');

    const month = currentMonth();
    const prev = shiftMonthKey(month, -1);

    // Recorrência começando no mês anterior, de 300 por mês.
    const { recurrence } = await createRecurring(agent, {
      description: 'Aluguel de sala',
      amount: 300,
      date: `${prev}-05`,
    });

    const summary = await agent.get('/api/expense-entries/summary?months=2');
    expect(summary.status).toBe(200);
    const byMonth = new Map(
      (summary.body.months as { month: string; total: number }[]).map((m) => [m.month, m.total]),
    );
    expect(byMonth.get(prev)).toBe(300);
    expect(byMonth.get(month)).toBe(300);

    // Segundo GET não duplica os totais.
    const again = await agent.get('/api/expense-entries/summary?months=2');
    const byMonthAgain = new Map(
      (again.body.months as { month: string; total: number }[]).map((m) => [m.month, m.total]),
    );
    expect(byMonthAgain.get(prev)).toBe(300);
    expect(byMonthAgain.get(month)).toBe(300);

    const currentList = await agent.get('/api/expense-entries');
    expect(
      entriesOf(currentList).filter((e) => e.recurring_id === recurrence.id),
    ).toHaveLength(1);
  });

  it('does not materialize when the month filter is invalid (400 before any write)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Ginástica',
      amount: 70,
      date: '2026-07-16',
    });

    const bad = await agent.get('/api/expense-entries?month=2026-13');
    expect(bad.status).toBe(400);

    // O mês inválido não pode ter entrado no livro-razão nem gerado nada.
    const august = await agent.get('/api/expense-entries?month=2026-08');
    expect(entriesOf(august).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });
});
