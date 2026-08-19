import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

// DB temp própria por arquivo de teste; `import` estático de '../../db' seria
// hoisted acima desta linha, então os módulos vêm por import dinâmico no
// beforeAll (mesmo padrão de expenseEntries.test.ts).
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-recurring-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// T-106: o cadastro/login destes testes passa pelo AWS Cognito. O pool falso
// abaixo intercepta o `fetch` para o endpoint do Cognito (e SÓ para ele) e
// responde `UserConfirmed: true`, mantendo `POST /api/auth/register` como a
// forma de conseguir uma sessão. Nenhum teste bate na AWS.
installFakeCognito();

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

/**
 * Último dia de um `YYYY-MM`, calculado aqui de forma independente do service
 * para as asserções de mês curto não serem tautológicas com a implementação.
 */
function lastDayOfMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

describe('recurring expenses (T-035)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let nextEmail = 0;

  // Os testes são ancorados no mês CORRENTE (e não em meses fixos como
  // 2026-07), porque o piso de materialização é o mês de criação da
  // recorrência: datas fixas passariam a ser "passado" com o tempo e mudariam
  // o comportamento esperado da suíte.
  let thisMonth: string;
  let shift: (monthKey: string, delta: number) => string;

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
    body: Record<string, unknown>
  ) {
    const created = await agent.post('/api/expense-entries').send({ recurring: true, ...body });
    expect(created.status).toBe(201);
    const list = await agent.get('/api/recurring-expenses');
    expect(list.status).toBe(200);
    return {
      entry: created.body as EntryBody,
      recurrence: (list.body as RecurringBody[]).find(
        (r) => r.id === (created.body as EntryBody).recurring_id
      )!,
    };
  }

  function entriesOf(res: { body: { entries: EntryBody[] } }) {
    return res.body.entries;
  }

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const entriesModule = await import('./expenseEntries');
    const { default: recurringRouter } = await import('./recurringExpenses');
    const { errorHandler } = await import('../middleware/errorHandler');

    thisMonth = entriesModule.currentMonth();
    shift = entriesModule.shiftMonthKey;

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
      })
    );
    app.use('/api/auth', authRouter);
    app.use('/api/expense-entries', entriesModule.default);
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
      date: `${thisMonth}-10`,
    });

    expect(entry.recurring_id).toBe(recurrence.id);
    expect(recurrence).toMatchObject({
      description: 'Assinatura',
      // Categoria normalizada como na criação de lançamento (T-028).
      category: 'streaming',
      amount: 39.9,
      day_of_month: 10,
      start_month: thisMonth,
      active: 1,
      ended_at: null,
    });
  });

  it('does not create a recurrence for a plain entry (recurring_id null)', async () => {
    const agent = await freshAgent();
    const created = await agent
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 12, date: `${thisMonth}-03` });
    expect(created.status).toBe(201);
    expect(created.body.recurring_id).toBe(null);

    const list = await agent.get('/api/recurring-expenses');
    expect(list.body).toEqual([]);
  });

  it('rejects non-boolean recurring and out-of-range dayOfMonth (400)', async () => {
    const badRecurring = await agentA
      .post('/api/expense-entries')
      .send({ description: 'X', amount: 10, date: `${thisMonth}-01`, recurring: 'sim' });
    expect(badRecurring.status).toBe(400);

    for (const dayOfMonth of [0, 32, 1.5, '10']) {
      const res = await agentA.post('/api/expense-entries').send({
        description: 'X',
        amount: 10,
        date: `${thisMonth}-01`,
        recurring: true,
        dayOfMonth,
      });
      expect(res.status).toBe(400);
    }
  });

  it('uses an explicit dayOfMonth instead of the entry day', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Mensalidade',
      amount: 100,
      date: `${thisMonth}-03`,
      dayOfMonth: 20,
    });
    expect(recurrence.day_of_month).toBe(20);

    const next = shift(thisMonth, 1);
    const nextRes = await agent.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(nextRes).find((e) => e.recurring_id === recurrence.id)?.date).toBe(
      `${next}-20`
    );
  });

  // ── Critério de aceite: materialização idempotente ─────────────────────────
  it('materializes the next month exactly once — re-GET does not duplicate', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Academia',
      amount: 120,
      date: `${thisMonth}-05`,
    });

    const next = shift(thisMonth, 1);
    const first = await agent.get(`/api/expense-entries?month=${next}`);
    expect(first.status).toBe(200);
    const firstOccurrences = entriesOf(first).filter((e) => e.recurring_id === recurrence.id);
    expect(firstOccurrences).toHaveLength(1);
    expect(firstOccurrences[0]).toMatchObject({
      description: 'Academia',
      amount: 120,
      date: `${next}-05`,
    });

    const second = await agent.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(second).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
    // O id é o mesmo — não foi gerada e substituída, foi simplesmente reusada.
    expect(entriesOf(second).find((e) => e.recurring_id === recurrence.id)?.id).toBe(
      firstOccurrences[0].id
    );
  });

  it('does not duplicate the creation month (the entry itself is the occurrence)', async () => {
    const agent = await freshAgent();
    const { entry, recurrence } = await createRecurring(agent, {
      description: 'Internet',
      amount: 99,
      date: `${thisMonth}-08`,
    });

    const current = await agent.get(`/api/expense-entries?month=${thisMonth}`);
    const occurrences = entriesOf(current).filter(
      (e) => e.recurring_id === recurrence.id || e.id === entry.id
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].id).toBe(entry.id);
  });

  it('two simultaneous GETs of the same month do not duplicate (unique key holds)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Nuvem',
      amount: 25,
      date: `${thisMonth}-09`,
    });

    const target = shift(thisMonth, 2);
    const [a, b] = await Promise.all([
      agent.get(`/api/expense-entries?month=${target}`),
      agent.get(`/api/expense-entries?month=${target}`),
    ]);
    // Um 500 aqui significaria que a violação da chave única escapou do
    // tratamento de corrida em vez de virar "outro já gerou".
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const after = await agent.get(`/api/expense-entries?month=${target}`);
    expect(entriesOf(after).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  // ── Critério de aceite: nada antes da criação ──────────────────────────────
  it('does not materialize months before the recurrence start month', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Seguro',
      amount: 80,
      date: `${thisMonth}-15`,
    });

    const prev = shift(thisMonth, -1);
    const prevRes = await agent.get(`/api/expense-entries?month=${prev}`);
    expect(entriesOf(prevRes).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    const older = await agent.get(`/api/expense-entries?month=${shift(thisMonth, -2)}`);
    expect(entriesOf(older)).toEqual([]);
  });

  it('a recurrence created from a PAST entry does not backfill the months in between', async () => {
    const agent = await freshAgent();
    const pastMonth = shift(thisMonth, -4);

    const { entry, recurrence } = await createRecurring(agent, {
      description: 'Retroativa',
      amount: 500,
      date: `${pastMonth}-01`,
    });

    // O piso é o mês de CRIAÇÃO, não o mês do lançamento.
    expect(recurrence.start_month).toBe(thisMonth);

    // Nenhum dos meses fechados entre o lançamento e hoje ganha ocorrência…
    for (let delta = -4; delta <= -1; delta += 1) {
      const month = shift(thisMonth, delta);
      const res = await agent.get(`/api/expense-entries?month=${month}`);
      const generated = entriesOf(res).filter(
        (e) => e.recurring_id === recurrence.id && e.id !== entry.id
      );
      expect(generated).toHaveLength(0);
    }

    // …nem via /summary, que também materializa a janela que agrega.
    const summary = await agent.get('/api/expense-entries/summary?months=6');
    expect(summary.status).toBe(200);
    const byMonth = new Map(
      (summary.body.months as { month: string; total: number }[]).map((m) => [m.month, m.total])
    );
    // Só o mês do lançamento original (500) e o mês corrente (a 1ª ocorrência).
    expect(byMonth.get(pastMonth)).toBe(500);
    for (let delta = -3; delta <= -1; delta += 1) {
      expect(byMonth.has(shift(thisMonth, delta))).toBe(false);
    }

    // A partir do mês corrente, sim: é aí que a recorrência começa.
    const current = await agent.get(`/api/expense-entries?month=${thisMonth}`);
    expect(entriesOf(current).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
    const next = shift(thisMonth, 1);
    const nextRes = await agent.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(nextRes).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  it('a recurrence created from a FUTURE entry starts on that future month', async () => {
    const agent = await freshAgent();
    const futureMonth = shift(thisMonth, 3);

    const { entry, recurrence } = await createRecurring(agent, {
      description: 'Futura',
      amount: 60,
      date: `${futureMonth}-07`,
    });
    expect(recurrence.start_month).toBe(futureMonth);

    // Mês corrente e os dois meses entre hoje e o início não geram nada.
    for (let delta = 0; delta <= 2; delta += 1) {
      const res = await agent.get(`/api/expense-entries?month=${shift(thisMonth, delta)}`);
      expect(entriesOf(res).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);
    }

    // O mês de início já tem o próprio lançamento, sem duplicar.
    const start = await agent.get(`/api/expense-entries?month=${futureMonth}`);
    const atStart = entriesOf(start).filter((e) => e.recurring_id === recurrence.id);
    expect(atStart).toHaveLength(1);
    expect(atStart[0].id).toBe(entry.id);

    // E o mês seguinte ao início materializa normalmente.
    const after = shift(futureMonth, 1);
    const afterRes = await agent.get(`/api/expense-entries?month=${after}`);
    expect(entriesOf(afterRes).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  it('materializes future months navigated ahead, one occurrence per month', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Curso',
      amount: 200,
      date: `${thisMonth}-12`,
    });

    for (const delta of [1, 2, 3]) {
      const month = shift(thisMonth, delta);
      const res = await agent.get(`/api/expense-entries?month=${month}`);
      const found = entriesOf(res).filter((e) => e.recurring_id === recurrence.id);
      expect(found).toHaveLength(1);
      expect(found[0].date).toBe(`${month}-12`);
    }
  });

  it('does not materialize beyond the future horizon (12 months ahead)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Horizonte',
      amount: 10,
      date: `${thisMonth}-02`,
    });

    const farFuture = await agent.get('/api/expense-entries?month=9999-12');
    expect(farFuture.status).toBe(200);
    expect(entriesOf(farFuture).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    const beyond = shift(thisMonth, 13);
    const beyondRes = await agent.get(`/api/expense-entries?month=${beyond}`);
    expect(entriesOf(beyondRes).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    // O último mês dentro do horizonte ainda gera.
    const edge = shift(thisMonth, 12);
    const edgeRes = await agent.get(`/api/expense-entries?month=${edge}`);
    expect(entriesOf(edgeRes).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  // ── Critério de aceite: dia 31 em meses curtos ─────────────────────────────
  it('clamps day 31 to the last day of every short month ahead (february included)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Fatura',
      amount: 300,
      date: `${thisMonth}-01`,
      dayOfMonth: 31,
    });
    expect(recurrence.day_of_month).toBe(31);

    // 12 meses à frente cobrem necessariamente um fevereiro e vários meses de
    // 30 dias — sem depender de datas fixas no calendário.
    const seenDays = new Set<number>();
    for (let delta = 1; delta <= 12; delta += 1) {
      const month = shift(thisMonth, delta);
      const res = await agent.get(`/api/expense-entries?month=${month}`);
      const found = entriesOf(res).filter((e) => e.recurring_id === recurrence.id);
      expect(found).toHaveLength(1);

      const expectedDay = Math.min(31, lastDayOfMonth(month));
      expect(found[0].date).toBe(`${month}-${String(expectedDay).padStart(2, '0')}`);
      // A ocorrência nunca transborda para o mês seguinte.
      expect(found[0].date.slice(0, 7)).toBe(month);
      seenDays.add(expectedDay);

      if (month.endsWith('-02')) {
        expect([28, 29]).toContain(expectedDay);
      }
    }
    // A janela realmente exercitou meses curtos, e não só meses de 31 dias.
    expect(seenDays.has(30)).toBe(true);
    expect([...seenDays].some((day) => day === 28 || day === 29)).toBe(true);
  });

  // ── Critério de aceite: excluir ocorrência não recria ──────────────────────
  it('deleting a materialized occurrence does not recreate it on re-GET', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Revista',
      amount: 30,
      date: `${thisMonth}-04`,
    });

    const next = shift(thisMonth, 1);
    const nextRes = await agent.get(`/api/expense-entries?month=${next}`);
    const occurrence = entriesOf(nextRes).find((e) => e.recurring_id === recurrence.id)!;
    expect(occurrence).toBeDefined();

    const del = await agent.delete(`/api/expense-entries/${occurrence.id}`);
    expect(del.status).toBe(204);

    const again = await agent.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(again).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    // Nem num terceiro GET, nem via /summary (que também materializa).
    await agent.get('/api/expense-entries/summary?months=6');
    const third = await agent.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(third).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);
  });

  it('an occurrence can be edited individually without affecting other months', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Luz',
      amount: 150,
      date: `${thisMonth}-06`,
    });

    const next = shift(thisMonth, 1);
    const nextRes = await agent.get(`/api/expense-entries?month=${next}`);
    const occurrence = entriesOf(nextRes).find((e) => e.recurring_id === recurrence.id)!;

    const patched = await agent
      .patch(`/api/expense-entries/${occurrence.id}`)
      .send({ amount: 175.5 });
    expect(patched.status).toBe(200);
    expect(patched.body.amount).toBe(175.5);
    // Continua sendo uma ocorrência da recorrência (o vínculo não é perdido).
    expect(patched.body.recurring_id).toBe(recurrence.id);

    const later = await agent.get(`/api/expense-entries?month=${shift(thisMonth, 2)}`);
    expect(entriesOf(later).find((e) => e.recurring_id === recurrence.id)?.amount).toBe(150);
  });

  // ── Critério de aceite: encerrar ───────────────────────────────────────────
  it('ending a recurrence stops generating and keeps what was materialized', async () => {
    const agent = await freshAgent();
    const { entry, recurrence } = await createRecurring(agent, {
      description: 'Podcast',
      amount: 20,
      date: `${thisMonth}-07`,
    });

    const next = shift(thisMonth, 1);
    const nextRes = await agent.get(`/api/expense-entries?month=${next}`);
    const nextOccurrence = entriesOf(nextRes).find((e) => e.recurring_id === recurrence.id)!;
    expect(nextOccurrence).toBeDefined();

    const ended = await agent.patch(`/api/recurring-expenses/${recurrence.id}`).send({
      active: false,
    });
    expect(ended.status).toBe(200);
    expect(ended.body.active).toBe(0);
    expect(ended.body.ended_at).not.toBe(null);

    // Não gera mais nada — nem no mês seguinte nunca visitado.
    const later = await agent.get(`/api/expense-entries?month=${shift(thisMonth, 2)}`);
    expect(entriesOf(later).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    // As já materializadas ficam (a do mês seguinte e o lançamento original).
    const nextAgain = await agent.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(nextAgain).some((e) => e.id === nextOccurrence.id)).toBe(true);
    const currentAgain = await agent.get(`/api/expense-entries?month=${thisMonth}`);
    expect(entriesOf(currentAgain).some((e) => e.id === entry.id)).toBe(true);

    // E sai da lista de recorrências ativas.
    const list = await agent.get('/api/recurring-expenses');
    expect((list.body as RecurringBody[]).some((r) => r.id === recurrence.id)).toBe(false);
  });

  it('ending twice is idempotent', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Jornal',
      amount: 15,
      date: `${thisMonth}-11`,
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
      date: `${thisMonth}-13`,
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
      date: `${thisMonth}-14`,
    });
    const next = shift(thisMonth, 1);

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
    const nextA = await agentA.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(nextA).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(0);

    // A recorrência de B segue ativa e materializa no GET de B.
    const listB = await agentB.get('/api/recurring-expenses');
    expect((listB.body as RecurringBody[]).some((r) => r.id === recurrence.id)).toBe(true);
    const nextB = await agentB.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(nextB).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  // ── /summary também materializa ───────────────────────────────────────────
  it('/summary materializes the months of its window, without duplicating', async () => {
    const agent = await freshAgent();

    // Recorrência criada no mês corrente, de 300 por mês. O mês anterior fica
    // de fora (piso = mês de criação) — a janela só ganha o mês corrente.
    const { recurrence } = await createRecurring(agent, {
      description: 'Aluguel de sala',
      amount: 300,
      date: `${thisMonth}-05`,
    });

    const summary = await agent.get('/api/expense-entries/summary?months=2');
    expect(summary.status).toBe(200);
    const byMonth = new Map(
      (summary.body.months as { month: string; total: number }[]).map((m) => [m.month, m.total])
    );
    expect(byMonth.get(thisMonth)).toBe(300);
    expect(byMonth.has(shift(thisMonth, -1))).toBe(false);

    // Segundo GET não duplica os totais.
    const again = await agent.get('/api/expense-entries/summary?months=2');
    const byMonthAgain = new Map(
      (again.body.months as { month: string; total: number }[]).map((m) => [m.month, m.total])
    );
    expect(byMonthAgain.get(thisMonth)).toBe(300);

    const currentList = await agent.get('/api/expense-entries');
    expect(entriesOf(currentList).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });

  it('does not materialize when the month filter is invalid (400 before any write)', async () => {
    const agent = await freshAgent();
    const { recurrence } = await createRecurring(agent, {
      description: 'Ginástica',
      amount: 70,
      date: `${thisMonth}-16`,
    });

    const bad = await agent.get('/api/expense-entries?month=2026-13');
    expect(bad.status).toBe(400);

    // O mês inválido não pode ter entrado no livro-razão nem gerado nada.
    const next = shift(thisMonth, 1);
    const nextRes = await agent.get(`/api/expense-entries?month=${next}`);
    expect(entriesOf(nextRes).filter((e) => e.recurring_id === recurrence.id)).toHaveLength(1);
  });
});
