import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { installFakeCognito } from '../auth/__fixtures__/fakeCognito';

const testDbPath = path.join(
  tmpdir(),
  `vetor-wallet-test-subs-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, '/')}`;

// T-106: o cadastro/login destes testes passa pelo AWS Cognito. O pool falso
// abaixo intercepta o `fetch` para o endpoint do Cognito (e SÓ para ele) e
// responde `UserConfirmed: true`, mantendo `POST /api/auth/register` como a
// forma de conseguir uma sessão. Nenhum teste bate na AWS.
installFakeCognito();

/** Envelope `{ data }` da AbacatePay. */
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ data, error: null, success: true }),
});
const fail = (status = 500, error = 'boom') => ({
  ok: false,
  status,
  json: async () => ({ data: null, error, success: false }),
});

interface ProviderCall {
  path: string;
  body: any;
}

/**
 * AbacatePay de mentira por caminho (T-124c): cliente, produto e checkout de
 * assinatura no cartão. `overrides` troca a resposta de um caminho (prefixo).
 */
function installProvider(overrides: Record<string, () => unknown> = {}) {
  const calls: ProviderCall[] = [];
  let customers = 0;
  let checkouts = 0;
  const fn = vi.fn(async (url: string, init: { body?: string } = {}) => {
    const p = String(url).replace(/^https?:\/\/[^/]+\/v2/, '');
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ path: p, body });
    for (const [prefix, respond] of Object.entries(overrides)) {
      if (p.startsWith(prefix)) return respond();
    }
    if (p === '/customers/create') {
      customers += 1;
      return ok({ id: `cust_${customers}` });
    }
    if (p.startsWith('/products/get')) return fail(404, 'Product not found');
    if (p === '/products/create') {
      return ok({ id: `prod_${body.externalId}`, externalId: body.externalId, price: body.price });
    }
    if (p === '/subscriptions/create') {
      checkouts += 1;
      return ok({ id: `bill_${checkouts}`, url: `https://pay.example.com/c/${checkouts}` });
    }
    if (p.startsWith('/subscriptions/checkouts/delete')) return ok({ ok: true });
    throw new Error(`fetch inesperado: ${p}`);
  });
  vi.stubGlobal('fetch', fn);
  const paths = () => calls.map((c) => c.path);
  return { fn, calls, paths };
}

