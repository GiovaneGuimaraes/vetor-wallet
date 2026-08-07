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
  `vetor-wallet-test-budgets-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('budgets routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: budgetsRouter } = await import('./budgets');
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
    app.use('/api/budgets', budgetsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA
      .post('/api/auth/register')
      .send({ email: 'budgets-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'budgets-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/budgets');
    expect(res.status).toBe(401);
  });

  it('rejects creation with empty category (400)', async () => {
    const res = await agentA.post('/api/budgets').send({ category: '   ', amount: 500 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-numeric amount (400)', async () => {
    const res = await agentA.post('/api/budgets').send({ category: 'Mercado', amount: 'muito' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with amount <= 0 (400)', async () => {
    const res = await agentA.post('/api/budgets').send({ category: 'Mercado', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite amount (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/budgets')
      .set('Content-Type', 'application/json')
      .send('{"category":"Mercado","amount":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite amount (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/budgets')
      .set('Content-Type', 'application/json')
      .send('{"category":"Mercado","amount":-1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects amount with more than 2 decimal places (400) (T-052)', async () => {
    const res = await agentA.post('/api/budgets').send({ category: 'Mercado', amount: 0.125 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2 casas decimais/);
  });

  it('creates a budget storing the category in canonical form (T-028)', async () => {
    const res = await agentA.post('/api/budgets').send({ category: 'Mercado', amount: 500 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: 'mercado', amount: 500 });
  });

  it('upsert with case/space variation replaces instead of duplicating (T-028)', async () => {
    await agentA.post('/api/budgets').send({ category: 'Farmácia', amount: 120 });
    const res = await agentA.post('/api/budgets').send({ category: '  FARMÁCIA ', amount: 180 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: 'farmácia', amount: 180 });

    const list = await agentA.get('/api/budgets');
    const matches = list.body.filter((b: { category: string }) => b.category === 'farmácia');
    expect(matches).toHaveLength(1);
    expect(matches[0].amount).toBe(180);
  });

  it('collapses internal whitespace in the stored category (T-028)', async () => {
    const res = await agentA
      .post('/api/budgets')
      .send({ category: 'Compras   do   mes', amount: 90 });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('compras do mes');
  });

  it('upsert replaces the amount instead of duplicating the category', async () => {
    await agentA.post('/api/budgets').send({ category: 'Lazer', amount: 200 });
    const res = await agentA.post('/api/budgets').send({ category: 'Lazer', amount: 350 });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(350);

    const list = await agentA.get('/api/budgets');
    const lazerEntries = list.body.filter((b: { category: string }) => b.category === 'lazer');
    expect(lazerEntries).toHaveLength(1);
    expect(lazerEntries[0].amount).toBe(350);
  });

  it('lists only the requesting user budgets', async () => {
    await agentB.post('/api/budgets').send({ category: 'Da B', amount: 100 });

    const resA = await agentA.get('/api/budgets');
    expect(resA.status).toBe(200);
    expect(resA.body.every((b: { category: string }) => b.category !== 'da b')).toBe(true);

    const resB = await agentB.get('/api/budgets');
    expect(resB.status).toBe(200);
    expect(resB.body.some((b: { category: string }) => b.category === 'da b')).toBe(true);
  });

  it('deletes a budget belonging to the user', async () => {
    const created = await agentA.post('/api/budgets').send({ category: 'Para excluir', amount: 80 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/budgets/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/budgets');
    expect(list.body.some((b: { id: number }) => b.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user budget', async () => {
    const created = await agentB.post('/api/budgets').send({ category: 'Da B protegida', amount: 90 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/budgets/${id}`);
    expect(del.status).toBe(404);

    const stillThere = await agentB.get('/api/budgets');
    expect(stillThere.body.some((b: { id: number }) => b.id === id)).toBe(true);
  });
});
