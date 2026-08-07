import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Unique on-disk temp DB per test file. Static `import` declarations are
// hoisted above other statements, so setting DATABASE_URL before a static
// `import '../../db'` would NOT take effect in time — '../../db' captures the URL
// at module-eval time. Route/db modules are therefore imported dynamically
// inside beforeAll, after the env var is set.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-expenses-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('expenses routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: expensesRouter } = await import('./expenses');
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
    app.use('/api/expenses', expensesRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA.post('/api/auth/register').send({ email: 'expenses-a@test.com', password: 'password123' });
    await agentB.post('/api/auth/register').send({ email: 'expenses-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(401);
  });

  it('rejects creation with empty name (400)', async () => {
    const res = await agentA.post('/api/expenses').send({ name: '', category: 'Moradia', amount: 100 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-numeric amount (400)', async () => {
    const res = await agentA.post('/api/expenses').send({ name: 'Aluguel', amount: 'muito' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with negative amount (400)', async () => {
    const res = await agentA.post('/api/expenses').send({ name: 'Aluguel', amount: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite amount (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/expenses')
      .set('Content-Type', 'application/json')
      .send('{"name":"Aluguel","category":"Moradia","amount":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite amount (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/expenses')
      .set('Content-Type', 'application/json')
      .send('{"name":"Aluguel","category":"Moradia","amount":-1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with amount with more than 2 decimal places (400) (T-052)', async () => {
    const res = await agentA
      .post('/api/expenses')
      .send({ name: 'Aluguel', category: 'Moradia', amount: 0.125 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2 casas decimais/);
  });

  it('creates a fixed expense', async () => {
    const res = await agentA.post('/api/expenses').send({ name: 'Aluguel', category: 'Moradia', amount: 1500 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Aluguel', category: 'moradia', amount: 1500 });
  });

  it('stores the category in canonical form — case and spaces normalized (T-028)', async () => {
    const res = await agentA
      .post('/api/expenses')
      .send({ name: 'Condomínio', category: '  MORADIA   Fixa ', amount: 700 });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('moradia fixa');
  });

  it('two expenses typed with different casing end up in the same category (T-028)', async () => {
    await agentA.post('/api/expenses').send({ name: 'Feira', category: 'Mercado', amount: 300 });
    await agentA.post('/api/expenses').send({ name: 'Padaria', category: 'mercado ', amount: 100 });

    const list = await agentA.get('/api/expenses');
    const mercado = (list.body as { category: string; amount: number }[]).filter(
      (item) => item.category === 'mercado',
    );
    expect(mercado).toHaveLength(2);
    expect(mercado.reduce((acc, item) => acc + item.amount, 0)).toBe(400);
  });

  it('defaults category to empty string when omitted', async () => {
    const res = await agentA.post('/api/expenses').send({ name: 'Streaming', amount: 40 });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('');
  });

  it('lists only the requesting user fixed expenses', async () => {
    await agentB.post('/api/expenses').send({ name: 'Academia B', category: 'Saúde', amount: 150 });

    const resA = await agentA.get('/api/expenses');
    expect(resA.status).toBe(200);
    expect(resA.body.every((item: { name: string }) => item.name !== 'Academia B')).toBe(true);

    const resB = await agentB.get('/api/expenses');
    expect(resB.status).toBe(200);
    expect(resB.body.some((item: { name: string }) => item.name === 'Academia B')).toBe(true);
  });

  // ── T-031: edição parcial ──────────────────────────────────────────────────
  describe('PATCH /api/expenses/:id (T-031)', () => {
    async function newExpense(name = 'Editável', category = 'casa', amount = 100) {
      const created = await agentA.post('/api/expenses').send({ name, category, amount });
      return created.body.id as number;
    }

    it('updates name only', async () => {
      const id = await newExpense('Luz', 'casa', 200);
      const res = await agentA.patch(`/api/expenses/${id}`).send({ name: 'Energia' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Energia', category: 'casa', amount: 200 });
    });

    it('updates amount only', async () => {
      const id = await newExpense('Internet', 'casa', 100);
      const res = await agentA.patch(`/api/expenses/${id}`).send({ amount: 129.9 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(129.9);

      const list = await agentA.get('/api/expenses');
      expect(list.body.find((e: { id: number }) => e.id === id).amount).toBe(129.9);
    });

    it('normalizes the updated category (T-028)', async () => {
      const id = await newExpense('Plano', 'casa', 80);
      const res = await agentA.patch(`/api/expenses/${id}`).send({ category: '  SAÚDE   Extra ' });
      expect(res.status).toBe(200);
      expect(res.body.category).toBe('saúde extra');
    });

    it('accepts an empty category to clear it', async () => {
      const id = await newExpense('Sem categoria', 'casa', 50);
      const res = await agentA.patch(`/api/expenses/${id}`).send({ category: '' });
      expect(res.status).toBe(200);
      expect(res.body.category).toBe('');
    });

    it('rejects PATCH with empty body (400)', async () => {
      const id = await newExpense();
      const res = await agentA.patch(`/api/expenses/${id}`).send({});
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with blank name (400)', async () => {
      const id = await newExpense();
      const res = await agentA.patch(`/api/expenses/${id}`).send({ name: '  ' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with non-string category (400)', async () => {
      const id = await newExpense();
      const res = await agentA.patch(`/api/expenses/${id}`).send({ category: 42 });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with amount <= 0 (400)', async () => {
      const id = await newExpense();
      const res = await agentA.patch(`/api/expenses/${id}`).send({ amount: -1 });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with non-finite amount (Infinity) (400)', async () => {
      const id = await newExpense();
      const res = await agentA
        .patch(`/api/expenses/${id}`)
        .set('Content-Type', 'application/json')
        .send('{"amount":1e999}');
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with amount with more than 2 decimal places (400) (T-052)', async () => {
      const id = await newExpense();
      const res = await agentA.patch(`/api/expenses/${id}`).send({ amount: 1.234 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/2 casas decimais/);
    });

    it('returns 404 when patching another user fixed expense', async () => {
      const created = await agentB.post('/api/expenses').send({ name: 'Da B patch', amount: 25 });
      const id = created.body.id;

      const res = await agentA.patch(`/api/expenses/${id}`).send({ amount: 1 });
      expect(res.status).toBe(404);

      const list = await agentB.get('/api/expenses');
      expect(list.body.find((e: { id: number }) => e.id === id).amount).toBe(25);
    });

    it('returns 404 for a nonexistent id', async () => {
      const res = await agentA.patch('/api/expenses/999999').send({ amount: 1 });
      expect(res.status).toBe(404);
    });
  });

  it('deletes a fixed expense belonging to the user', async () => {
    const created = await agentA.post('/api/expenses').send({ name: 'Para excluir', category: '', amount: 10 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/expenses/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/expenses');
    expect(list.body.some((item: { id: number }) => item.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user fixed expense', async () => {
    const created = await agentB.post('/api/expenses').send({ name: 'Da B', category: '', amount: 20 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/expenses/${id}`);
    expect(del.status).toBe(404);
  });
});
