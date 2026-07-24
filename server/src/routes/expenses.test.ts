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
  `vetor-wallet-test-expenses-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('expenses routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('../db');
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

  it('creates a fixed expense', async () => {
    const res = await agentA.post('/api/expenses').send({ name: 'Aluguel', category: 'Moradia', amount: 1500 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Aluguel', category: 'Moradia', amount: 1500 });
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
