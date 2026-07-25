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

  it('rejects creation with non-finite amount (Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/income')
      .set('Content-Type', 'application/json')
      .send('{"name":"Salário","type":"SALARIO","amount":1e999}');
    expect(res.status).toBe(400);
  });

  it('rejects creation with non-finite amount (-Infinity) (400)', async () => {
    const res = await agentA
      .post('/api/income')
      .set('Content-Type', 'application/json')
      .send('{"name":"Salário","type":"SALARIO","amount":-1e999}');
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

  // ── T-031: edição parcial ──────────────────────────────────────────────────
  describe('PATCH /api/income/:id (T-031)', () => {
    async function newSource(name = 'Editável', amount = 100) {
      const created = await agentA.post('/api/income').send({ name, type: 'OUTRO', amount });
      return created.body.id as number;
    }

    it('updates name only', async () => {
      const id = await newSource('Nome antigo', 500);
      const res = await agentA.patch(`/api/income/${id}`).send({ name: 'Nome novo' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Nome novo', type: 'OUTRO', amount: 500 });
    });

    it('trims the updated name', async () => {
      const id = await newSource();
      const res = await agentA.patch(`/api/income/${id}`).send({ name: '  Com espaços  ' });
      expect(res.body.name).toBe('Com espaços');
    });

    it('updates type only', async () => {
      const id = await newSource('Tipo', 700);
      const res = await agentA.patch(`/api/income/${id}`).send({ type: 'FREELA' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Tipo', type: 'FREELA', amount: 700 });
    });

    it('updates amount only and it reflects in the list total', async () => {
      const id = await newSource('Valor', 100);
      const res = await agentA.patch(`/api/income/${id}`).send({ amount: 250.5 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(250.5);

      const list = await agentA.get('/api/income');
      const found = list.body.find((item: { id: number }) => item.id === id);
      expect(found.amount).toBe(250.5);
    });

    it('updates several fields at once', async () => {
      const id = await newSource('Tudo', 10);
      const res = await agentA
        .patch(`/api/income/${id}`)
        .send({ name: 'Tudo novo', type: 'SALARIO', amount: 99 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Tudo novo', type: 'SALARIO', amount: 99 });
    });

    it('rejects PATCH with empty body (400)', async () => {
      const id = await newSource();
      const res = await agentA.patch(`/api/income/${id}`).send({});
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with blank name (400)', async () => {
      const id = await newSource();
      const res = await agentA.patch(`/api/income/${id}`).send({ name: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with invalid type (400)', async () => {
      const id = await newSource();
      const res = await agentA.patch(`/api/income/${id}`).send({ type: 'BONUS' });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with amount <= 0 (400)', async () => {
      const id = await newSource();
      const res = await agentA.patch(`/api/income/${id}`).send({ amount: 0 });
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with non-finite amount (Infinity) (400)', async () => {
      const id = await newSource();
      const res = await agentA
        .patch(`/api/income/${id}`)
        .set('Content-Type', 'application/json')
        .send('{"amount":1e999}');
      expect(res.status).toBe(400);
    });

    it('rejects PATCH with non-numeric amount (400)', async () => {
      const id = await newSource();
      const res = await agentA.patch(`/api/income/${id}`).send({ amount: 'abc' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when patching another user income source', async () => {
      const created = await agentB.post('/api/income').send({ name: 'Da B patch', amount: 30 });
      const id = created.body.id;

      const res = await agentA.patch(`/api/income/${id}`).send({ amount: 1 });
      expect(res.status).toBe(404);

      const list = await agentB.get('/api/income');
      const found = list.body.find((item: { id: number }) => item.id === id);
      expect(found.amount).toBe(30);
    });

    // T-044: defesa em profundidade — o UPDATE final também filtra por
    // user_id, não só o SELECT de existência que já bloqueia este caso hoje.
    // Reproduz a query exata usada por PATCH /api/income/:id para provar que,
    // mesmo com um id válido de outro usuário, o próprio UPDATE não afeta a
    // linha (rowsAffected 0) — independente do guard anterior existir.
    it('UPDATE final não afeta registro de outro usuário mesmo com id válido', async () => {
      const { db } = await import('../db');
      const created = await agentB.post('/api/income').send({ name: 'Defesa em profundidade', amount: 42 });
      const id = created.body.id;

      const result = await db.execute({
        sql: 'UPDATE income_sources SET amount = ? WHERE id = ? AND user_id = ?',
        args: [999, id, -1],
      });
      expect(result.rowsAffected).toBe(0);

      const row = await db.execute({ sql: 'SELECT amount FROM income_sources WHERE id = ?', args: [id] });
      expect(row.rows[0].amount).toBe(42);
    });

    it('returns 404 for a nonexistent id', async () => {
      const res = await agentA.patch('/api/income/999999').send({ amount: 1 });
      expect(res.status).toBe(404);
    });
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
