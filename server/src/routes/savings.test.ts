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
  `vetor-wallet-test-savings-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('savings routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { default: savingsRouter } = await import('./savings');
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
    app.use('/api/savings', savingsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA.post('/api/auth/register').send({ email: 'savings-a@test.com', password: 'password123' });
    await agentB.post('/api/auth/register').send({ email: 'savings-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/savings');
    expect(res.status).toBe(401);
  });

  it('rejects creation with invalid type (400)', async () => {
    const res = await agentA.post('/api/savings').send({ type: 'INVALID', amount: 100, date: '2025-01-01' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-numeric amount (400)', async () => {
    const res = await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 'abc', date: '2025-01-01' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with amount <= 0 (400)', async () => {
    const res = await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 0, date: '2025-01-01' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with invalid date format (400)', async () => {
    const res = await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 100, date: '01/01/2025' });
    expect(res.status).toBe(400);
  });

  it('creates a savings entry', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 1000, date: '2025-01-01', note: 'Aporte inicial' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'DEPOSIT', amount: 1000, date: '2025-01-01', note: 'Aporte inicial' });
  });

  it('defaults note to empty string when omitted', async () => {
    const res = await agentA.post('/api/savings').send({ type: 'YIELD', amount: 10, date: '2025-01-02' });
    expect(res.status).toBe(201);
    expect(res.body.note).toBe('');
  });

  it('lists only the requesting user savings entries', async () => {
    await agentB.post('/api/savings').send({ type: 'DEPOSIT', amount: 500, date: '2025-01-01' });

    const resA = await agentA.get('/api/savings');
    expect(resA.status).toBe(200);
    expect(resA.body.entries.some((item: { amount: number }) => item.amount === 500)).toBe(false);

    const resB = await agentB.get('/api/savings');
    expect(resB.status).toBe(200);
    expect(resB.body.entries.some((item: { amount: number }) => item.amount === 500)).toBe(true);
  });

  it('computes summary as DEPOSIT + YIELD - WITHDRAW with known entries', async () => {
    const agentC = request.agent(app);
    await agentC.post('/api/auth/register').send({ email: 'savings-c@test.com', password: 'password123' });

    await agentC.post('/api/savings').send({ type: 'DEPOSIT', amount: 1000, date: '2025-01-01' });
    await agentC.post('/api/savings').send({ type: 'DEPOSIT', amount: 500, date: '2025-01-02' });
    await agentC.post('/api/savings').send({ type: 'YIELD', amount: 50, date: '2025-01-03' });
    await agentC.post('/api/savings').send({ type: 'WITHDRAW', amount: 200, date: '2025-01-04' });

    const res = await agentC.get('/api/savings');
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      balance: 1350,
      totalDeposits: 1500,
      totalYield: 50,
      totalWithdrawals: 200,
    });
  });

  it('deletes a savings entry belonging to the user', async () => {
    const created = await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 10, date: '2025-01-05' });
    const id = created.body.id;

    const del = await agentA.delete(`/api/savings/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/savings');
    expect(list.body.entries.some((item: { id: number }) => item.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user savings entry', async () => {
    const created = await agentB.post('/api/savings').send({ type: 'DEPOSIT', amount: 20, date: '2025-01-06' });
    const id = created.body.id;

    const del = await agentA.delete(`/api/savings/${id}`);
    expect(del.status).toBe(404);
  });
});
