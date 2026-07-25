import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Unique on-disk temp DB per test file. Static `import` declarations are
// hoisted above other statements, so setting DATABASE_URL before a static
// `import '../db'` would NOT take effect in time — '../db' captures the URL
// at module-eval time. Route/db modules are therefore imported dynamically
// inside beforeAll, after the env var is set.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-income-entries-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

interface EntryBody {
  id: number;
  description: string;
  amount: number;
  date: string;
}

describe('income entries routes (T-036)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  // Meses ancorados no mês corrente (não em datas fixas): a suíte não pode
  // depender de o calendário estar num mês específico.
  let thisMonth: string;
  let prevMonth: string;
  let nextMonth: string;
  let twoAhead: string;

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { currentMonth, shiftMonthKey } = await import('./expenseEntries');
    const { default: incomeEntriesRouter } = await import('./incomeEntries');
    const { errorHandler } = await import('../middleware/errorHandler');

    thisMonth = currentMonth();
    prevMonth = shiftMonthKey(thisMonth, -1);
    nextMonth = shiftMonthKey(thisMonth, 1);
    twoAhead = shiftMonthKey(thisMonth, 2);

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
    app.use('/api/income-entries', incomeEntriesRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA
      .post('/api/auth/register')
      .send({ email: 'income-entries-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'income-entries-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/income-entries');
    expect(res.status).toBe(401);
  });

  it('creates an income entry', async () => {
    const res = await agentA
      .post('/api/income-entries')
      .send({ description: 'Freela site', amount: 1250.5, date: `${thisMonth}-10` });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description: 'Freela site',
      amount: 1250.5,
      date: `${thisMonth}-10`,
    });
  });

  it('trims the description on creation', async () => {
    const res = await agentA
      .post('/api/income-entries')
      .send({ description: '  Venda de bike  ', amount: 400, date: `${thisMonth}-11` });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe('Venda de bike');
  });

  it('rejects empty description (400)', async () => {
    const res = await agentA
      .post('/api/income-entries')
      .send({ description: '   ', amount: 10, date: `${thisMonth}-01` });
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric amount (400)', async () => {
    const res = await agentA
      .post('/api/income-entries')
      .send({ description: 'Bônus', amount: 'muito', date: `${thisMonth}-01` });
    expect(res.status).toBe(400);
  });

  it('rejects amount <= 0 (400)', async () => {
    const zero = await agentA
      .post('/api/income-entries')
      .send({ description: 'Bônus', amount: 0, date: `${thisMonth}-01` });
    expect(zero.status).toBe(400);

    const negative = await agentA
      .post('/api/income-entries')
      .send({ description: 'Bônus', amount: -30, date: `${thisMonth}-01` });
    expect(negative.status).toBe(400);
  });

  it('rejects non-finite amount (1e999 → Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/income-entries')
      .set('Content-Type', 'application/json')
      .send(`{"description":"Bônus","amount":1e999,"date":"${thisMonth}-01"}`);
    expect(res.status).toBe(400);
  });

  it('rejects non-finite amount (-1e999 → -Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/income-entries')
      .set('Content-Type', 'application/json')
      .send(`{"description":"Bônus","amount":-1e999,"date":"${thisMonth}-01"}`);
    expect(res.status).toBe(400);
  });

  it('rejects missing or malformed date (400)', async () => {
    const missing = await agentA
      .post('/api/income-entries')
      .send({ description: 'Bônus', amount: 10 });
    expect(missing.status).toBe(400);

    const malformed = await agentA
      .post('/api/income-entries')
      .send({ description: 'Bônus', amount: 10, date: '10/07/2026' });
    expect(malformed.status).toBe(400);
  });

  // T-043: formato válido mas dia/mês inexistente no calendário.
  it('rejects a nonexistent calendar date (2026-02-30) (400)', async () => {
    const res = await agentA
      .post('/api/income-entries')
      .send({ description: 'Bônus', amount: 10, date: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('rejects malformed month filter (400)', async () => {
    const badMonth = await agentA.get('/api/income-entries?month=2026-13');
    expect(badMonth.status).toBe(400);

    const junk = await agentA.get('/api/income-entries?month=julho');
    expect(junk.status).toBe(400);

    // `?month=a&month=b` chega como array — não é string e também é rejeitado.
    const repeated = await agentA.get(
      `/api/income-entries?month=${thisMonth}&month=${prevMonth}`,
    );
    expect(repeated.status).toBe(400);
  });

  it('filters entries by month — uma renda do mês anterior não aparece no mês corrente', async () => {
    await agentA
      .post('/api/income-entries')
      .send({ description: 'Freela do mês passado', amount: 900, date: `${prevMonth}-20` });

    const current = await agentA.get(`/api/income-entries?month=${thisMonth}`);
    expect(current.status).toBe(200);
    expect(current.body.month).toBe(thisMonth);
    const currentDescriptions = (current.body.entries as EntryBody[]).map((e) => e.description);
    expect(currentDescriptions).toContain('Freela site');
    expect(currentDescriptions).not.toContain('Freela do mês passado');

    const previous = await agentA.get(`/api/income-entries?month=${prevMonth}`);
    expect(previous.status).toBe(200);
    const previousDescriptions = (previous.body.entries as EntryBody[]).map((e) => e.description);
    expect(previousDescriptions).toContain('Freela do mês passado');
    expect(previousDescriptions).not.toContain('Freela site');
  });

  it('defaults to the current month when month is omitted', async () => {
    const res = await agentA.get('/api/income-entries');
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(thisMonth);
    expect((res.body.entries as EntryBody[]).map((e) => e.description)).toContain('Freela site');
  });

  it('returns entries ordered by date descending', async () => {
    const res = await agentA.get(`/api/income-entries?month=${thisMonth}`);
    const dates = (res.body.entries as EntryBody[]).map((e) => e.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it('lists only the requesting user entries', async () => {
    await agentB
      .post('/api/income-entries')
      .send({ description: 'Renda da B', amount: 50, date: `${thisMonth}-15` });

    const resA = await agentA.get(`/api/income-entries?month=${thisMonth}`);
    expect((resA.body.entries as EntryBody[]).some((e) => e.description === 'Renda da B')).toBe(
      false,
    );

    const resB = await agentB.get(`/api/income-entries?month=${thisMonth}`);
    expect((resB.body.entries as EntryBody[]).some((e) => e.description === 'Renda da B')).toBe(
      true,
    );
  });

  describe('PATCH /api/income-entries/:id (padrão T-031)', () => {
    async function newEntry(description = 'Editável', amount = 100, day = '10') {
      const created = await agentA
        .post('/api/income-entries')
        .send({ description, amount, date: `${nextMonth}-${day}` });
      return created.body.id as number;
    }

    it('updates description only', async () => {
      const id = await newEntry('Freela pequeno', 55, '01');
      const res = await agentA
        .patch(`/api/income-entries/${id}`)
        .send({ description: 'Freela grande' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        description: 'Freela grande',
        amount: 55,
        date: `${nextMonth}-01`,
      });
    });

    it('updates amount only and it reflects in the month listing', async () => {
      const id = await newEntry('Bônus', 30, '02');
      const res = await agentA.patch(`/api/income-entries/${id}`).send({ amount: 47.35 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(47.35);
      expect(res.body.description).toBe('Bônus');

      const list = await agentA.get(`/api/income-entries?month=${nextMonth}`);
      expect((list.body.entries as EntryBody[]).find((e) => e.id === id)?.amount).toBe(47.35);
    });

    it('moves the entry to another month when the date changes', async () => {
      const id = await newEntry('Muda de mês', 12, '04');

      const res = await agentA.patch(`/api/income-entries/${id}`).send({ date: `${twoAhead}-04` });
      expect(res.status).toBe(200);
      expect(res.body.date).toBe(`${twoAhead}-04`);

      const before = await agentA.get(`/api/income-entries?month=${nextMonth}`);
      expect((before.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(false);

      const after = await agentA.get(`/api/income-entries?month=${twoAhead}`);
      expect((after.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(true);
    });

    it('trims the updated description', async () => {
      const id = await newEntry('Com espaço', 20, '05');
      const res = await agentA
        .patch(`/api/income-entries/${id}`)
        .send({ description: '  Sem espaço  ' });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Sem espaço');
    });

    it('rejects PATCH with empty body (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/income-entries/${id}`).send({});
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with blank description (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/income-entries/${id}`).send({ description: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with amount <= 0 (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/income-entries/${id}`).send({ amount: 0 });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with non-finite amount (1e999) (400)', async () => {
      const id = await newEntry();
      const res = await agentA
        .patch(`/api/income-entries/${id}`)
        .set('Content-Type', 'application/json')
        .send('{"amount":1e999}');
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with malformed date (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/income-entries/${id}`).send({ date: '10/08/2026' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with a nonexistent calendar date (2026-13-01) (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/income-entries/${id}`).send({ date: '2026-13-01' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when patching another user entry', async () => {
      const created = await agentB
        .post('/api/income-entries')
        .send({ description: 'Da B patch', amount: 20, date: `${nextMonth}-06` });
      const id = created.body.id;

      const res = await agentA.patch(`/api/income-entries/${id}`).send({ amount: 999 });
      expect(res.status).toBe(404);

      // O lançamento da B segue intacto.
      const list = await agentB.get(`/api/income-entries?month=${nextMonth}`);
      expect((list.body.entries as EntryBody[]).find((e) => e.id === id)?.amount).toBe(20);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await agentA.patch('/api/income-entries/999999').send({ amount: 10 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/income-entries/:id', () => {
    it('deletes an entry of the requesting user', async () => {
      const created = await agentA
        .post('/api/income-entries')
        .send({ description: 'Pra apagar', amount: 33, date: `${thisMonth}-18` });
      const id = created.body.id;

      const del = await agentA.delete(`/api/income-entries/${id}`);
      expect(del.status).toBe(204);

      const list = await agentA.get(`/api/income-entries?month=${thisMonth}`);
      expect((list.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(false);
    });

    it('returns 404 when deleting another user entry, and it survives', async () => {
      const created = await agentB
        .post('/api/income-entries')
        .send({ description: 'Da B delete', amount: 44, date: `${thisMonth}-19` });
      const id = created.body.id;

      const del = await agentA.delete(`/api/income-entries/${id}`);
      expect(del.status).toBe(404);

      const list = await agentB.get(`/api/income-entries?month=${thisMonth}`);
      expect((list.body.entries as EntryBody[]).some((e) => e.id === id)).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await agentA.delete('/api/income-entries/999999');
      expect(res.status).toBe(404);
    });
  });
});
