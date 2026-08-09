import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-pixcharges-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

function providerCharge(status: string, over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        id: 'pix_provider_id',
        amount: 990,
        status,
        brCode: 'br',
        brCodeBase64: 'b64',
        expiresAt: '2099-01-01T00:00:00.000Z',
        ...over,
      },
      error: null,
      success: true,
    }),
  };
}

describe('pix-charges + billing simulate routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let db: typeof import('@vetor-wallet/db').db;
  let userAId: number;
  let userBId: number;
  let planId: number;
  let chargeSeq = 0;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: pixChargesRouter } = await import('./pixCharges');
    const { default: billingSimulateRouter } = await import('./billingSimulate');
    const { errorHandler } = await import('../middleware/errorHandler');

    db = dbModule.db;
    await dbModule.initDb();

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
    app.use('/api/pix-charges', pixChargesRouter);
    app.use('/api/billing', billingSimulateRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    agentB = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'pix-a@test.com', password: 'password123' });
    await agentB
      .post('/api/auth/register')
      .send({ email: 'pix-b@test.com', password: 'password123' });

    const users = await db.execute('SELECT id, email FROM users');
    userAId = Number(users.rows.find((r) => String(r.email) === 'pix-a@test.com')!.id);
    userBId = Number(users.rows.find((r) => String(r.email) === 'pix-b@test.com')!.id);
    planId = Number(
      (await db.execute("SELECT id FROM plans WHERE code = 'pro_monthly'")).rows[0].id
    );
  });

  /** Cria uma cobrança direto no banco e devolve o id local + o id do provedor. */
  async function seedCharge(
    userId: number,
    over: { status?: string; expires_at?: string | null } = {}
  ) {
    chargeSeq += 1;
    const abacateId = `prov_${chargeSeq}`;
    await db.execute({
      sql: `INSERT INTO pix_charges
              (user_id, plan_id, abacate_charge_id, amount_cents, status, br_code, br_code_base64, expires_at)
            VALUES (?, ?, ?, 990, ?, 'br', 'b64', ?)`,
      args: [
        userId,
        planId,
        abacateId,
        over.status ?? 'PENDING',
        over.expires_at === undefined ? '2099-01-01 00:00:00' : over.expires_at,
      ],
    });
    const row = await db.execute({
      sql: 'SELECT id FROM pix_charges WHERE abacate_charge_id = ?',
      args: [abacateId],
    });
    return { id: Number(row.rows[0].id), abacateId };
  }

  beforeEach(async () => {
    process.env.ABACATEPAY_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    await db.execute('DELETE FROM pix_charges');
    await db.execute('DELETE FROM subscriptions');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 401 without session', async () => {
    expect((await request(app).get('/api/pix-charges/1')).status).toBe(401);
    expect((await request(app).post('/api/billing/simulate/1')).status).toBe(401);
  });

  it("returns 404 for another user's charge", async () => {
    const { id } = await seedCharge(userBId);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await agentA.get(`/api/pix-charges/${id}`);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a locally PAID charge without hitting the provider', async () => {
    const { id } = await seedCharge(userAId, { status: 'PAID' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await agentA.get(`/api/pix-charges/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('activates the subscription and stamps paid_at when the provider says PAID', async () => {
    const { id, abacateId } = await seedCharge(userAId);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(providerCharge('PAID', { id: abacateId })));

    const res = await agentA.get(`/api/pix-charges/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');

    const charge = await db.execute({
      sql: 'SELECT status, paid_at FROM pix_charges WHERE id = ?',
      args: [id],
    });
    expect(String(charge.rows[0].status)).toBe('PAID');
    expect(charge.rows[0].paid_at).toBeTruthy();

    const sub = await db.execute({
      sql: 'SELECT status, current_period_end FROM subscriptions WHERE user_id = ?',
      args: [userAId],
    });
    expect(String(sub.rows[0].status)).toBe('active');
    expect(String(sub.rows[0].current_period_end)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('keeps the charge PENDING when the provider still says PENDING', async () => {
    const { id, abacateId } = await seedCharge(userAId);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(providerCharge('PENDING', { id: abacateId })));

    const res = await agentA.get(`/api/pix-charges/${id}`);
    expect(res.body.status).toBe('PENDING');
    expect((await db.execute('SELECT * FROM subscriptions')).rows).toHaveLength(0);
  });

  it('persists EXPIRED reported by the provider', async () => {
    const { id, abacateId } = await seedCharge(userAId);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(providerCharge('EXPIRED', { id: abacateId })));

    const res = await agentA.get(`/api/pix-charges/${id}`);
    expect(res.body.status).toBe('EXPIRED');
    const stored = await db.execute({
      sql: 'SELECT status FROM pix_charges WHERE id = ?',
      args: [id],
    });
    expect(String(stored.rows[0].status)).toBe('EXPIRED');
  });

  it('marks a locally past-due charge EXPIRED even while the provider says PENDING', async () => {
    const { id, abacateId } = await seedCharge(userAId, { expires_at: '2020-01-01 00:00:00' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(providerCharge('PENDING', { id: abacateId })));

    const res = await agentA.get(`/api/pix-charges/${id}`);
    expect(res.body.status).toBe('EXPIRED');
  });

  it('returns 200 with providerUnavailable when the provider fails (polling must not explode)', async () => {
    const { id } = await seedCharge(userAId);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const res = await agentA.get(`/api/pix-charges/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.providerUnavailable).toBe(true);
    expect(res.body.status).toBe('PENDING');
  });

  it('simulate returns 404 in production (the route does not exist there)', async () => {
    const { id } = await seedCharge(userAId);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    process.env.NODE_ENV = 'production';

    const res = await agentA.post(`/api/billing/simulate/${id}`);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.NODE_ENV = 'test';
  });

  it('simulate pays the charge and activates the subscription', async () => {
    const { id, abacateId } = await seedCharge(userAId);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(providerCharge('PAID', { id: abacateId })));

    const res = await agentA.post(`/api/billing/simulate/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');

    const sub = await db.execute({
      sql: 'SELECT status FROM subscriptions WHERE user_id = ?',
      args: [userAId],
    });
    expect(String(sub.rows[0].status)).toBe('active');
  });

  it('simulate returns 409 for an already paid charge', async () => {
    const { id } = await seedCharge(userAId, { status: 'PAID' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await agentA.post(`/api/billing/simulate/${id}`);
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("simulate returns 404 for another user's charge", async () => {
    const { id } = await seedCharge(userBId);
    const res = await agentA.post(`/api/billing/simulate/${id}`);
    expect(res.status).toBe(404);
  });
});
