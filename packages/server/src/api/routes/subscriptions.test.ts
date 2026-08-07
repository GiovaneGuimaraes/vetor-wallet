import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-subs-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

function chargeResponse(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        id: 'pix_char_sub_1',
        amount: 990,
        status: 'PENDING',
        brCode: '000201-br-code',
        brCodeBase64: 'data:image/png;base64,AAA',
        expiresAt: '2099-01-01T00:00:00.000Z',
        devMode: true,
        ...over,
      },
      error: null,
      success: true,
    }),
  };
}

describe('subscriptions routes', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let db: typeof import('@vetor-wallet/db').db;
  let monthlyPlanId: number;
  let yearlyPlanId: number;
  let inactivePlanId: number;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: subscriptionsRouter } = await import('./subscriptions');
    const { default: plansRouter } = await import('./plans');
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
      }),
    );
    app.use('/api/auth', authRouter);
    app.use('/api/plans', plansRouter);
    app.use('/api/subscriptions', subscriptionsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'subs-a@test.com', password: 'password123' });

    const plans = await db.execute('SELECT id, code FROM plans');
    monthlyPlanId = Number(
      plans.rows.find((r) => String(r.code) === 'pro_monthly')!.id,
    );
    yearlyPlanId = Number(plans.rows.find((r) => String(r.code) === 'pro_yearly')!.id);

    await db.execute(
      `INSERT INTO plans (code, name, description, price_cents, interval, active)
       VALUES ('legacy_off', 'Legado', '', 500, 'monthly', 0)`,
    );
    const inactive = await db.execute("SELECT id FROM plans WHERE code = 'legacy_off'");
    inactivePlanId = Number(inactive.rows[0].id);
  });

  beforeEach(async () => {
    process.env.ABACATEPAY_API_KEY = 'test-key';
    await db.execute('DELETE FROM pix_charges');
    await db.execute('DELETE FROM subscriptions');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 401 without session', async () => {
    expect((await request(app).get('/api/subscriptions/me')).status).toBe(401);
    expect((await request(app).post('/api/subscriptions').send({ planId: 1 })).status).toBe(401);
  });

  it('lists only active plans, cheapest first', async () => {
    const res = await agentA.get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.map((p: { code: string }) => p.code)).toEqual(['pro_monthly', 'pro_yearly']);
    expect(res.body[0].active).toBe(true);
  });

  it('rejects an invalid planId (400)', async () => {
    expect((await agentA.post('/api/subscriptions').send({})).status).toBe(400);
    expect((await agentA.post('/api/subscriptions').send({ planId: 'x' })).status).toBe(400);
    expect((await agentA.post('/api/subscriptions').send({ planId: 1.5 })).status).toBe(400);
  });

  it('returns 404 for a nonexistent plan', async () => {
    const res = await agentA.post('/api/subscriptions').send({ planId: 99999 });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an inactive plan (indistinguishable from nonexistent)', async () => {
    const res = await agentA.post('/api/subscriptions').send({ planId: inactivePlanId });
    expect(res.status).toBe(404);
  });

  it('creates the charge, stores amount_cents = price_cents and returns brCode/base64/expiresAt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chargeResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });
    expect(res.status).toBe(201);
    expect(res.body.subscription).toMatchObject({ plan_id: monthlyPlanId, status: 'pending' });
    expect(res.body.charge).toMatchObject({
      plan_id: monthlyPlanId,
      amount_cents: 990,
      status: 'PENDING',
      br_code: '000201-br-code',
      br_code_base64: 'data:image/png;base64,AAA',
    });
    expect(res.body.charge.expires_at).toBe('2099-01-01 00:00:00');
    expect(res.body.charge.user_id).toBeUndefined();

    const stored = await db.execute('SELECT * FROM pix_charges');
    expect(stored.rows).toHaveLength(1);
    expect(Number(stored.rows[0].amount_cents)).toBe(990);
    expect(String(stored.rows[0].abacate_charge_id)).toBe('pix_char_sub_1');
  });

  it('sends PIX method, cents amount and metadata to AbacatePay', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chargeResponse());
    vi.stubGlobal('fetch', fetchMock);

    await agentA.post('/api/subscriptions').send({ planId: yearlyPlanId });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.method).toBe('PIX');
    expect(body.data.amount).toBe(9900);
    expect(body.data.metadata.planId).toBe(yearlyPlanId);
    expect(typeof body.data.metadata.userId).toBe('number');
    expect(body.data.externalId).toMatch(/^user:\d+:plan:\d+:\d+$/);
  });

  it('reuses the pending charge on a second POST (no new fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chargeResponse());
    vi.stubGlobal('fetch', fetchMock);

    const first = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });
    const second = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(second.status).toBe(201);
    expect(second.body.charge.id).toBe(first.body.charge.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await db.execute('SELECT * FROM pix_charges')).rows).toHaveLength(1);
  });

  it('returns 409 ALREADY_SUBSCRIBED when the subscription is active', async () => {
    const userRes = await db.execute("SELECT id FROM users WHERE email = 'subs-a@test.com'");
    await db.execute({
      sql: `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
            VALUES (?, ?, 'active', '2099-01-01 00:00:00')`,
      args: [Number(userRes.rows[0].id), monthlyPlanId],
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SUBSCRIBED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 BILLING_NOT_CONFIGURED without an API key', async () => {
    delete process.env.ABACATEPAY_API_KEY;
    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('BILLING_NOT_CONFIGURED');
  });

  it('returns 502 PAYMENT_PROVIDER_ERROR when the provider fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }),
    );

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect((await db.execute('SELECT * FROM pix_charges')).rows).toHaveLength(0);
  });

  it('GET /me returns 200 with nulls when there is no subscription', async () => {
    const res = await agentA.get('/api/subscriptions/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subscription: null, plan: null, pendingCharge: null });
    expect(typeof res.body.billingEnabled).toBe('boolean');
  });

  it("GET /me reports an active-but-lapsed subscription as 'expired' without writing", async () => {
    const userRes = await db.execute("SELECT id FROM users WHERE email = 'subs-a@test.com'");
    await db.execute({
      sql: `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
            VALUES (?, ?, 'active', '2020-01-01 00:00:00')`,
      args: [Number(userRes.rows[0].id), monthlyPlanId],
    });

    const res = await agentA.get('/api/subscriptions/me');
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe('expired');
    expect(res.body.plan.id).toBe(monthlyPlanId);

    const stored = await db.execute('SELECT status FROM subscriptions');
    expect(String(stored.rows[0].status)).toBe('active');
  });
});
