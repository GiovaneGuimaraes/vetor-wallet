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
  `vetor-wallet-test-operations-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('operations routes — SELL validation', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { default: operationsRouter } = await import('./operations');
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
    app.use('/api/operations', operationsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    await agentA.post('/api/auth/register').send({ email: 'ops-a@test.com', password: 'password123' });
  });

  it('rejects SELL for a ticker with no position at all (400)', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 10, price: 30, date: '2024-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/posicao/i);

    const list = await agentA.get('/api/operations');
    expect(list.body.length).toBe(0);
  });

  it('records a valid BUY', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'BUY', quantity: 100, price: 30, date: '2024-01-01' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticker: 'PETR4', type: 'BUY', quantity: 100, price: 30 });
  });

  it('rejects a SELL greater than the current position (400) and persists nothing', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 200, price: 40, date: '2024-01-02' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/posicao/i);

    const list = await agentA.get('/api/operations');
    // still only the original BUY — the rejected SELL was never inserted
    expect(list.body.length).toBe(1);
    expect(list.body[0].type).toBe('BUY');
  });

  it('records a SELL exactly equal to the current position, zeroing it', async () => {
    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 100, price: 45, date: '2024-01-03' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticker: 'PETR4', type: 'SELL', quantity: 100, price: 45 });

    // a further SELL of any amount should now be rejected — position is zero
    const res2 = await agentA
      .post('/api/operations')
      .send({ ticker: 'PETR4', type: 'SELL', quantity: 1, price: 50, date: '2024-01-04' });
    expect(res2.status).toBe(400);
  });

  it('allows a valid partial SELL after a fresh BUY', async () => {
    await agentA
      .post('/api/operations')
      .send({ ticker: 'VALE3', type: 'BUY', quantity: 50, price: 80, date: '2024-02-01' });

    const res = await agentA
      .post('/api/operations')
      .send({ ticker: 'VALE3', type: 'SELL', quantity: 20, price: 90, date: '2024-02-02' });
    expect(res.status).toBe(201);
  });
});