describe('subscriptions routes — POST no cartão (T-124c)', () => {
  let app: Express;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let db: typeof import('@vetor-wallet/db').db;
  let userA: number;
  let userB: number;
  let monthlyPlanId: number;
  let yearlyPlanId: number;
  let inactivePlanId: number;
  let logs: Array<Record<string, any>>;
  const originalOrigin = process.env.ALLOWED_ORIGIN;

  const rowsOf = async (sql: string) => (await db.execute(sql)).rows;
  const events = (name: string) => logs.filter((l) => l.event === name);

  const seedSub = (user: number, over: Record<string, unknown> = {}) => {
    const row = {
      status: 'pending',
      current_period_end: null,
      provider: null,
      abacate_subscription_id: null,
      updated_at: '2026-01-01 00:00:00',
      ...over,
    };
    return db.execute({
      sql: `INSERT INTO subscriptions
              (user_id, plan_id, status, current_period_end, provider, abacate_subscription_id,
               updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user,
        monthlyPlanId,
        row.status as string,
        row.current_period_end as string | null,
        row.provider as string | null,
        row.abacate_subscription_id as string | null,
        row.updated_at as string,
      ],
    });
  };

  const seedCheckout = (user: number, over: Record<string, unknown> = {}) => {
    const row = {
      abacate_checkout_id: null,
      checkout_url: null,
      status: 'OPEN',
      abacate_subscription_id: null,
      completed_at: null,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      ...over,
    };
    return db.execute({
      sql: `INSERT INTO subscription_checkouts
              (user_id, plan_id, abacate_checkout_id, checkout_url, status,
               abacate_subscription_id, completed_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user,
        monthlyPlanId,
        row.abacate_checkout_id as string | null,
        row.checkout_url as string | null,
        row.status as string,
        row.abacate_subscription_id as string | null,
        row.completed_at as string | null,
        row.created_at as string,
      ],
    });
  };

  const seedCustomer = (user: number, id = 'cust_seed') =>
    db.execute({
      sql: 'INSERT INTO billing_customers (user_id, abacate_customer_id) VALUES (?, ?)',
      args: [user, id],
    });

  const userIdOf = async (email: string) => {
    const r = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
    return Number(r.rows[0].id);
  };

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
      })
    );
    app.use('/api/auth', authRouter);
    app.use('/api/plans', plansRouter);
    app.use('/api/subscriptions', subscriptionsRouter);
    app.use(errorHandler);

    agentA = request.agent(app);
    await agentA
      .post('/api/auth/register')
      .send({ email: 'joao.silva+t@example.com', password: 'password123' });
    agentB = request.agent(app);
    await agentB
      .post('/api/auth/register')
      .send({ email: 'subs-b@example.com', password: 'password123' });
    userA = await userIdOf('joao.silva+t@example.com');
    userB = await userIdOf('subs-b@example.com');

    const plans = await db.execute('SELECT id, code FROM plans');
    monthlyPlanId = Number(plans.rows.find((r) => String(r.code) === 'pro_monthly')!.id);
    yearlyPlanId = Number(plans.rows.find((r) => String(r.code) === 'pro_yearly')!.id);

    await db.execute(
      `INSERT INTO plans (code, name, description, price_cents, interval, active)
       VALUES ('legacy_off', 'Legado', '', 500, 'monthly', 0)`
    );
    const inactive = await db.execute("SELECT id FROM plans WHERE code = 'legacy_off'");
    inactivePlanId = Number(inactive.rows[0].id);
  });

  beforeEach(async () => {
    process.env.ABACATEPAY_API_KEY = 'test-key';
    delete process.env.ALLOWED_ORIGIN;
    await db.execute('DELETE FROM subscription_checkouts');
    await db.execute('DELETE FROM billing_customers');
    await db.execute('DELETE FROM pix_charges');
    await db.execute('DELETE FROM subscriptions');
    await db.execute('UPDATE plans SET abacate_product_id = NULL, abacate_product_price_cents = NULL');
    await db.execute({ sql: 'UPDATE users SET name = NULL WHERE id = ?', args: [userA] });

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
    if (originalOrigin === undefined) delete process.env.ALLOWED_ORIGIN;
    else process.env.ALLOWED_ORIGIN = originalOrigin;
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

  it('returns the same 404 for a nonexistent and an inactive plan', async () => {
    const provider = installProvider();
    const missing = await agentA.post('/api/subscriptions').send({ planId: 99999 });
    const inactive = await agentA.post('/api/subscriptions').send({ planId: inactivePlanId });
    expect(missing.status).toBe(404);
    expect(inactive.status).toBe(404);
    expect(inactive.body).toEqual(missing.body);
    expect(provider.fn).not.toHaveBeenCalled();
  });

  it('201: opens the card checkout and returns only the local id and the hosted url', async () => {
    const provider = installProvider();

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(201);
    expect(res.body.subscription).toMatchObject({ plan_id: monthlyPlanId, status: 'pending' });
    expect(res.body.checkout).toEqual({ id: expect.any(Number), url: 'https://pay.example.com/c/1' });
    const text = JSON.stringify(res.body);
    for (const providerId of ['bill_', 'cust_', 'prod_', 'subs_']) {
      expect(text).not.toContain(providerId);
    }

    // Cliente só com e-mail + nome (sem CPF); nome vazio → parte do e-mail, sanitizada.
    const customer = provider.calls.find((c) => c.path === '/customers/create')!;
    expect(customer.body).toEqual({ email: 'joao.silva+t@example.com', name: 'joao silva t' });

    // Checkout: cartão, URLs de volta do env (ausente → default do web em dev).
    const checkout = provider.calls.find((c) => c.path === '/subscriptions/create')!;
    expect(checkout.body).toMatchObject({
      customerId: 'cust_1',
      methods: ['CARD'],
      completionUrl: 'http://localhost:5173/planos?checkout=completed',
      returnUrl: 'http://localhost:5173/planos?checkout=returned',
    });

    const [row] = await rowsOf('SELECT * FROM subscription_checkouts');
    expect(row).toMatchObject({ status: 'OPEN', abacate_checkout_id: 'bill_1' });
    expect(Number(row.id)).toBe(res.body.checkout.id);
    expect((await rowsOf('SELECT abacate_customer_id FROM billing_customers'))[0]).toMatchObject({
      abacate_customer_id: 'cust_1',
    });
    expect((await rowsOf('SELECT * FROM pix_charges')).length).toBe(0);

    expect(events('billing.customer.created')).toEqual([
      expect.objectContaining({ level: 'info', userId: userA }),
    ]);
    expect(events('billing.checkout.created')).toEqual([
      expect.objectContaining({
        level: 'info',
        userId: userA,
        planId: monthlyPlanId,
        reused: false,
        superseded: false,
      }),
    ]);
  });

  it('uses the profile name when there is one', async () => {
    await db.execute({ sql: "UPDATE users SET name = 'Ana Souza' WHERE id = ?", args: [userA] });
    const provider = installProvider();

    await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(provider.calls.find((c) => c.path === '/customers/create')!.body.name).toBe('Ana Souza');
  });

  it('second POST of the same plan reuses the checkout without calling the provider', async () => {
    const provider = installProvider();
    const first = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });
    const callsAfterFirst = provider.fn.mock.calls.length;

    const second = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(second.status).toBe(201);
    expect(second.body.checkout).toEqual(first.body.checkout);
    expect(provider.fn.mock.calls.length).toBe(callsAfterFirst);
    expect(events('billing.customer.reused')).toHaveLength(1);
    expect(events('billing.checkout.created')[1]).toMatchObject({ reused: true });
  });

  it('another plan supersedes the open checkout and reuses the SAME customer', async () => {
    const provider = installProvider();
    const first = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    const second = await agentA.post('/api/subscriptions').send({ planId: yearlyPlanId });

    expect(second.status).toBe(201);
    expect(second.body.checkout.id).not.toBe(first.body.checkout.id);
    expect(second.body.checkout.url).toBe('https://pay.example.com/c/2');
    expect(provider.paths().filter((p) => p === '/customers/create')).toHaveLength(1);
    expect(provider.paths()).toContain('/subscriptions/checkouts/delete?id=bill_1');
    const creates = provider.calls.filter((c) => c.path === '/subscriptions/create');
    expect(creates.map((c) => c.body.customerId)).toEqual(['cust_1', 'cust_1']);

    const statuses = (await rowsOf('SELECT status FROM subscription_checkouts ORDER BY id')).map(
      (r) => r.status
    );
    expect(statuses).toEqual(['SUPERSEDED', 'OPEN']);
    expect(events('billing.checkout.created')[1]).toMatchObject({
      planId: yearlyPlanId,
      reused: false,
      superseded: true,
    });
  });

  it('logs supersededDeleteFailed when the old checkout cannot be deleted (still 201)', async () => {
    installProvider({ '/subscriptions/checkouts/delete': () => fail(500) });
    await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    const res = await agentA.post('/api/subscriptions').send({ planId: yearlyPlanId });

    expect(res.status).toBe(201);
    expect(events('billing.checkout.supersededDeleteFailed')).toEqual([
      expect.objectContaining({ level: 'warn', userId: userA, planId: yearlyPlanId }),
    ]);
  });

  it('503 BILLING_NOT_CONFIGURED without an API key, before creating anything', async () => {
    delete process.env.ABACATEPAY_API_KEY;
    const provider = installProvider();

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('BILLING_NOT_CONFIGURED');
    expect(provider.fn).not.toHaveBeenCalled();
    expect(await rowsOf('SELECT * FROM subscription_checkouts')).toHaveLength(0);
    expect(await rowsOf('SELECT * FROM billing_customers')).toHaveLength(0);
    expect(await rowsOf('SELECT * FROM subscriptions')).toHaveLength(0);
  });

  it.each([
    [
      'card subscription active in the period',
      {
        status: 'active',
        current_period_end: '2099-01-01 00:00:00',
        provider: 'abacatepay_card',
        abacate_subscription_id: 'subs_1',
      },
    ],
    ['legacy Pix active in the period', { status: 'active', current_period_end: '2099-01-01 00:00:00' }],
    [
      'canceled with a paid period ahead',
      {
        status: 'canceled',
        current_period_end: '2099-01-01 00:00:00',
        provider: 'abacatepay_card',
        abacate_subscription_id: 'subs_1',
      },
    ],
  ])('409 ALREADY_SUBSCRIBED: %s — no customer, no checkout', async (_l, sub) => {
    await seedSub(userA, sub);
    const provider = installProvider();

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SUBSCRIBED');
    expect(provider.fn).not.toHaveBeenCalled();
    expect(await rowsOf('SELECT * FROM billing_customers')).toHaveLength(0);
    expect(await rowsOf('SELECT * FROM subscription_checkouts')).toHaveLength(0);
    expect(events('billing.checkout.refused')).toEqual([
      expect.objectContaining({ userId: userA, reason: 'ALREADY_SUBSCRIBED' }),
    ]);
  });

  it('legacy Pix already expired can subscribe on the card', async () => {
    await seedSub(userA, { status: 'active', current_period_end: '2020-01-01 00:00:00' });
    installProvider();

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(201);
    expect(res.body.subscription.status).toBe('pending');
  });

  it('409 CHECKOUT_IN_PROGRESS while another click is creating a checkout', async () => {
    await seedCustomer(userA);
    await seedCheckout(userA, { status: 'CREATING' });
    const provider = installProvider();

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHECKOUT_IN_PROGRESS');
    expect(provider.paths()).not.toContain('/subscriptions/create');
  });

  it('409 ACTIVATION_PENDING when a paid checkout has not become a subscription yet', async () => {
    await seedSub(userA, { status: 'pending', updated_at: '2026-01-01 00:00:00' });
    await seedCheckout(userA, {
      status: 'COMPLETED',
      abacate_checkout_id: 'bill_paid',
      abacate_subscription_id: 'subs_paid',
      completed_at: '2026-01-02 00:00:00',
    });
    const provider = installProvider();

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACTIVATION_PENDING');
    expect(provider.fn).not.toHaveBeenCalled();
  });

  it('502 PAYMENT_PROVIDER_ERROR when the checkout fails; logs providerStatus, row FAILED', async () => {
    installProvider({ '/subscriptions/create': () => fail(500) });

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect((await rowsOf('SELECT status FROM subscription_checkouts'))[0].status).toBe('FAILED');
    expect(events('billing.checkout.failed')).toEqual([
      expect.objectContaining({
        level: 'warn',
        userId: userA,
        planId: monthlyPlanId,
        providerStatus: 500,
      }),
    ]);
  });

  it('502 PAYMENT_PROVIDER_ERROR when creating the customer fails (nothing local is written)', async () => {
    installProvider({ '/customers/create': () => fail(0) });

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(502);
    expect(await rowsOf('SELECT * FROM billing_customers')).toHaveLength(0);
    expect(await rowsOf('SELECT * FROM subscription_checkouts')).toHaveLength(0);
  });

  it('502 BILLING_NOT_CONFIGURED when the provider product has another price', async () => {
    installProvider({
      '/products/get': () => ok({ id: 'prod_x', externalId: 'pro_monthly:990', price: 1 }),
    });

    const res = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('BILLING_NOT_CONFIGURED');
  });

  it('ALLOWED_ORIGIN with a list: return URLs use the first valid origin', async () => {
    process.env.ALLOWED_ORIGIN = 'https://app.example.com/ignored, https://other.example.com';
    const provider = installProvider();

    await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(provider.calls.find((c) => c.path === '/subscriptions/create')!.body).toMatchObject({
      completionUrl: 'https://app.example.com/planos?checkout=completed',
      returnUrl: 'https://app.example.com/planos?checkout=returned',
    });
  });

  it('return URLs never come from the request', async () => {
    const provider = installProvider();

    await agentA
      .post('/api/subscriptions')
      .set('Origin', 'https://evil.example.net')
      .set('Referer', 'https://evil.example.net/x')
      .send({ planId: monthlyPlanId, completionUrl: 'https://evil.example.net/' });

    const body = provider.calls.find((c) => c.path === '/subscriptions/create')!.body;
    expect(JSON.stringify(body)).not.toContain('evil');
  });

  it("isolates users: B's subscription does not reuse A's checkout or customer", async () => {
    const provider = installProvider();
    const a = await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    const b = await agentB.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(b.status).toBe(201);
    expect(b.body.checkout.id).not.toBe(a.body.checkout.id);
    expect(provider.paths().filter((p) => p === '/customers/create')).toHaveLength(2);
    const rows = await rowsOf('SELECT user_id, abacate_customer_id FROM billing_customers');
    expect(rows.map((r) => [Number(r.user_id), r.abacate_customer_id])).toEqual(
      expect.arrayContaining([
        [userA, 'cust_1'],
        [userB, 'cust_2'],
      ])
    );
    expect(rows).toHaveLength(2);
    const meB = await agentB.get('/api/subscriptions/me');
    expect(meB.body.pendingCheckout.url).toBe(b.body.checkout.url);
  });

  it('billing logs carry no sensitive field and no provider ids', async () => {
    let failCheckout = false;
    installProvider({
      '/subscriptions/create': () =>
        failCheckout ? fail(400) : ok({ id: 'bill_x', url: 'https://pay.example.com/c/x' }),
    });
    await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });
    failCheckout = true;
    const failed = await agentB.post('/api/subscriptions').send({ planId: monthlyPlanId });
    expect(failed.status).toBe(502);
    await agentA.post('/api/subscriptions').send({ planId: monthlyPlanId });

    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line.redacted).toBeUndefined();
      const text = JSON.stringify(line);
      for (const forbidden of ['subs_', 'bill_', 'cust_', 'prod_', 'example.com']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  it('GET /me returns 200 with nulls and no pendingCharge when there is no subscription', async () => {
    const res = await agentA.get('/api/subscriptions/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subscription: null, plan: null, pendingCheckout: null });
    expect('pendingCharge' in res.body).toBe(false);
    expect(typeof res.body.billingEnabled).toBe('boolean');
  });

  it("GET /me reports an active-but-lapsed subscription as 'expired' without writing", async () => {
    await seedSub(userA, { status: 'active', current_period_end: '2020-01-01 00:00:00' });

    const res = await agentA.get('/api/subscriptions/me');
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe('expired');
    expect(res.body.plan.id).toBe(monthlyPlanId);

    const stored = await db.execute('SELECT status FROM subscriptions');
    expect(String(stored.rows[0].status)).toBe('active');
  });

  it('the Pix routes are no longer mounted (/api/pix-charges, /api/billing/simulate)', () => {
    // O entry sobe o servidor ao ser importado; a guarda é sobre a montagem.
    // A prova em runtime (404 no app de verdade) vai na evidência da T-124c.
    const entry = readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
    expect(entry).not.toMatch(/['"]\/api\/pix-charges['"]/);
    expect(entry).not.toMatch(/['"]\/api\/billing['"]/);
    expect(entry).not.toMatch(/pixCharges|billingSimulate/);
  });
});
