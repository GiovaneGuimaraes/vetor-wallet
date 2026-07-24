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
  `vetor-wallet-test-income-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('income routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { default: incomeRouter } = await import('./income');
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
    app.use('/api/income', incomeRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA.post('/api/auth/register').send({ email: 'income-a@test.com', password: 'password123' });
    await agentB.post('/api/auth/register').send({ email: 'income-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/income');
    expect(res.status).toBe(401);
  });

  it('rejects creation with empty name (400)', async () => {
    const res = await agentA.post('/api/income').send({ name: '  ', type: 'SALARIO', amount: 100 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-numeric amount (400)', async () => {
    const res = await agentA.post('/api/income').send({ name: 'Salário', type: 'SALARIO', amount: 'abc' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with negative amount (400)', async () => {
    const res = await agentA.post('/api/income').send({ name: 'Salário', type: 'SALARIO', amount: -50 });
    expect(res.status).toBe(400);
  });

  it('creates an income source', async () => {
    const res = await agentA.post('/api/income').send({ name: 'Salário CLT', type: 'SALARIO', amount: 5000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Salário CLT', type: 'SALARIO', amount: 5000 });
  });

  it('defaults type to OUTRO when omitted', async () => {
    const res = await agentA.post('/api/income').send({ name: 'Renda extra', amount: 300 });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('OUTRO');
  });

  it('lists only the requesting user income sources', async () => {
    await agentB.post('/api/income').send({ name: 'Freela B', type: 'FREELA', amount: 1200 });

    const resA = await agentA.get('/api/income');
    expect(resA.status).toBe(200);
    expect(resA.body.every((item: { name: string }) => item.name !== 'Freela B')).toBe(true);

    const resB = await agentB.get('/api/income');
    expect(resB.status).toBe(200);
    expect(resB.body.some((item: { name: string }) => item.name === 'Freela B')).toBe(true);
  });

  it('deletes an income source belonging to the user', async () => {
    const created = await agentA.post('/api/income').send({ name: 'Para excluir', type: 'OUTRO', amount: 10 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/income/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/income');
    expect(list.body.some((item: { id: number }) => item.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user income source', async () => {
    const created = await agentB.post('/api/income').send({ name: 'Da B', type: 'OUTRO', amount: 20 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/income/${id}`);
    expect(del.status).toBe(404);
  });
});
