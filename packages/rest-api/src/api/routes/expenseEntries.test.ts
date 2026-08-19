import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

// Unique on-disk temp DB per test file. Static `import` declarations are
// hoisted above other statements, so setting DATABASE_URL before a static
// `import '../../db'` would NOT take effect in time — '../../db' captures the URL
// at module-eval time. Route/db modules are therefore imported dynamically
// inside beforeAll, after the env var is set.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-expense-entries-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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
}

describe('expense entries routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let currentMonth: (now?: Date) => string;
  let shiftMonthKey: (monthKey: string, delta: number) => string;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const entriesModule = await import('./expenseEntries');
    const { errorHandler } = await import('../middleware/errorHandler');

    currentMonth = entriesModule.currentMonth;
    shiftMonthKey = entriesModule.shiftMonthKey;

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
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA
      .post('/api/auth/register')
      .send({ email: 'expense-entries-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'expense-entries-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/expense-entries');
    expect(res.status).toBe(401);
  });

  it('creates an expense entry', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Mercado', category: 'Alimentação', amount: 234.5, date: '2026-07-10' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description: 'Mercado',
      category: 'alimentação',
      amount: 234.5,
      date: '2026-07-10',
    });
  });

  it('stores the category in canonical form — case and spaces normalized (T-028)', async () => {
    const res = await agentA.post('/api/expense-entries').send({
      description: 'Feira',
      category: '  ALIMENTAÇÃO   Semanal ',
      amount: 80,
      date: '2026-07-12',
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('alimentação semanal');
  });

  it('defaults category to empty string when omitted', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Sem categoria', amount: 12, date: '2026-07-11' });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('');
  });

  it('rejects empty description (400)', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .send({ description: '   ', amount: 10, date: '2026-07-01' });
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric amount (400)', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 'muito', date: '2026-07-01' });
    expect(res.status).toBe(400);
  });

  it('rejects amount <= 0 (400)', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 0, date: '2026-07-01' });
    expect(res.status).toBe(400);
  });

  it('rejects non-finite amount (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .set('Content-Type', 'application/json')
      .send('{"description":"Padaria","amount":1e999,"date":"2026-07-01"}');
    expect(res.status).toBe(400);
  });

  it('rejects non-finite amount (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .set('Content-Type', 'application/json')
      .send('{"description":"Padaria","amount":-1e999,"date":"2026-07-01"}');
    expect(res.status).toBe(400);
  });

  it('rejects amount with more than 2 decimal places (400) (T-052)', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 0.125, date: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2 casas decimais/);
  });

  it('rejects missing or malformed date (400)', async () => {
    const missing = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 10 });
    expect(missing.status).toBe(400);

    const malformed = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 10, date: '10/07/2026' });
    expect(malformed.status).toBe(400);
  });

  // T-043: formato válido mas dia/mês inexistente no calendário.
  it('rejects a nonexistent calendar date (2026-02-30) (400)', async () => {
    const res = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Padaria', amount: 10, date: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('rejects malformed month filter (400)', async () => {
    const res = await agentA.get('/api/expense-entries?month=2026-13');
    expect(res.status).toBe(400);

    const junk = await agentA.get('/api/expense-entries?month=julho');
    expect(junk.status).toBe(400);
  });

  it('filters entries by month — a June entry does not show up in July', async () => {
    await agentA
      .post('/api/expense-entries')
      .send({ description: 'Gasto de junho', category: 'Lazer', amount: 99, date: '2026-06-20' });

    const july = await agentA.get('/api/expense-entries?month=2026-07');
    expect(july.status).toBe(200);
    expect(july.body.month).toBe('2026-07');
    const julyDescriptions = (july.body.entries as EntryBody[]).map((e) => e.description);
    expect(julyDescriptions).toContain('Mercado');
    expect(julyDescriptions).not.toContain('Gasto de junho');

    const june = await agentA.get('/api/expense-entries?month=2026-06');
    expect(june.status).toBe(200);
    const juneDescriptions = (june.body.entries as EntryBody[]).map((e) => e.description);
    expect(juneDescriptions).toContain('Gasto de junho');
    expect(juneDescriptions).not.toContain('Mercado');
  });

  it('defaults to the current month when month is omitted', async () => {
    const month = currentMonth();
    const created = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Gasto do mês corrente', amount: 7, date: `${month}-05` });
    expect(created.status).toBe(201);

    const res = await agentA.get('/api/expense-entries');
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(month);
    expect((res.body.entries as EntryBody[]).map((e) => e.description)).toContain(
      'Gasto do mês corrente'
    );
  });

  it('computes currentMonth in local time, zero-padded', () => {
    expect(currentMonth(new Date(2026, 0, 31, 23, 30))).toBe('2026-01');
    expect(currentMonth(new Date(2026, 11, 1, 0, 0))).toBe('2026-12');
  });

  it('returns entries ordered by date descending', async () => {
    const res = await agentA.get('/api/expense-entries?month=2026-07');
    const dates = (res.body.entries as EntryBody[]).map((e) => e.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it('lists only the requesting user entries', async () => {
    await agentB
      .post('/api/expense-entries')
      .send({ description: 'Gasto da B', amount: 50, date: '2026-07-15' });

    const resA = await agentA.get('/api/expense-entries?month=2026-07');
    expect((resA.body.entries as EntryBody[]).some((e) => e.description === 'Gasto da B')).toBe(
      false
    );

    const resB = await agentB.get('/api/expense-entries?month=2026-07');
    expect((resB.body.entries as EntryBody[]).some((e) => e.description === 'Gasto da B')).toBe(
      true
    );
  });

  // ── T-031: edição parcial ──────────────────────────────────────────────────
  describe('PATCH /api/expense-entries/:id (T-031)', () => {
    async function newEntry(description = 'Editável', amount = 100, date = '2026-08-10') {
      const created = await agentA
        .post('/api/expense-entries')
        .send({ description, category: 'casa', amount, date });
      return created.body.id as number;
    }

    it('updates description only', async () => {
      const id = await newEntry('Mercadinho', 55, '2026-08-01');
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ description: 'Mercado' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        description: 'Mercado',
        category: 'casa',
        amount: 55,
        date: '2026-08-01',
      });
    });

    it('updates amount only and it reflects in the month listing', async () => {
      const id = await newEntry('Farmácia', 30, '2026-08-02');
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ amount: 47.35 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(47.35);

      const list = await agentA.get('/api/expense-entries?month=2026-08');
      expect((list.body.entries as EntryBody[]).find((e) => e.id === id)?.amount).toBe(47.35);
    });

    it('normalizes the updated category (T-028)', async () => {
      const id = await newEntry('Uber', 20, '2026-08-03');
      const res = await agentA
        .patch(`/api/expense-entries/${id}`)
        .send({ category: '  TRANSPORTE   Urbano ' });
      expect(res.status).toBe(200);
      expect(res.body.category).toBe('transporte urbano');
    });

    it('moves the entry to another month when the date changes', async () => {
      const id = await newEntry('Muda de mês', 12, '2026-08-04');

      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ date: '2026-09-04' });
      expect(res.status).toBe(200);
      expect(res.body.date).toBe('2026-09-04');

      const august = await agentA.get('/api/expense-entries?month=2026-08');
      expect((august.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(false);

      const september = await agentA.get('/api/expense-entries?month=2026-09');
      expect((september.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(true);
    });

    it('rejects PATCH with empty body (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({});
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with blank description (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ description: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with amount <= 0 (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ amount: 0 });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with non-finite amount (Infinity) (400)', async () => {
      const id = await newEntry();
      const res = await agentA
        .patch(`/api/expense-entries/${id}`)
        .set('Content-Type', 'application/json')
        .send('{"amount":1e999}');
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with amount with more than 2 decimal places (400) (T-052)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ amount: 1.005 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/2 casas decimais/);
    });

    it('rejects PATCH with malformed date (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ date: '10/08/2026' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with a nonexistent calendar date (2026-13-01) (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ date: '2026-13-01' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when patching another user entry', async () => {
      const created = await agentB
        .post('/api/expense-entries')
        .send({ description: 'Da B patch', amount: 20, date: '2026-08-05' });
      const id = created.body.id;

      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ amount: 1 });
      expect(res.status).toBe(404);

      const list = await agentB.get('/api/expense-entries?month=2026-08');
      expect((list.body.entries as EntryBody[]).find((e) => e.id === id)?.amount).toBe(20);
    });

    it('returns 404 for a nonexistent id', async () => {
      const res = await agentA.patch('/api/expense-entries/999999').send({ amount: 1 });
      expect(res.status).toBe(404);
    });
  });

  it('deletes an entry belonging to the user', async () => {
    const created = await agentA
      .post('/api/expense-entries')
      .send({ description: 'Para excluir', amount: 10, date: '2026-07-02' });
    const id = created.body.id;

    const del = await agentA.delete(`/api/expense-entries/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/expense-entries?month=2026-07');
    expect((list.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user entry', async () => {
    const created = await agentB
      .post('/api/expense-entries')
      .send({ description: 'Da B protegida', amount: 20, date: '2026-07-03' });
    const id = created.body.id;

    const del = await agentA.delete(`/api/expense-entries/${id}`);
    expect(del.status).toBe(404);

    const stillThere = await agentB.get('/api/expense-entries?month=2026-07');
    expect((stillThere.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(true);
  });

  // ── T-033: GET /api/expense-entries/summary ────────────────────────────────
  describe('GET /api/expense-entries/summary (T-033)', () => {
    interface SummaryItem {
      month: string;
      total: number;
    }

    it('returns 401 without session', async () => {
      const res = await request(app).get('/api/expense-entries/summary');
      expect(res.status).toBe(401);
    });

    it('aggregates entries across 3 distinct months for the requesting user', async () => {
      const agentC = request.agent(app);
      await agentC
        .post('/api/auth/register')
        .send({ email: 'expense-entries-summary-c@test.com', password: 'password123' });

      const month = currentMonth();
      const prev1 = shiftMonthKey(month, -1);
      const prev2 = shiftMonthKey(month, -2);

      await agentC
        .post('/api/expense-entries')
        .send({ description: 'A', amount: 100, date: `${month}-05` });
      await agentC
        .post('/api/expense-entries')
        .send({ description: 'B', amount: 50, date: `${month}-10` });
      await agentC
        .post('/api/expense-entries')
        .send({ description: 'C', amount: 30, date: `${prev1}-15` });
      await agentC
        .post('/api/expense-entries')
        .send({ description: 'D', amount: 20, date: `${prev2}-01` });

      const res = await agentC.get('/api/expense-entries/summary?months=3');
      expect(res.status).toBe(200);
      const byMonth = new Map((res.body.months as SummaryItem[]).map((m) => [m.month, m.total]));
      expect(byMonth.get(month)).toBe(150);
      expect(byMonth.get(prev1)).toBe(30);
      expect(byMonth.get(prev2)).toBe(20);
      // Ordenado ascendente por mês.
      expect((res.body.months as SummaryItem[]).map((m) => m.month)).toEqual([prev2, prev1, month]);
    });

    it('omits months with no entries and excludes months outside the range', async () => {
      const agentD = request.agent(app);
      await agentD
        .post('/api/auth/register')
        .send({ email: 'expense-entries-summary-d@test.com', password: 'password123' });

      const month = currentMonth();
      const farBack = shiftMonthKey(month, -10);
      await agentD
        .post('/api/expense-entries')
        .send({ description: 'Fora do range', amount: 999, date: `${farBack}-01` });

      const res = await agentD.get('/api/expense-entries/summary?months=3');
      expect(res.status).toBe(200);
      expect(res.body.months).toEqual([]);
    });

    it('is isolated per user', async () => {
      const agentF = request.agent(app);
      const agentG = request.agent(app);
      await agentF
        .post('/api/auth/register')
        .send({ email: 'expense-entries-summary-f@test.com', password: 'password123' });
      await agentG
        .post('/api/auth/register')
        .send({ email: 'expense-entries-summary-g@test.com', password: 'password123' });

      const month = currentMonth();
      await agentF
        .post('/api/expense-entries')
        .send({ description: 'Só da F', amount: 321, date: `${month}-05` });

      const resF = await agentF.get('/api/expense-entries/summary?months=1');
      const resG = await agentG.get('/api/expense-entries/summary?months=1');
      expect(resF.status).toBe(200);
      expect(resG.status).toBe(200);

      const byMonthF = new Map((resF.body.months as SummaryItem[]).map((m) => [m.month, m.total]));
      const byMonthG = new Map((resG.body.months as SummaryItem[]).map((m) => [m.month, m.total]));
      expect(byMonthF.get(month)).toBe(321);
      expect(byMonthG.has(month)).toBe(false);
    });

    it('defaults to 6 months when months is omitted', async () => {
      const agentE = request.agent(app);
      await agentE
        .post('/api/auth/register')
        .send({ email: 'expense-entries-summary-e@test.com', password: 'password123' });

      const month = currentMonth();
      const sixthMonthBack = shiftMonthKey(month, -5);
      const seventhMonthBack = shiftMonthKey(month, -6);
      await agentE
        .post('/api/expense-entries')
        .send({ description: 'Dentro do default', amount: 10, date: `${sixthMonthBack}-01` });
      await agentE
        .post('/api/expense-entries')
        .send({ description: 'Fora do default', amount: 20, date: `${seventhMonthBack}-01` });

      const res = await agentE.get('/api/expense-entries/summary');
      expect(res.status).toBe(200);
      const months = (res.body.months as SummaryItem[]).map((m) => m.month);
      expect(months).toContain(sixthMonthBack);
      expect(months).not.toContain(seventhMonthBack);
    });

    it('rejects months = 0 (400)', async () => {
      const res = await agentA.get('/api/expense-entries/summary?months=0');
      expect(res.status).toBe(400);
    });

    it('rejects negative months (400)', async () => {
      const res = await agentA.get('/api/expense-entries/summary?months=-1');
      expect(res.status).toBe(400);
    });

    it('rejects non-numeric months (400)', async () => {
      const res = await agentA.get('/api/expense-entries/summary?months=abc');
      expect(res.status).toBe(400);
    });

    it('rejects months > 24 (400)', async () => {
      const res = await agentA.get('/api/expense-entries/summary?months=25');
      expect(res.status).toBe(400);
    });

    it('accepts months = 24', async () => {
      const res = await agentA.get('/api/expense-entries/summary?months=24');
      expect(res.status).toBe(200);
    });

    // ── T-049: `endMonth` explícito ───────────────────────────────────────
    describe('endMonth (T-049)', () => {
      it('rejects a malformed endMonth (400)', async () => {
        const malformed = await agentA.get('/api/expense-entries/summary?endMonth=2026-13');
        expect(malformed.status).toBe(400);

        const junk = await agentA.get('/api/expense-entries/summary?endMonth=julho');
        expect(junk.status).toBe(400);
      });

      it('defaults endMonth to the current month when omitted', async () => {
        const agentH = request.agent(app);
        await agentH
          .post('/api/auth/register')
          .send({ email: 'expense-entries-summary-h@test.com', password: 'password123' });

        const month = currentMonth();
        await agentH
          .post('/api/expense-entries')
          .send({ description: 'Mês corrente H', amount: 42, date: `${month}-05` });

        const withDefault = await agentH.get('/api/expense-entries/summary?months=1');
        const withExplicit = await agentH.get(
          `/api/expense-entries/summary?months=1&endMonth=${month}`
        );
        expect(withDefault.status).toBe(200);
        expect(withExplicit.status).toBe(200);
        expect(withDefault.body).toEqual(withExplicit.body);
      });

      it('anchors the window on a client-provided endMonth instead of the server month', async () => {
        const agentI = request.agent(app);
        await agentI
          .post('/api/auth/register')
          .send({ email: 'expense-entries-summary-i@test.com', password: 'password123' });

        const month = currentMonth();
        const prevMonth = shiftMonthKey(month, -1);
        await agentI
          .post('/api/expense-entries')
          .send({ description: 'Mês anterior I', amount: 77, date: `${prevMonth}-05` });
        await agentI
          .post('/api/expense-entries')
          .send({ description: 'Mês corrente I', amount: 33, date: `${month}-05` });

        // Pedindo a janela de 1 mês terminando no mês ANTERIOR, o mês corrente
        // não deve aparecer — a janela é ancorada em `endMonth`, não no mês
        // corrente do server.
        const res = await agentI.get(`/api/expense-entries/summary?months=1&endMonth=${prevMonth}`);
        expect(res.status).toBe(200);
        const months = (res.body.months as { month: string; total: number }[]).map((m) => m.month);
        expect(months).toEqual([prevMonth]);
        expect(months).not.toContain(month);
      });

      it('does not materialize a recurring occurrence beyond the horizon for a future endMonth', async () => {
        const agentJ = request.agent(app);
        await agentJ
          .post('/api/auth/register')
          .send({ email: 'expense-entries-summary-j@test.com', password: 'password123' });

        const month = currentMonth();
        // Cria uma recorrência mensal (nasce acoplada a este lançamento).
        const created = await agentJ.post('/api/expense-entries').send({
          description: 'Assinatura J',
          amount: 19.9,
          date: `${month}-05`,
          recurring: true,
        });
        expect(created.status).toBe(201);

        // Um `endMonth` muito além do horizonte de materialização não deve
        // gerar ocorrências indefinidamente à frente — mesma proteção que já
        // existia para `GET /?month=`. A janela pedida é de 1 mês terminando
        // exatamente em `farFuture`, então, se a ocorrência tivesse sido
        // materializada ali, ela apareceria na resposta.
        const farFuture = shiftMonthKey(month, 200);
        const res = await agentJ.get(`/api/expense-entries/summary?months=1&endMonth=${farFuture}`);
        expect(res.status).toBe(200);
        expect(res.body.months).toEqual([]);
      });

      it('materializes exactly the future months within the window when endMonth is future but within the horizon', async () => {
        const agentK = request.agent(app);
        await agentK
          .post('/api/auth/register')
          .send({ email: 'expense-entries-summary-k@test.com', password: 'password123' });

        const month = currentMonth();
        const created = await agentK.post('/api/expense-entries').send({
          description: 'Assinatura K',
          amount: 15,
          date: `${month}-05`,
          recurring: true,
        });
        expect(created.status).toBe(201);

        // Janela de 3 meses terminando 3 meses à frente do corrente:
        // [mês+1, mês+2, mês+3] — todos dentro do horizonte (12 meses).
        const plus1 = shiftMonthKey(month, 1);
        const plus2 = shiftMonthKey(month, 2);
        const plus3 = shiftMonthKey(month, 3);

        const res = await agentK.get(`/api/expense-entries/summary?months=3&endMonth=${plus3}`);
        expect(res.status).toBe(200);
        const byMonth = new Map(
          (res.body.months as { month: string; total: number }[]).map((m) => [m.month, m.total])
        );
        // Os 3 meses futuros da janela foram materializados com a ocorrência
        // da recorrência (nenhum mês passado/corrente é inventado, pois a
        // janela pedida não os inclui).
        expect(byMonth.get(plus1)).toBe(15);
        expect(byMonth.get(plus2)).toBe(15);
        expect(byMonth.get(plus3)).toBe(15);
        expect(byMonth.has(month)).toBe(false);
      });

      it('materializes only the months of the window up to the horizon, not beyond it', async () => {
        const agentL = request.agent(app);
        await agentL
          .post('/api/auth/register')
          .send({ email: 'expense-entries-summary-l@test.com', password: 'password123' });

        const month = currentMonth();
        const created = await agentL.post('/api/expense-entries').send({
          description: 'Assinatura L',
          amount: 25,
          date: `${month}-05`,
          recurring: true,
        });
        expect(created.status).toBe(201);

        // Janela de 3 meses terminando em mês+14: [mês+12, mês+13, mês+14].
        // O teto de horizonte é mês+12 — só esse mês da janela é
        // materializado; mês+13 e mês+14 ficam sem a ocorrência (ausentes da
        // resposta, já que não há lançamento nenhum ali).
        const plus12 = shiftMonthKey(month, 12);
        const plus13 = shiftMonthKey(month, 13);
        const plus14 = shiftMonthKey(month, 14);

        const res = await agentL.get(`/api/expense-entries/summary?months=3&endMonth=${plus14}`);
        expect(res.status).toBe(200);
        const byMonth = new Map(
          (res.body.months as { month: string; total: number }[]).map((m) => [m.month, m.total])
        );
        expect(byMonth.get(plus12)).toBe(25);
        expect(byMonth.has(plus13)).toBe(false);
        expect(byMonth.has(plus14)).toBe(false);
      });
    });
  });

  // T-084: importação idempotente por `externalId`. Usuários próprios do bloco
  // para não misturar com os lançamentos/recorrências dos testes acima.
  describe('externalId (T-084)', () => {
    let agentX: ReturnType<typeof request.agent>;
    let agentY: ReturnType<typeof request.agent>;
    let month: string;

    beforeAll(async () => {
      agentX = request.agent(app);
      agentY = request.agent(app);
      await agentX
        .post('/api/auth/register')
        .send({ email: 'expense-entries-extid-x@test.com', password: 'password123' });
      await agentY
        .post('/api/auth/register')
        .send({ email: 'expense-entries-extid-y@test.com', password: 'password123' });
      month = currentMonth();
    });

    const base = (extra: Record<string, unknown> = {}) => ({
      description: 'Importado',
      category: 'Mercado',
      amount: 100,
      date: `${month}-05`,
      ...extra,
    });

    it('POST sem externalId continua 201 e grava external_id NULL', async () => {
      const res = await agentX.post('/api/expense-entries').send(base());
      expect(res.status).toBe(201);
      expect(res.body.external_id).toBeNull();
      expect(res.body.recurring_id).toBeNull();
      // Categoria segue normalizada (T-028) mesmo no caminho do dedupe.
      expect(res.body.category).toBe('mercado');
    });

    it('POST com externalId null grava NULL (201)', async () => {
      const res = await agentX.post('/api/expense-entries').send(base({ externalId: null }));
      expect(res.status).toBe(201);
      expect(res.body.external_id).toBeNull();
    });

    it('POST com externalId novo grava o valor', async () => {
      const res = await agentX.post('/api/expense-entries').send(base({ externalId: 'ofx:EXP-1' }));
      expect(res.status).toBe(201);
      expect(res.body.external_id).toBe('ofx:EXP-1');
    });

    it('repetir o mesmo externalId responde 409 com a linha existente e não duplica', async () => {
      const first = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-DUP' }));
      expect(first.status).toBe(201);

      const second = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-DUP' }));
      expect(second.status).toBe(409);
      expect(second.body.duplicate).toBe(true);
      expect(second.body.entry.id).toBe(first.body.id);

      const list = await agentX.get(`/api/expense-entries?month=${month}`);
      const hits = (list.body.entries as EntryBody[]).filter(
        (e) => (e as unknown as { external_id: string }).external_id === 'ofx:EXP-DUP'
      );
      expect(hits).toHaveLength(1);
    });

    it('duplicata com conteúdo diferente não atualiza a linha existente', async () => {
      const first = await agentX
        .post('/api/expense-entries')
        .send(base({ description: 'Original', amount: 50, externalId: 'ofx:EXP-CONTENT' }));
      expect(first.status).toBe(201);

      const second = await agentX
        .post('/api/expense-entries')
        .send(base({ description: 'Outro', amount: 999, externalId: 'ofx:EXP-CONTENT' }));
      expect(second.status).toBe(409);
      expect(second.body.entry).toMatchObject({ description: 'Original', amount: 50 });
    });

    it('o mesmo externalId em usuários diferentes é aceito', async () => {
      const x = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-SHARED' }));
      const y = await agentY
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-SHARED' }));
      expect(x.status).toBe(201);
      expect(y.status).toBe(201);
      expect(y.body.id).not.toBe(x.body.id);
    });

    it('faz trim antes de gravar e comparar', async () => {
      const first = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: ' ofx:EXP-TRIM ' }));
      expect(first.status).toBe(201);
      expect(first.body.external_id).toBe('ofx:EXP-TRIM');

      const second = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-TRIM' }));
      expect(second.status).toBe(409);
    });

    it('recusa externalId vazio, só-espaços, não-string e acima de 255 chars', async () => {
      for (const externalId of ['', '   ', 123, 'x'.repeat(256)]) {
        const res = await agentX.post('/api/expense-entries').send(base({ externalId }));
        expect(res.status).toBe(400);
      }
    });

    it('aceita externalId com exatamente 255 chars', async () => {
      const res = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'y'.repeat(255) }));
      expect(res.status).toBe(201);
    });

    it('recusa externalId junto de recurring: true', async () => {
      const res = await agentX
        .post('/api/expense-entries')
        .send(base({ recurring: true, externalId: 'ofx:EXP-REC' }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('externalId não é aceito em lançamento recorrente');
    });

    it('recurring: true sem externalId continua funcionando', async () => {
      const agentZ = request.agent(app);
      await agentZ
        .post('/api/auth/register')
        .send({ email: 'expense-entries-extid-z@test.com', password: 'password123' });

      const res = await agentZ
        .post('/api/expense-entries')
        .send({ description: 'Assinatura Z', amount: 30, date: `${month}-05`, recurring: true });
      expect(res.status).toBe(201);
      expect(res.body.recurring_id).not.toBeNull();
      expect(res.body.external_id).toBeNull();
    });

    it('PATCH ignora externalId (e um corpo só com ele responde 400)', async () => {
      const created = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-PATCH' }));

      const onlyExternal = await agentX
        .patch(`/api/expense-entries/${created.body.id}`)
        .send({ externalId: 'ofx:OUTRO' });
      expect(onlyExternal.status).toBe(400);

      const withField = await agentX
        .patch(`/api/expense-entries/${created.body.id}`)
        .send({ description: 'Editado', externalId: 'ofx:OUTRO' });
      expect(withField.status).toBe(200);
      expect(withField.body.description).toBe('Editado');
      expect(withField.body.external_id).toBe('ofx:EXP-PATCH');
    });

    it('após DELETE o mesmo externalId pode ser reimportado', async () => {
      const first = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-REIMPORT' }));
      expect(first.status).toBe(201);

      expect((await agentX.delete(`/api/expense-entries/${first.body.id}`)).status).toBe(204);

      const again = await agentX
        .post('/api/expense-entries')
        .send(base({ externalId: 'ofx:EXP-REIMPORT' }));
      expect(again.status).toBe(201);
      expect(again.body.id).not.toBe(first.body.id);
    });
  });
});
