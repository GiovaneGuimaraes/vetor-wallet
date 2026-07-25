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
  `vetor-wallet-test-alerts-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('alerts routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { default: alertsRouter } = await import('./alerts');
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
    app.use('/api/alerts', alertsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA.post('/api/auth/register').send({ email: 'alerts-a@test.com', password: 'password123' });
    await agentB.post('/api/auth/register').send({ email: 'alerts-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });

  it('rejects creation with empty ticker (400)', async () => {
    const res = await agentA.post('/api/alerts').send({ ticker: '', type: 'PRICE_ABOVE', threshold: 30 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with invalid type (400)', async () => {
    const res = await agentA.post('/api/alerts').send({ ticker: 'PETR4', type: 'INVALID', threshold: 30 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with threshold <= 0 (400)', async () => {
    const res = await agentA.post('/api/alerts').send({ ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite threshold (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .set('Content-Type', 'application/json')
      .send('{"ticker":"PETR4","type":"PRICE_ABOVE","threshold":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite threshold (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/alerts')
      .set('Content-Type', 'application/json')
      .send('{"ticker":"PETR4","type":"PRICE_ABOVE","threshold":-1e999}');
    expect(res.status).toBe(400);
  });

  it('creates an alert rule', async () => {
    const res = await agentA.post('/api/alerts').send({ ticker: 'petr4', type: 'PRICE_ABOVE', threshold: 35.5 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 35.5 });
  });

  it('lists only the requesting user alert rules', async () => {
    await agentB.post('/api/alerts').send({ ticker: 'VALE3', type: 'PRICE_BELOW', threshold: 60 });

    const resA = await agentA.get('/api/alerts');
    expect(resA.status).toBe(200);
    expect(resA.body.every((item: { ticker: string }) => item.ticker !== 'VALE3')).toBe(true);

    const resB = await agentB.get('/api/alerts');
    expect(resB.status).toBe(200);
    expect(resB.body.some((item: { ticker: string }) => item.ticker === 'VALE3')).toBe(true);
  });

  it('deletes an alert rule belonging to the user', async () => {
    const created = await agentA.post('/api/alerts').send({ ticker: 'ITUB4', type: 'CHANGE_PCT', threshold: 5 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/alerts/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/alerts');
    expect(list.body.some((item: { id: number }) => item.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user alert rule', async () => {
    const created = await agentB.post('/api/alerts').send({ ticker: 'BBAS3', type: 'ALLOCATION_PCT', threshold: 10 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/alerts/${id}`);
    expect(del.status).toBe(404);
  });
});
