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
  `vetor-wallet-test-savings-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('savings routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const { initDb } = await import('@vetor-wallet/db');
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
      })
    );
    app.use('/api/auth', authRouter);
    app.use('/api/savings', savingsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);

    await agentA
      .post('/api/auth/register')
      .send({ email: 'savings-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'savings-b@test.com', password: 'password123' });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/savings');
    expect(res.status).toBe(401);
  });

  it('rejects creation with invalid type (400)', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'INVALID', amount: 100, date: '2025-01-01' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-numeric amount (400)', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 'abc', date: '2025-01-01' });
    expect(res.status).toBe(400);
  });

  it('rejects creation with amount <= 0 (400)', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 0, date: '2025-01-01' });
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

  it('rejects creation with amount with more than 2 decimal places (400) (T-052)', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 0.125, date: '2025-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2 casas decimais/);
  });

  it('rejects creation with invalid date format (400)', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 100, date: '01/01/2025' });
    expect(res.status).toBe(400);
  });

  // T-043: formato válido mas dia/mês inexistente no calendário.
  it('rejects creation with a nonexistent calendar date (2026-02-30) (400)', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 100, date: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('creates a savings entry', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 1000, date: '2025-01-01', note: 'Aporte inicial' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'DEPOSIT',
      amount: 1000,
      date: '2025-01-01',
      note: 'Aporte inicial',
    });
  });

  // ── T-091b1: Metas foi removida do app ─────────────────────────────────────
  it('ignores a goalId sent by an old client, creating an unlinked entry', async () => {
    // Campo desconhecido é ignorado em silêncio, como no resto da API — não é
    // 400. A coluna `goal_id` só sai na T-091b2, então ainda dá para conferir
    // que nada novo é gravado nela.
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 42, date: '2025-01-10', goalId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.goal_id).toBeNull();
  });

  it('ignores goalId in a PATCH, and a body with only goalId is an empty body (400)', async () => {
    const created = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 60, date: '2025-01-11' });
    const id = created.body.id as number;

    const onlyGoal = await agentA.patch(`/api/savings/${id}`).send({ goalId: 1 });
    expect(onlyGoal.status).toBe(400);

    const withAmount = await agentA.patch(`/api/savings/${id}`).send({ amount: 70, goalId: 1 });
    expect(withAmount.status).toBe(200);
    expect(withAmount.body.amount).toBe(70);
    expect(withAmount.body.goal_id).toBeNull();
  });

  it('no longer exposes POST /api/savings/transfer-to-goal (404)', async () => {
    const res = await agentA
      .post('/api/savings/transfer-to-goal')
      .send({ goalId: 1, amount: 10, date: '2025-01-12' });
    expect(res.status).toBe(404);
  });

  /**
   * O caso que mais provavelmente quebraria em produção: a etapa 2 (T-091b2)
   * ainda não rodou, então a base real continua tendo `savings_entries` com
   * `goal_id` preenchido. Esse dinheiro era "reservado" (fora do saldo livre) e
   * agora tem de contar integralmente no saldo — que passou a SER o saldo livre.
   */
  it('counts legacy entries with goal_id filled in the whole balance (T-091b1)', async () => {
    const { db } = await import('@vetor-wallet/db');
    const agentF = request.agent(app);
    await agentF
      .post('/api/auth/register')
      .send({ email: 'savings-legacy@test.com', password: 'password123' });
    const me = await agentF.get('/api/auth/me');
    const userId = me.body.id as number;

    // Linhas legadas gravadas direto no banco: é assim que elas existem hoje
    // numa base que usou Metas — a API não tem mais como criá-las. A tabela
    // `goals` continua no schema até a T-091b2, e `savings_entries.goal_id` é
    // FOREIGN KEY, então a meta legada precisa existir de verdade.
    const goal = await db.execute({
      sql: `INSERT INTO goals (user_id, name, target_amount, current_amount)
            VALUES (?, 'Meta legada', 5000, 0)`,
      args: [userId],
    });
    const goalId = Number(goal.lastInsertRowid ?? 0);

    await db.execute({
      sql: `INSERT INTO savings_entries (user_id, type, amount, date, note, goal_id)
            VALUES (?, 'DEPOSIT', 900, '2025-02-01', 'aporte vinculado', ?)`,
      args: [userId, goalId],
    });
    await db.execute({
      sql: `INSERT INTO savings_entries (user_id, type, amount, date, note, goal_id)
            VALUES (?, 'WITHDRAW', 0.1, '2025-02-02', 'retirada vinculada', ?)`,
      args: [userId, goalId],
    });
    await agentF.post('/api/savings').send({ type: 'DEPOSIT', amount: 0.2, date: '2025-02-03' });

    const res = await agentF.get('/api/savings');
    expect(res.status).toBe(200);
    // 900 − 0,10 + 0,20: em centavos inteiros dá 900,10 exatos (somar em float
    // daria 900.0999999999999). Nada é descontado por causa do `goal_id`.
    expect(res.body.summary).toEqual({
      balance: 900.1,
      totalDeposits: 900.2,
      totalYield: 0,
      totalWithdrawals: 0.1,
    });
  });

  it('defaults note to empty string when omitted', async () => {
    const res = await agentA
      .post('/api/savings')
      .send({ type: 'YIELD', amount: 10, date: '2025-01-02' });
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
    await agentC
      .post('/api/auth/register')
      .send({ email: 'savings-c@test.com', password: 'password123' });

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
    async function newEntry(body: Record<string, unknown> = {}, agent = agentA): Promise<number> {
      const created = await agent
        .post('/api/savings')
        .send({ type: 'DEPOSIT', amount: 100, date: '2025-03-01', ...body });
      expect(created.status).toBe(201);
      return created.body.id as number;
    }

    it('updates amount only and it reflects in the summary', async () => {
      const agentD = request.agent(app);
      await agentD
        .post('/api/auth/register')
        .send({ email: 'savings-d@test.com', password: 'password123' });
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
      await agentE
        .post('/api/auth/register')
        .send({ email: 'savings-e@test.com', password: 'password123' });
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

    it('rejects PATCH with amount with more than 2 decimal places (400) (T-052)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({ amount: 1.234 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/2 casas decimais/);
    });

    it('rejects PATCH with malformed date (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({ date: '01/03/2025' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with a nonexistent calendar date (2026-13-01) (400)', async () => {
      const id = await newEntry();
      const res = await agentA.patch(`/api/savings/${id}`).send({ date: '2026-13-01' });
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
  });

  it('deletes a savings entry belonging to the user', async () => {
    const created = await agentA
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 10, date: '2025-01-05' });
    const id = created.body.id;

    const del = await agentA.delete(`/api/savings/${id}`);
    expect(del.status).toBe(204);

    const list = await agentA.get('/api/savings');
    expect(list.body.entries.some((item: { id: number }) => item.id === id)).toBe(false);
  });

  it('returns 404 when deleting another user savings entry', async () => {
    const created = await agentB
      .post('/api/savings')
      .send({ type: 'DEPOSIT', amount: 20, date: '2025-01-06' });
    const id = created.body.id;

    const del = await agentA.delete(`/api/savings/${id}`);
    expect(del.status).toBe(404);
  });
});
