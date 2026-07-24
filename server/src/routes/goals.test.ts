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
  `vetor-wallet-test-goals-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('goals routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('../db');
    const { default: authRouter } = await import('../auth/router');
    const { default: goalsRouter } = await import('./goals');
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
    app.use('/api/goals', goalsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA.post('/api/auth/register').send({ email: 'goals-a@test.com', password: 'password123' });
    await agentB.post('/api/auth/register').send({ email: 'goals-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/goals');
    expect(res.status).toBe(401);
  });

  it('rejects creation with empty name (400)', async () => {
    const res = await agentA.post('/api/goals').send({ name: '  ', target_amount: 1000 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-numeric target_amount (400)', async () => {
    const res = await agentA.post('/api/goals').send({ name: 'Viagem', target_amount: 'abc' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with target_amount <= 0 (400)', async () => {
    const res = await agentA.post('/api/goals').send({ name: 'Viagem', target_amount: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects creation with negative current_amount (400)', async () => {
    const res = await agentA.post('/api/goals').send({ name: 'Viagem', target_amount: 1000, current_amount: -1 });
    expect(res.status).toBe(400);
  });

  it('creates a goal', async () => {
    const res = await agentA.post('/api/goals').send({ name: 'Viagem', target_amount: 5000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Viagem', target_amount: 5000, current_amount: 0 });
  });

  it('accepts an explicit current_amount on creation', async () => {
    const res = await agentA.post('/api/goals').send({ name: 'Carro', target_amount: 50000, current_amount: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.current_amount).toBe(1000);
  });

  it('lists only the requesting user goals', async () => {
    await agentB.post('/api/goals').send({ name: 'Meta B', target_amount: 200 });

    const resA = await agentA.get('/api/goals');
    expect(resA.status).toBe(200);
    expect(resA.body.every((item: { name: string }) => item.name !== 'Meta B')).toBe(true);

    const resB = await agentB.get('/api/goals');
    expect(resB.status).toBe(200);
    expect(resB.body.some((item: { name: string }) => item.name === 'Meta B')).toBe(true);
  });

  it('updates a goal partially (name only)', async () => {
    const created = await agentA.post('/api/goals').send({ name: 'Reserva', target_amount: 10000 });
    const id = created.body.id;

    const res = await agentA.patch(`/api/goals/${id}`).send({ name: 'Reserva de emergência' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Reserva de emergência', target_amount: 10000 });
  });

  it('updates current_amount only', async () => {
    const created = await agentA.post('/api/goals').send({ name: 'Notebook', target_amount: 8000 });
    const id = created.body.id;

    const res = await agentA.patch(`/api/goals/${id}`).send({ current_amount: 2000 });
    expect(res.status).toBe(200);
    expect(res.body.current_amount).toBe(2000);
    expect(res.body.target_amount).toBe(8000);
  });

  it('rejects PATCH with empty body (400)', async () => {
    const created = await agentA.post('/api/goals').send({ name: 'Bike', target_amount: 3000 });
    const id = created.body.id;

    const res = await agentA.patch(`/api/goals/${id}`).send({});
    expect(res.status).toBe(400);
  });

  it('rejects PATCH with invalid values (400)', async () => {
    const created = await agentA.post('/api/goals').send({ name: 'Celular', target_amount: 3000 });
    const id = created.body.id;

    const res = await agentA.patch(`/api/goals/${id}`).send({ target_amount: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when patching another user goal', async () => {
    const created = await agentB.post('/api/goals').send({ name: 'Da B', target_amount: 100 });
    const id = created.body.id;

    const res = await agentA.patch(`/api/goals/${id}`).send({ name: 'Roubada' });
    expect(res.status).toBe(404);
  });

  it('deletes a goal belonging to the user', async () => {
    const created = await agentA.post('/api/goals').send({ name: 'Para excluir', target_amount: 100 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/goals/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/goals');
    expect(list.body.some((item: { id: number }) => item.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user goal', async () => {
    const created = await agentB.post('/api/goals').send({ name: 'Da B 2', target_amount: 100 });
    const id = created.body.id;

    const del = await agentA.delete(`/api/goals/${id}`);
    expect(del.status).toBe(404);
  });
});
