import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

// Banco temporário próprio: DATABASE_URL precisa estar setado ANTES de qualquer
// import de '../../db' (o client lê o env no top-level do módulo), por isso os
// módulos de rota/db entram por dynamic import dentro do beforeAll.
const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-gating-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

describe('requireActiveSubscription', () => {
  let app: Express;
  let agent: ReturnType<typeof request.agent>;
  let userId: number;
  let planId: number;
  let db: typeof import('../../db').db;
  let toSqliteUtc: typeof import('../services/billing').toSqliteUtc;

  const originalFlag = process.env.BILLING_ENABLED;

  function setFlag(value: string | undefined): void {
    if (value === undefined) delete process.env.BILLING_ENABLED;
    else process.env.BILLING_ENABLED = value;
  }

  async function setSubscription(status: string, periodEnd: string | null): Promise<void> {
    await db.execute({
      sql: `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              status = excluded.status, current_period_end = excluded.current_period_end`,
      args: [userId, planId, status, periodEnd],
    });
  }

  async function clearSubscription(): Promise<void> {
    await db.execute({ sql: 'DELETE FROM subscriptions WHERE user_id = ?', args: [userId] });
  }

  beforeAll(async () => {
    const dbModule = await import('../../db');
    const billing = await import('../services/billing');
    const { requireActiveSubscription } = await import('./requireActiveSubscription');
    const { requireAuth } = await import('../auth/middleware');
    const { default: authRouter } = await import('../auth/router');
    const { errorHandler } = await import('./errorHandler');

    db = dbModule.db;
    toSqliteUtc = billing.toSqliteUtc;
    await dbModule.initDb();

    // Router de brinquedo: só exercita a ordem requireAuth → gating.
    const toy = express.Router();
    toy.use(requireAuth);
    toy.use(requireActiveSubscription);
    toy.get('/', (_req, res) => res.json({ ok: 'read' }));
    toy.post('/', (_req, res) => res.status(201).json({ ok: 'write' }));

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
    app.use('/api/toy', toy);
    app.use(errorHandler);

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'gating@test.com', password: 'password123' });
    const me = await agent.get('/api/auth/me');
    userId = me.body.id as number;

    const plan = await db.execute({
      sql: `INSERT INTO plans (code, name, description, price_cents, interval, active)
            VALUES ('gating-test', 'Teste', 'Plano de teste', 1990, 'monthly', 1)
            RETURNING id`,
      args: [],
    });
    planId = Number(plan.rows[0].id);
  });

  afterEach(async () => {
    setFlag(originalFlag);
    vi.restoreAllMocks();
    await clearSubscription();
  });

  it('é no-op quando BILLING_ENABLED está ausente (default desligado)', async () => {
    setFlag(undefined);
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(201);
  });

  it("é no-op quando BILLING_ENABLED='false'", async () => {
    setFlag('false');
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(201);
  });

  it('não consulta o banco quando a flag está desligada', async () => {
    setFlag('false');
    const spy = vi.spyOn(db, 'execute');
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(201);
    expect(spy).not.toHaveBeenCalled();
  });

  it('bloqueia escrita com 402 SUBSCRIPTION_REQUIRED sem assinatura', async () => {
    setFlag('true');
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(res.body.error).toBe('Assinatura necessária para gravar dados');
  });

  it('libera escrita com assinatura active e período futuro', async () => {
    setFlag('true');
    await setSubscription('active', toSqliteUtc(new Date(Date.now() + 86_400_000)));
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(201);
  });

  it('bloqueia assinatura active com período vencido', async () => {
    setFlag('true');
    await setSubscription('active', toSqliteUtc(new Date(Date.now() - 86_400_000)));
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('bloqueia assinatura pending', async () => {
    setFlag('true');
    await setSubscription('pending', toSqliteUtc(new Date(Date.now() + 86_400_000)));
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(402);
  });

  it('bloqueia assinatura canceled', async () => {
    setFlag('true');
    await setSubscription('canceled', toSqliteUtc(new Date(Date.now() + 86_400_000)));
    const res = await agent.post('/api/toy').send({});
    expect(res.status).toBe(402);
  });

  it('libera GET sem assinatura mesmo com a flag ligada', async () => {
    setFlag('true');
    const res = await agent.get('/api/toy');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe('read');
  });

  it('responde 401 (requireAuth roda antes) sem sessão', async () => {
    setFlag('true');
    const res = await request(app).post('/api/toy').send({});
    expect(res.status).toBe(401);
  });
});
