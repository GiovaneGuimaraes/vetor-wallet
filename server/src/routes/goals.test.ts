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
    app.use('/api/goals', goalsRouter);
    app.use('/api/savings', savingsRouter);
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

  it('rejects creation with non-finite target_amount (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/goals')
      .set('Content-Type', 'application/json')
      .send('{"name":"Viagem","target_amount":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite target_amount (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/goals')
      .set('Content-Type', 'application/json')
      .send('{"name":"Viagem","target_amount":-1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite current_amount (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/goals')
      .set('Content-Type', 'application/json')
      .send('{"name":"Viagem","target_amount":1000,"current_amount":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects PATCH with non-finite target_amount (Infinity) (400)', async () => {
    const created = await agentA.post('/api/goals').send({ name: 'Patch infinity', target_amount: 3000 });
    const id = created.body.id;

    const res = await agentA
      .patch(`/api/goals/${id}`)
      .set('Content-Type', 'application/json')
      .send('{"target_amount":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects PATCH with non-finite current_amount (Infinity) (400)', async () => {
    const created = await agentA.post('/api/goals').send({ name: 'Patch infinity 2', target_amount: 3000 });
    const id = created.body.id;

    const res = await agentA
      .patch(`/api/goals/${id}`)
      .set('Content-Type', 'application/json')
      .send('{"current_amount":1e999}');
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

  // ── T-024: progresso derivado de lançamentos de poupança vinculados ────────
  describe('progresso derivado de aportes vinculados (T-024)', () => {
    async function fetchGoal(agent: ReturnType<typeof request.agent>, id: number) {
      const list = await agent.get('/api/goals');
      return list.body.find((g: { id: number }) => g.id === id);
    }

    async function newGoal(name: string, target = 1000) {
      const created = await agentA.post('/api/goals').send({ name, target_amount: target });
      return created.body.id as number;
    }

    it('goal without linked entries keeps the manual current_amount', async () => {
      const id = await newGoal('Manual pura');
      await agentA.patch(`/api/goals/${id}`).send({ current_amount: 250 });

      const goal = await fetchGoal(agentA, id);
      expect(goal).toMatchObject({
        current_amount: 250,
        progress_source: 'MANUAL',
        linked_entries_count: 0,
      });
    });

    it('derives current_amount from a linked DEPOSIT', async () => {
      const id = await newGoal('Viagem vinculada');
      const entry = await agentA
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount: 100, date: '2025-02-01', goalId: id });
      expect(entry.status).toBe(201);
      expect(entry.body.goal_id).toBe(id);

      const goal = await fetchGoal(agentA, id);
      expect(goal).toMatchObject({
        current_amount: 100,
        progress_source: 'LINKED_SAVINGS',
        linked_entries_count: 1,
      });
    });

    it('subtracts linked WITHDRAW from the derived progress', async () => {
      const id = await newGoal('Aporte e retirada');
      await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 100, date: '2025-02-01', goalId: id });
      await agentA.post('/api/savings').send({ type: 'WITHDRAW', amount: 30, date: '2025-02-02', goalId: id });

      const goal = await fetchGoal(agentA, id);
      expect(goal.current_amount).toBe(70);
      expect(goal.progress_source).toBe('LINKED_SAVINGS');
      expect(goal.linked_entries_count).toBe(2);
    });

    it('ignores unlinked entries and the manual value once linked entries exist', async () => {
      const created = await agentA.post('/api/goals').send({ name: 'Manual ignorado', target_amount: 1000, current_amount: 900 });
      const id = created.body.id;
      await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 40, date: '2025-02-03', goalId: id });
      await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 5000, date: '2025-02-03' });

      const goal = await fetchGoal(agentA, id);
      expect(goal.current_amount).toBe(40);
    });

    it('floors derived progress at 0 when linked withdrawals exceed deposits', async () => {
      const id = await newGoal('Retirada maior');
      await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 50, date: '2025-02-04', goalId: id });
      await agentA.post('/api/savings').send({ type: 'WITHDRAW', amount: 80, date: '2025-02-05', goalId: id });

      const goal = await fetchGoal(agentA, id);
      expect(goal.current_amount).toBe(0);
    });

    it('reflects the deletion of a linked entry (derived, not materialized)', async () => {
      const id = await newGoal('Apagar aporte');
      const first = await agentA
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount: 100, date: '2025-02-06', goalId: id });
      await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 25, date: '2025-02-07', goalId: id });

      expect((await fetchGoal(agentA, id)).current_amount).toBe(125);

      const del = await agentA.delete(`/api/savings/${first.body.id}`);
      expect(del.status).toBe(204);

      const goal = await fetchGoal(agentA, id);
      expect(goal.current_amount).toBe(25);
      expect(goal.linked_entries_count).toBe(1);
    });

    it('rejects PATCH of current_amount on a goal with linked entries (400)', async () => {
      const id = await newGoal('Bloqueada');
      await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 10, date: '2025-02-08', goalId: id });

      const res = await agentA.patch(`/api/goals/${id}`).send({ current_amount: 999 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/automaticamente/i);

      expect((await fetchGoal(agentA, id)).current_amount).toBe(10);
    });

    it('still allows PATCH of name/target_amount on a goal with linked entries', async () => {
      const id = await newGoal('Renomear vinculada');
      await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 10, date: '2025-02-09', goalId: id });

      const res = await agentA.patch(`/api/goals/${id}`).send({ name: 'Renomeada', target_amount: 2000 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Renomeada',
        target_amount: 2000,
        current_amount: 10,
        progress_source: 'LINKED_SAVINGS',
      });
    });

    it('returns 404 when linking a savings entry to another user goal', async () => {
      const otherGoal = await agentB.post('/api/goals').send({ name: 'Meta da B', target_amount: 500 });

      const res = await agentA
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount: 100, date: '2025-02-10', goalId: otherGoal.body.id });
      expect(res.status).toBe(404);

      const goal = await fetchGoal(agentB, otherGoal.body.id);
      expect(goal.current_amount).toBe(0);
      expect(goal.progress_source).toBe('MANUAL');
    });

    it('rejects linking a YIELD entry to a goal (400)', async () => {
      const id = await newGoal('Sem rendimento');
      const res = await agentA
        .post('/api/savings')
        .send({ type: 'YIELD', amount: 10, date: '2025-02-11', goalId: id });
      expect(res.status).toBe(400);
    });

    it('rejects a non-integer goalId (400)', async () => {
      const res = await agentA
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount: 10, date: '2025-02-12', goalId: 'abc' });
      expect(res.status).toBe(400);
    });

    it('unlinks savings entries when the goal is deleted (entry survives)', async () => {
      const id = await newGoal('Meta removida');
      const entry = await agentA
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount: 60, date: '2025-02-13', goalId: id });

      const del = await agentA.delete(`/api/goals/${id}`);
      expect(del.status).toBe(204);

      const savings = await agentA.get('/api/savings');
      const kept = savings.body.entries.find((e: { id: number }) => e.id === entry.body.id);
      expect(kept).toBeTruthy();
      expect(kept.goal_id).toBeNull();
    });
  });
});
