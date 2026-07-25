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
  `vetor-wallet-test-expense-entries-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

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

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const entriesModule = await import('./expenseEntries');
    const { errorHandler } = await import('../middleware/errorHandler');

    currentMonth = entriesModule.currentMonth;

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
      'Gasto do mês corrente',
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
      false,
    );

    const resB = await agentB.get('/api/expense-entries?month=2026-07');
    expect((resB.body.entries as EntryBody[]).some((e) => e.description === 'Gasto da B')).toBe(
      true,
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

    it('rejects PATCH with malformed date (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/expense-entries/${id}`).send({ date: '10/08/2026' });
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
});
