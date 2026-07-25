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
    app.use('/api/savings', savingsRouter);
    app.use('/api/goals', goalsRouter);
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

  it('rejects creation with non-finite amount (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/savings')
      .set('Content-Type', 'application/json')
      .send('{"type":"DEPOSIT","amount":1e999,"date":"2025-01-01"}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite amount (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/savings')
      .set('Content-Type', 'application/json')
      .send('{"type":"DEPOSIT","amount":-1e999,"date":"2025-01-01"}');
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

  it('leaves goal_id null when goalId is omitted (T-024)', async () => {
    const res = await agentA.post('/api/savings').send({ type: 'DEPOSIT', amount: 42, date: '2025-01-10' });
    expect(res.status).toBe(201);
    expect(res.body.goal_id).toBeNull();
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

  // ── T-031: edição parcial ──────────────────────────────────────────────────
  describe('PATCH /api/savings/:id (T-031)', () => {
    async function newEntry(
      body: Record<string, unknown> = {},
      agent = agentA,
    ): Promise<number> {
      const created = await agent
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount: 100, date: '2025-03-01', ...body });
      expect(created.status).toBe(201);
      return created.body.id as number;
    }

    async function newGoal(name: string, agent = agentA): Promise<number> {
      const created = await agent.post('/api/goals').send({ name, target_amount: 10000 });
      expect(created.status).toBe(201);
      return created.body.id as number;
    }

    async function fetchGoal(id: number, agent = agentA) {
      const list = await agent.get('/api/goals');
      return list.body.find((g: { id: number }) => g.id === id);
    }

    it('updates amount only and it reflects in the summary', async () => {
      const agentD = request.agent(app);
      await agentD.post('/api/auth/register').send({ email: 'savings-d@test.com', password: 'password123' });
      const id = await newEntry({ amount: 100 }, agentD);

      const res = await agentD.patch(`/api/savings/${id}`).send({ amount: 250 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(250);

      const list = await agentD.get('/api/savings');
      expect(list.body.summary).toEqual({
        balance: 250,
        totalDeposits: 250,
        totalYield: 0,
        totalWithdrawals: 0,
      });
    });

    it('updates type only and it reflects in the summary', async () => {
      const agentE = request.agent(app);
      await agentE.post('/api/auth/register').send({ email: 'savings-e@test.com', password: 'password123' });
      const id = await newEntry({ amount: 80 }, agentE);

      const res = await agentE.patch(`/api/savings/${id}`).send({ type: 'WITHDRAW' });
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('WITHDRAW');

      const list = await agentE.get('/api/savings');
      expect(list.body.summary).toEqual({
        balance: -80,
        totalDeposits: 0,
        totalYield: 0,
        totalWithdrawals: 80,
      });
    });

    it('updates date only', async () => {
      const id = await newEntry({ date: '2025-03-02' });
      const res = await agentA.patch(`/api/savings/${id}`).send({ date: '2025-04-15' });
      expect(res.status).toBe(200);
      expect(res.body.date).toBe('2025-04-15');
    });

    it('updates note only, accepting an empty string to clear it', async () => {
      const id = await newEntry({ note: 'Antes' });
      const res = await agentA.patch(`/api/savings/${id}`).send({ note: '' });
      expect(res.status).toBe(200);
      expect(res.body.note).toBe('');
    });

    it('rejects PATCH with empty body (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({});
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with invalid type (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({ type: 'TRANSFER' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with amount <= 0 (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({ amount: 0 });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with non-finite amount (Infinity) (400)', async () => {
      const id = await newEntry();
      const res = await agentA
        .patch(`/api/savings/${id}`)
        .set('Content-Type', 'application/json')
        .send('{"amount":1e999}');
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with malformed date (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({ date: '01/03/2025' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when patching another user savings entry', async () => {
      const id = await newEntry({ amount: 33 }, agentB);
      const res = await agentA.patch(`/api/savings/${id}`).send({ amount: 1 });
      expect(res.status).toBe(404);

      const list = await agentB.get('/api/savings');
      expect(list.body.entries.find((e: { id: number }) => e.id === id).amount).toBe(33);
    });

    it('returns 404 for a nonexistent id', async () => {
      const res = await agentA.patch('/api/savings/999999').send({ amount: 1 });
      expect(res.status).toBe(404);
    });

    // ── Lançamento vinculado a meta (T-024 × T-031) ──────────────────────────
    it('editing the amount of a linked entry updates the derived goal progress', async () => {
      const goalId = await newGoal('Progresso editável');
      const id = await newEntry({ amount: 100, goalId });
      expect((await fetchGoal(goalId)).current_amount).toBe(100);

      const res = await agentA.patch(`/api/savings/${id}`).send({ amount: 175.5 });
      expect(res.status).toBe(200);

      const goal = await fetchGoal(goalId);
      expect(goal.current_amount).toBe(175.5);
      expect(goal.progress_source).toBe('LINKED_SAVINGS');
      expect(goal.linked_entries_count).toBe(1);
    });

    it('flipping a linked DEPOSIT into a WITHDRAW flips the sign in the goal progress', async () => {
      const goalId = await newGoal('Aporte virou retirada');
      await newEntry({ amount: 200, date: '2025-03-10', goalId });
      const second = await newEntry({ amount: 50, date: '2025-03-11', goalId });
      expect((await fetchGoal(goalId)).current_amount).toBe(250);

      const res = await agentA.patch(`/api/savings/${second}`).send({ type: 'WITHDRAW' });
      expect(res.status).toBe(200);

      expect((await fetchGoal(goalId)).current_amount).toBe(150);
    });

    it('rejects changing a linked entry type to YIELD (400) and keeps the link intact', async () => {
      const goalId = await newGoal('YIELD proibido');
      const id = await newEntry({ amount: 60, goalId });

      const res = await agentA.patch(`/api/savings/${id}`).send({ type: 'YIELD' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/YIELD/);

      const list = await agentA.get('/api/savings');
      const kept = list.body.entries.find((e: { id: number }) => e.id === id);
      expect(kept.type).toBe('DEPOSIT');
      expect(kept.goal_id).toBe(goalId);
      expect((await fetchGoal(goalId)).current_amount).toBe(60);
    });

    it('allows YIELD together with an explicit unlink in the same PATCH', async () => {
      const goalId = await newGoal('YIELD ao desvincular');
      const id = await newEntry({ amount: 15, goalId });

      const res = await agentA.patch(`/api/savings/${id}`).send({ type: 'YIELD', goalId: null });
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('YIELD');
      expect(res.body.goal_id).toBeNull();

      const goal = await fetchGoal(goalId);
      expect(goal.current_amount).toBe(0);
      expect(goal.progress_source).toBe('MANUAL');
    });

    it('rejects linking a goal to an existing YIELD entry (400)', async () => {
      const goalId = await newGoal('Sem rendimento no patch');
      const id = await newEntry({ type: 'YIELD', amount: 9 });

      const res = await agentA.patch(`/api/savings/${id}`).send({ goalId });
      expect(res.status).toBe(400);
      expect((await fetchGoal(goalId)).linked_entries_count).toBe(0);
    });

    it('unlinks an entry with goalId: null (entry survives, goal falls back to MANUAL)', async () => {
      const goalId = await newGoal('Desvincular');
      const id = await newEntry({ amount: 90, goalId });

      const res = await agentA.patch(`/api/savings/${id}`).send({ goalId: null });
      expect(res.status).toBe(200);
      expect(res.body.goal_id).toBeNull();
      expect(res.body.amount).toBe(90);

      const goal = await fetchGoal(goalId);
      expect(goal.current_amount).toBe(0);
      expect(goal.progress_source).toBe('MANUAL');
      expect(goal.linked_entries_count).toBe(0);
    });

    it('relinks an entry to another goal, moving the progress', async () => {
      const from = await newGoal('Meta origem');
      const to = await newGoal('Meta destino');
      const id = await newEntry({ amount: 120, goalId: from });
      expect((await fetchGoal(from)).current_amount).toBe(120);

      const res = await agentA.patch(`/api/savings/${id}`).send({ goalId: to });
      expect(res.status).toBe(200);
      expect(res.body.goal_id).toBe(to);

      expect((await fetchGoal(from)).current_amount).toBe(0);
      expect((await fetchGoal(to)).current_amount).toBe(120);
    });

    it('links a previously unlinked entry to a goal', async () => {
      const goalId = await newGoal('Vincular depois');
      const id = await newEntry({ amount: 45 });
      expect((await fetchGoal(goalId)).current_amount).toBe(0);

      const res = await agentA.patch(`/api/savings/${id}`).send({ goalId });
      expect(res.status).toBe(200);
      expect(res.body.goal_id).toBe(goalId);
      expect((await fetchGoal(goalId)).current_amount).toBe(45);
    });

    it('returns 404 when relinking to another user goal, keeping the current link', async () => {
      const mine = await newGoal('Minha meta');
      const theirs = await newGoal('Meta da B', agentB);
      const id = await newEntry({ amount: 70, goalId: mine });

      const res = await agentA.patch(`/api/savings/${id}`).send({ goalId: theirs });
      expect(res.status).toBe(404);

      const list = await agentA.get('/api/savings');
      expect(list.body.entries.find((e: { id: number }) => e.id === id).goal_id).toBe(mine);
      expect((await fetchGoal(mine)).current_amount).toBe(70);
      expect((await fetchGoal(theirs, agentB)).linked_entries_count).toBe(0);
    });

    it('rejects a non-integer goalId (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({ goalId: 1.5 });
      expect(res.status).toBe(400);
    });

    it('editing amount and note at once keeps the link and updates the goal', async () => {
      const goalId = await newGoal('Multi campo');
      const id = await newEntry({ amount: 10, note: 'antigo', goalId });

      const res = await agentA
        .patch(`/api/savings/${id}`)
        .send({ amount: 33, note: 'novo', date: '2025-05-05' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ amount: 33, note: 'novo', date: '2025-05-05', goal_id: goalId });
      expect((await fetchGoal(goalId)).current_amount).toBe(33);
    });
  });

  // ── T-041: transferir saldo da poupança para uma meta ──────────────────────
  describe('POST /api/savings/transfer-to-goal (T-041)', () => {
    /**
     * Datas relativas — nunca fixas, para o teste não envelhecer. Usa o fuso
     * LOCAL do processo (padrão do app — ver `currentMonth`/`currentMonthKey`),
     * não UTC: `toISOString()` pode virar o dia (e o mês) antes ou depois da
     * hora local, dependendo do fuso da máquina que roda o teste.
     */
    function isoDaysAgo(days: number): string {
      const d = new Date();
      d.setDate(d.getDate() - days);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const today = isoDaysAgo(0);

    let seq = 0;
    /** Agente com razão de poupança isolado (usuário novo por cenário). */
    async function freshAgent() {
      const agent = request.agent(app);
      seq += 1;
      const email = `savings-transfer-${seq}-${Math.random().toString(36).slice(2)}@test.com`;
      const reg = await agent.post('/api/auth/register').send({ email, password: 'password123' });
      expect(reg.status).toBe(201);
      return agent;
    }

    async function goal(agent: ReturnType<typeof request.agent>, name = 'Viagem') {
      const created = await agent.post('/api/goals').send({ name, target_amount: 10000 });
      expect(created.status).toBe(201);
      return created.body.id as number;
    }

    async function deposit(
      agent: ReturnType<typeof request.agent>,
      amount: number,
      body: Record<string, unknown> = {},
    ) {
      const created = await agent
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount, date: isoDaysAgo(10), ...body });
      expect(created.status).toBe(201);
      return created.body;
    }

    async function fetchGoal(agent: ReturnType<typeof request.agent>, id: number) {
      const list = await agent.get('/api/goals');
      return list.body.find((g: { id: number }) => g.id === id);
    }

    it('returns 401 without session', async () => {
      const res = await request(app)
        .post('/api/savings/transfer-to-goal')
        .send({ goalId: 1, amount: 10, date: today });
      expect(res.status).toBe(401);
    });

    it('creates the WITHDRAW/DEPOSIT pair (only the deposit is linked)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 1000);

      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 400, date: today, note: 'Reserva da viagem' });
      expect(res.status).toBe(201);

      const { withdraw, deposit: dep } = res.body;
      expect(withdraw.type).toBe('WITHDRAW');
      expect(dep.type).toBe('DEPOSIT');
      // Invariante nº 1: a perna de saída NÃO pode ser vinculada, senão o
      // agregado da meta soma +X −X = 0 e o progresso não anda.
      expect(withdraw.goal_id).toBeNull();
      expect(dep.goal_id).toBe(goalId);
      expect(withdraw.amount).toBe(400);
      expect(dep.amount).toBe(400);
      expect(withdraw.date).toBe(today);
      expect(dep.date).toBe(today);
      expect(withdraw.transfer_group).toBeTruthy();
      expect(dep.transfer_group).toBe(withdraw.transfer_group);
      expect(withdraw.note).toBe('Reserva da viagem');
      expect(dep.note).toBe('Reserva da viagem');
    });

    it('defaults the note to a label naming the goal', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent, 'Notebook');
      await deposit(agent, 500);

      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 100, date: today });
      expect(res.status).toBe(201);
      expect(res.body.deposit.note).toBe('Reservado para a meta: Notebook');
    });

    it('leaves the balance untouched and raises both totals by the amount', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 1000);

      const before = (await agent.get('/api/savings')).body.summary;
      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 250, date: today });
      expect(res.status).toBe(201);

      const after = (await agent.get('/api/savings')).body.summary;
      expect(after.balance).toBe(before.balance);
      expect(after.totalDeposits).toBe(before.totalDeposits + 250);
      expect(after.totalWithdrawals).toBe(before.totalWithdrawals + 250);
      expect(after.totalYield).toBe(before.totalYield);
    });

    it('raises the goal progress by exactly the transferred amount', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 1000);
      expect((await fetchGoal(agent, goalId)).current_amount).toBe(0);

      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 300, date: today });
      expect(res.status).toBe(201);

      const g = await fetchGoal(agent, goalId);
      expect(g.current_amount).toBe(300);
      expect(g.progress_source).toBe('LINKED_SAVINGS');
      expect(g.linked_entries_count).toBe(1);
    });

    it('accumulates two transfers into the same goal', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 1000);

      expect(
        (await agent.post('/api/savings/transfer-to-goal').send({ goalId, amount: 100, date: today }))
          .status,
      ).toBe(201);
      expect(
        (await agent.post('/api/savings/transfer-to-goal').send({ goalId, amount: 150, date: today }))
          .status,
      ).toBe(201);

      const g = await fetchGoal(agent, goalId);
      expect(g.current_amount).toBe(250);
      expect(g.linked_entries_count).toBe(2);
    });

    it('rejects a missing amount (400)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      const res = await agent.post('/api/savings/transfer-to-goal').send({ goalId, date: today });
      expect(res.status).toBe(400);
    });

    it('rejects a non-numeric amount (400)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 'abc', date: today });
      expect(res.status).toBe(400);
    });

    it('rejects amount <= 0 (400)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 0, date: today });
      expect(res.status).toBe(400);
    });

    it('rejects a non-finite amount (400)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .set('Content-Type', 'application/json')
        .send(`{"goalId":${goalId},"amount":1e999,"date":"${today}"}`);
      expect(res.status).toBe(400);
    });

    it('rejects an invalid date (400)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 500);
      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 10, date: '01/01/2026' });
      expect(res.status).toBe(400);
    });

    it('rejects a missing goalId (400)', async () => {
      const agent = await freshAgent();
      const res = await agent.post('/api/savings/transfer-to-goal').send({ amount: 10, date: today });
      expect(res.status).toBe(400);
    });

    it('rejects a non-integer goalId (400)', async () => {
      const agent = await freshAgent();
      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId: 1.5, amount: 10, date: today });
      expect(res.status).toBe(400);
    });

    it('returns 404 for another user goal and writes nothing', async () => {
      const owner = await freshAgent();
      const other = await freshAgent();
      const theirGoal = await goal(owner, 'Meta do dono');
      await deposit(other, 1000);

      const res = await other
        .post('/api/savings/transfer-to-goal')
        .send({ goalId: theirGoal, amount: 100, date: today });
      expect(res.status).toBe(404);

      const list = await other.get('/api/savings');
      expect(list.body.entries).toHaveLength(1);
      expect(list.body.summary.totalWithdrawals).toBe(0);
      expect((await fetchGoal(owner, theirGoal)).linked_entries_count).toBe(0);
    });

    it('returns 400 when the balance is insufficient, creating zero rows', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 100);

      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 500, date: today });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/livre/i);

      const list = await agent.get('/api/savings');
      expect(list.body.entries).toHaveLength(1);
      expect(list.body.summary).toMatchObject({ balance: 100, totalWithdrawals: 0 });
    });

    it('validates against the FREE balance, not the total balance', async () => {
      const agent = await freshAgent();
      const goalA = await goal(agent, 'Meta A');
      const goalB = await goal(agent, 'Meta B');
      // 1000 no saldo, 900 já reservados na meta A via aporte vinculado →
      // 100 livres. Transferir 200 para B tem saldo total suficiente, mas não
      // saldo livre.
      await deposit(agent, 100);
      await deposit(agent, 900, { goalId: goalA });

      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId: goalB, amount: 200, date: today });
      expect(res.status).toBe(400);
      expect((await fetchGoal(agent, goalB)).linked_entries_count).toBe(0);

      // 100 (exatamente o livre) passa.
      const ok = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId: goalB, amount: 100, date: today });
      expect(ok.status).toBe(201);
      expect((await fetchGoal(agent, goalB)).current_amount).toBe(100);
    });

    it('allows transferring exactly the free balance built from float-noisy amounts', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 0.1);
      await deposit(agent, 0.2);
      // 0.1 + 0.2 === 0.30000000000000004 em float: comparar sem centavos
      // rejeitaria esta transferência.
      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 0.3, date: today });
      expect(res.status).toBe(201);
      expect((await fetchGoal(agent, goalId)).current_amount).toBe(0.3);
    });

    it('counts YIELD in the free balance', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 100);
      const yieldRes = await agent
        .post('/api/savings')
        .send({ type: 'YIELD', amount: 50, date: isoDaysAgo(5) });
      expect(yieldRes.status).toBe(201);

      const res = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 150, date: today });
      expect(res.status).toBe(201);
      expect((await fetchGoal(agent, goalId)).current_amount).toBe(150);
    });

    it('lets each leg be deleted independently (no cascade, no undo)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 1000);

      const first = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 200, date: today });
      expect(first.status).toBe(201);

      // Apagar só a perna de saída: o dinheiro "volta" ao saldo e a meta segue
      // com o progresso — consequência documentada da independência.
      const delWithdraw = await agent.delete(`/api/savings/${first.body.withdraw.id}`);
      expect(delWithdraw.status).toBe(204);
      let list = await agent.get('/api/savings');
      expect(list.body.summary.balance).toBe(1200);
      expect((await fetchGoal(agent, goalId)).current_amount).toBe(200);

      // Apagar só a perna de entrada de uma segunda transferência: o saldo cai
      // e a meta perde o progresso.
      const second = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 300, date: today });
      expect(second.status).toBe(201);
      const delDeposit = await agent.delete(`/api/savings/${second.body.deposit.id}`);
      expect(delDeposit.status).toBe(204);
      list = await agent.get('/api/savings');
      expect(list.body.summary.balance).toBe(900);
      expect((await fetchGoal(agent, goalId)).current_amount).toBe(200);
    });

    it('ignores transfer_group in the PATCH body (it is procedence, not editable)', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 500);
      const created = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 100, date: today });
      const group = created.body.deposit.transfer_group;

      const res = await agent
        .patch(`/api/savings/${created.body.deposit.id}`)
        .send({ amount: 120, transfer_group: 'hackeado' });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(120);
      expect(res.body.transfer_group).toBe(group);
    });

    it('keeps both legs (unlinked) after the goal is deleted', async () => {
      const agent = await freshAgent();
      const goalId = await goal(agent);
      await deposit(agent, 1000);
      const created = await agent
        .post('/api/savings/transfer-to-goal')
        .send({ goalId, amount: 400, date: today });
      expect(created.status).toBe(201);

      const del = await agent.delete(`/api/goals/${goalId}`);
      expect(del.status).toBe(204);

      const list = await agent.get('/api/savings');
      const legs = list.body.entries.filter(
        (e: { transfer_group: string | null }) => e.transfer_group === created.body.deposit.transfer_group,
      );
      expect(legs).toHaveLength(2);
      expect(legs.every((e: { goal_id: number | null }) => e.goal_id === null)).toBe(true);
      expect(list.body.summary.balance).toBe(1000);
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
