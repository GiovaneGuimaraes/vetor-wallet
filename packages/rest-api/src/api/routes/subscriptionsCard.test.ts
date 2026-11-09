import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-subs-card-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

installFakeCognito();

/** Envelope `{ data }` da AbacatePay. */
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ data, error: null, success: true }),
});
const fail = (status = 500) => ({
  ok: false,
  status,
  json: async () => ({ data: null, error: 'boom', success: false }),
});

/** Provedor de mentira por caminho (sem a base); caminho sem resposta lança. */
function routeProvider(handler: (path: string, body: any) => unknown) {
  const fn = vi.fn(async (url: string, init: { body?: string }) => {
    const p = String(url).replace(/^https?:\/\/[^/]+\/v2/, '');
    const res = handler(p, init.body === undefined ? undefined : JSON.parse(init.body));
    if (res === undefined) throw new Error(`fetch inesperado: ${p}`);
    return res;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const SUB = (over: Record<string, unknown> = {}) => ({
  id: 'subs_new',
  checkoutId: 'bill_open',
  status: 'ACTIVE',
  ...over,
});

describe('subscriptions card routes (T-124b2)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let db: typeof import('@vetor-wallet/db').db;
  let userA: number;
  let userB: number;
  let monthlyPlanId: number;
  let logs: Array<Record<string, any>>;

  const userId = async (email: string) => {
    const r = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
    return Number(r.rows[0].id);
  };

  const seedSub = (user: number, over: Record<string, unknown> = {}) => {
    const row = {
      status: 'pending',
      current_period_end: null,
      provider: null,
      abacate_subscription_id: null,
      ...over,
    };
    return db.execute({
      sql: `INSERT INTO subscriptions
              (user_id, plan_id, status, current_period_end, provider, abacate_subscription_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        user,
        monthlyPlanId,
        row.status as string,
        row.current_period_end as string | null,
        row.provider as string | null,
        row.abacate_subscription_id as string | null,
      ],
    });
  };

  const seedCheckout = (user: number, over: Record<string, unknown> = {}) => {
    const row = {
      abacate_checkout_id: 'bill_open',
      checkout_url: 'https://pay.example.com/c/open1',
      status: 'OPEN',
      abacate_subscription_id: null,
      completed_at: null,
      ...over,
    };
    return db.execute({
      sql: `INSERT INTO subscription_checkouts
              (user_id, plan_id, abacate_checkout_id, checkout_url, status,
               abacate_subscription_id, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user,
        monthlyPlanId,
        row.abacate_checkout_id as string,
        row.checkout_url as string,
        row.status as string,
        row.abacate_subscription_id as string | null,
        row.completed_at as string | null,
      ],
    });
  };

  const seedCustomer = (user: number, id = 'cust_a') => {
    return db.execute({
      sql: 'INSERT INTO billing_customers (user_id, abacate_customer_id) VALUES (?, ?)',
      args: [user, id],
    });
  };

  const rowsOf = async (sql: string) => (await db.execute(sql)).rows;

  beforeAll(async () => {
    const dbModule = await import('@vetor-wallet/db');
    const { default: authRouter } = await import('../auth/router');
    const { default: subscriptionsRouter } = await import('./subscriptions');
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
    app.use('/api/subscriptions', subscriptionsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'card-a@example.com', password: 'password123' });
    agentB = request.agent(app);
    await agentB
      .post('/api/auth/register')
      .send({ email: 'card-b@example.com', password: 'password123' });
    userA = await userId('card-a@example.com');
    userB = await userId('card-b@example.com');

    const plans = await db.execute('SELECT id, code FROM plans');
    monthlyPlanId = Number(plans.rows.find((r) => String(r.code) === 'pro_monthly')!.id);
  });

  beforeEach(async () => {
    process.env.ABACATEPAY_API_KEY = 'test-key';
    await db.execute('DELETE FROM subscription_checkouts');
    await db.execute('DELETE FROM billing_customers');
    await db.execute('DELETE FROM pix_charges');
    await db.execute('DELETE FROM subscriptions');

    logs = [];
    const capture = (c: unknown[]) => {
      try {
        const parsed = JSON.parse(String(c[0]));
        if (String(parsed.event).startsWith('billing.')) logs.push(parsed);
      } catch {
        /* linha que não é do logger */
      }
    };
    vi.spyOn(console, 'log').mockImplementation((...a) => capture(a));
    vi.spyOn(console, 'error').mockImplementation((...a) => capture(a));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const events = (name: string) => logs.filter((l) => l.event === name);

  it('401 without session', async () => {
    expect((await request(app).post('/api/subscriptions/sync')).status).toBe(401);
    expect((await request(app).post('/api/subscriptions/portal')).status).toBe(401);
  });

  it('sync with nothing to reconcile is 200, equals /me and never calls the provider', async () => {
    const fetchMock = routeProvider(() => undefined);

    const sync = await agentA.post('/api/subscriptions/sync');
    const me = await agentA.get('/api/subscriptions/me');

    expect(sync.status).toBe(200);
    expect(sync.body).toEqual(me.body);
    expect(sync.body.providerUnavailable).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sync activates a paid OPEN checkout once; a repeat within the throttle skips the provider', async () => {
    await seedSub(userA);
    await seedCheckout(userA);
    const fetchMock = routeProvider((p) =>
      p.startsWith('/subscriptions/list?checkoutId=bill_open') ? ok([SUB()]) : undefined
    );

    const first = await agentA.post('/api/subscriptions/sync');
    expect(first.status).toBe(200);
    expect(first.body.subscription).toMatchObject({
      status: 'active',
      provider: 'abacatepay_card',
      provider_status: 'ACTIVE',
    });
    expect(first.body.pendingCheckout).toBeNull();
    const end = first.body.subscription.current_period_end;
    expect(new Date(end.replace(' ', 'T') + 'Z').getTime()).toBeGreaterThan(Date.now());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const applied = events('billing.sync').find((l) => l.applied === true);
    expect(applied).toMatchObject({ level: 'info', userId: userA, transition: 'activate' });

    const second = await agentA.post('/api/subscriptions/sync');
    expect(second.status).toBe(200);
    expect(second.body.subscription.current_period_end).toBe(end);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (await rowsOf('SELECT status FROM subscription_checkouts WHERE user_id = ' + userA))[0].status
    ).toBe('COMPLETED');
  });

  it('sync reports providerUnavailable and keeps the local state when the provider is down', async () => {
    await seedSub(userA);
    await seedCheckout(userA);
    routeProvider(() => fail(500));

    const res = await agentA.post('/api/subscriptions/sync');

    expect(res.status).toBe(200);
    expect(res.body.providerUnavailable).toBe(true);
    expect(res.body.subscription.status).toBe('pending');
    expect(res.body.pendingCheckout).toMatchObject({ url: 'https://pay.example.com/c/open1' });
    expect(events('billing.sync')).toContainEqual(
      expect.objectContaining({ level: 'warn', reason: 'provider_unavailable', userId: userA })
    );
  });

  it('sync with a duplicate cancels the newer subscription, rereads to confirm and logs', async () => {
    await seedSub(userA, {
      status: 'active',
      current_period_end: '2099-01-01 00:00:00',
      provider: 'abacatepay_card',
      abacate_subscription_id: 'subs_old',
    });
    await seedCheckout(userA);
    let cancelled = false;
    const fetchMock = routeProvider((p, body) => {
      if (p.startsWith('/subscriptions/list?checkoutId=')) return ok([SUB()]);
      if (p === '/subscriptions/cancel') {
        expect(body).toEqual({ id: 'subs_new' });
        cancelled = true;
        return ok(null);
      }
      if (p === '/subscriptions/get?id=subs_new') {
        return ok(SUB({ status: cancelled ? 'CANCELLED' : 'ACTIVE' }));
      }
      if (p === '/subscriptions/get?id=subs_old') return ok(SUB({ id: 'subs_old' }));
      return undefined;
    });

    const res = await agentA.post('/api/subscriptions/sync');

    expect(res.status).toBe(200);
    expect(cancelled).toBe(true);
    // a assinatura gravada continua a ANTIGA, com o período intocado
    expect(res.body.subscription.current_period_end).toBe('2099-01-01 00:00:00');
    const paths = fetchMock.mock.calls.map((c) =>
      String(c[0]).replace(/^https?:\/\/[^/]+\/v2/, '')
    );
    expect(paths.indexOf('/subscriptions/cancel')).toBeLessThan(
      paths.lastIndexOf('/subscriptions/get?id=subs_new')
    );
    expect(events('billing.subscription.duplicate')).toEqual([
      expect.objectContaining({
        level: 'warn',
        userId: userA,
        cancelConfirmed: true,
        providerStatus: 'CANCELLED',
      }),
    ]);
    expect(events('billing.subscription.duplicate_cancel_unconfirmed')).toHaveLength(0);
  });

  it('sync logs an error but still answers 200 when the cancel is not confirmed', async () => {
    await seedSub(userA, {
      status: 'active',
      current_period_end: '2099-01-01 00:00:00',
      provider: 'abacatepay_card',
      abacate_subscription_id: 'subs_old',
    });
    await seedCheckout(userA);
    routeProvider((p) => {
      if (p.startsWith('/subscriptions/list?checkoutId=')) return ok([SUB()]);
      if (p === '/subscriptions/cancel') return ok(null);
      if (p === '/subscriptions/get?id=subs_new') return ok(SUB()); // segue ACTIVE
      if (p === '/subscriptions/get?id=subs_old') return ok(SUB({ id: 'subs_old' }));
      return undefined;
    });

    const res = await agentA.post('/api/subscriptions/sync');

    expect(res.status).toBe(200);
    expect(events('billing.subscription.duplicate')[0]).toMatchObject({ cancelConfirmed: false });
    expect(events('billing.subscription.duplicate_cancel_unconfirmed')).toEqual([
      expect.objectContaining({ level: 'error', userId: userA, providerStatus: 'ACTIVE' }),
    ]);
  });

  it('sync logs the unconfirmed error when the cancel call itself fails', async () => {
    await seedSub(userA, {
      status: 'active',
      current_period_end: '2099-01-01 00:00:00',
      provider: 'abacatepay_card',
      abacate_subscription_id: 'subs_old',
    });
    await seedCheckout(userA);
    routeProvider((p) => {
      if (p.startsWith('/subscriptions/list?checkoutId=')) return ok([SUB()]);
      if (p === '/subscriptions/cancel') return fail(500);
      if (p === '/subscriptions/get?id=subs_old') return ok(SUB({ id: 'subs_old' }));
      return undefined;
    });

    const res = await agentA.post('/api/subscriptions/sync');

    expect(res.status).toBe(200);
    expect(events('billing.subscription.duplicate_cancel_unconfirmed')).toHaveLength(1);
  });

  it('GET /me never writes and keeps pendingCharge', async () => {
    await seedSub(userA);
    await seedCheckout(userA);
    await seedCustomer(userA);
    await db.execute({
      sql: `INSERT INTO pix_charges (user_id, plan_id, abacate_charge_id, amount_cents, status,
              br_code, br_code_base64, expires_at)
            VALUES (?, ?, 'pix_x', 990, 'PENDING', 'br', 'b64', '2099-01-01 00:00:00')`,
      args: [userA, monthlyPlanId],
    });
    const snapshot = async () =>
      JSON.stringify([
        await rowsOf('SELECT * FROM subscriptions'),
        await rowsOf('SELECT * FROM subscription_checkouts'),
        await rowsOf('SELECT * FROM billing_customers'),
        await rowsOf('SELECT * FROM pix_charges'),
      ]);
    const before = await snapshot();
    const fetchMock = routeProvider(() => undefined);

    const res = await agentA.get('/api/subscriptions/me');

    expect(res.status).toBe(200);
    expect(res.body.pendingCharge).toMatchObject({ amount_cents: 990, status: 'PENDING' });
    expect(await snapshot()).toBe(before);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GET /me exposes pendingCheckout (url only), confirming and the card fields', async () => {
    await seedSub(userA, {
      status: 'active',
      current_period_end: '2099-01-01 00:00:00',
      provider: 'abacatepay_card',
      abacate_subscription_id: 'subs_secret',
    });
    await seedCheckout(userA);

    const res = await agentA.get('/api/subscriptions/me');

    expect(res.body.pendingCheckout).toEqual({
      url: 'https://pay.example.com/c/open1',
      plan_id: monthlyPlanId,
      created_at: expect.any(String),
    });
    expect(res.body.confirming).toBe(false);
    expect(res.body.subscription).toMatchObject({
      provider: 'abacatepay_card',
      provider_status: null,
      canceled_at: null,
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('bill_');
    expect(text).not.toContain('subs_');
  });

  it('GET /me: legacy Pix subscription has null provider fields', async () => {
    await seedSub(userA, { status: 'active', current_period_end: '2099-01-01 00:00:00' });

    const res = await agentA.get('/api/subscriptions/me');

    expect(res.body.subscription).toMatchObject({
      provider: null,
      provider_status: null,
      canceled_at: null,
    });
    expect(res.body.pendingCheckout).toBeNull();
    expect(res.body.confirming).toBe(false);
  });

  it('GET /me reports confirming when a paid checkout never became a subscription', async () => {
    await seedSub(userA); // pending, sem subs_
    await seedCheckout(userA, {
      status: 'COMPLETED',
      abacate_subscription_id: 'subs_paid',
      completed_at: '2099-01-01 00:00:00',
    });

    const res = await agentA.get('/api/subscriptions/me');

    expect(res.body.confirming).toBe(true);
    expect(res.body.pendingCheckout).toBeNull();
  });

  describe('POST /portal', () => {
    it('404 NO_CARD_SUBSCRIPTION without a customer', async () => {
      const res = await agentA.post('/api/subscriptions/portal');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_CARD_SUBSCRIPTION');
    });

    it('404 NO_CARD_SUBSCRIPTION with a customer but no checkout', async () => {
      await seedCustomer(userA);
      const res = await agentA.post('/api/subscriptions/portal');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_CARD_SUBSCRIPTION');
    });

    it('503 BILLING_NOT_CONFIGURED without an API key', async () => {
      await seedCustomer(userA);
      await seedCheckout(userA);
      delete process.env.ABACATEPAY_API_KEY;
      const res = await agentA.post('/api/subscriptions/portal');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('BILLING_NOT_CONFIGURED');
    });

    it('502 PAYMENT_PROVIDER_ERROR and logs billing.portal.failed with the provider status', async () => {
      await seedCustomer(userA);
      await seedCheckout(userA);
      routeProvider(() => fail(500));

      const res = await agentA.post('/api/subscriptions/portal');

      expect(res.status).toBe(502);
      expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
      expect(events('billing.portal.failed')).toEqual([
        expect.objectContaining({ level: 'warn', userId: userA, providerStatus: 500 }),
      ]);
    });

    it('200 { url } using the customer and the COMPLETED checkout of the user', async () => {
      await seedCustomer(userA, 'cust_mine');
      await seedCheckout(userA, {
        abacate_checkout_id: 'bill_done',
        status: 'COMPLETED',
        abacate_subscription_id: 'subs_1',
        completed_at: '2026-01-01 00:00:00',
      });
      await seedCheckout(userA, { abacate_checkout_id: 'bill_open' }); // mais novo, mas OPEN
      const fetchMock = routeProvider((p, body) => {
        if (p !== '/customer-portal/create') return undefined;
        expect(body).toEqual({ customerId: 'cust_mine', checkoutId: 'bill_done' });
        return ok({ url: 'https://portal.example.com/s' });
      });

      const res = await agentA.post('/api/subscriptions/portal');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ url: 'https://portal.example.com/s' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('isolates users: B sees nothing of the checkout and customer of A', async () => {
    await seedSub(userA);
    await seedCheckout(userA);
    await seedCustomer(userA);
    const fetchMock = routeProvider(() => undefined);

    const me = await agentB.get('/api/subscriptions/me');
    const portal = await agentB.post('/api/subscriptions/portal');
    const sync = await agentB.post('/api/subscriptions/sync');

    expect(userB).not.toBe(userA);
    expect(me.body.pendingCheckout).toBeNull();
    expect(me.body.subscription).toBeNull();
    expect(portal.status).toBe(404);
    expect(sync.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('billing logs carry no sensitive field and no provider ids', async () => {
    await seedSub(userA, {
      status: 'active',
      current_period_end: '2099-01-01 00:00:00',
      provider: 'abacatepay_card',
      abacate_subscription_id: 'subs_old',
    });
    await seedCheckout(userA);
    await seedCustomer(userA);
    routeProvider((p) => {
      if (p.startsWith('/subscriptions/list?checkoutId=')) return ok([SUB()]);
      if (p === '/subscriptions/cancel') return ok(null);
      if (p === '/subscriptions/get?id=subs_new') return ok(SUB({ status: 'CANCELLED' }));
      if (p === '/subscriptions/get?id=subs_old') return ok(SUB({ id: 'subs_old' }));
      if (p === '/customer-portal/create') return fail(400);
      return undefined;
    });

    await agentA.post('/api/subscriptions/sync');
    await agentA.post('/api/subscriptions/portal');

    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line.redacted).toBeUndefined();
      const text = JSON.stringify(line);
      for (const forbidden of ['subs_', 'bill_', 'cust_', 'example.com']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});
