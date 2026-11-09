import type { QueryConfig } from '@vetor-wallet/query';

import { ActivationPendingError } from 'src/ActivationPendingError';
import { AlreadySubscribedError } from 'src/AlreadySubscribedError';
import { CheckoutInProgressError } from 'src/CheckoutInProgressError';
import { STALE_CREATING_MS, startCardCheckout } from 'src/startCardCheckout';
import {
  createFakeBillingDb,
  type FakeBillingDb,
  fakeCheckout,
  fakePlan,
  fakeSubscription,
} from 'tests/unit/fakeBillingDb';
import {
  calledPaths,
  errorEnvelope,
  mockFetch,
  okEnvelope,
  routeFetch,
} from 'tests/unit/mockFetch';

const NOW = '2026-11-08 12:00:00';
const USER = 7;

/** Provedor feliz: produto não existe, cria; checkout `bill_N` sequencial. */
const happyProvider = (fetchMock: jest.Mock) => {
  let seq = 0;
  routeFetch(fetchMock, (path, body) => {
    if (path.startsWith('/products/get')) return errorEnvelope('Product not found', 404);
    if (path === '/products/create') {
      return okEnvelope({ id: 'prod_1', externalId: body.externalId, price: body.price });
    }
    if (path === '/subscriptions/create') {
      seq += 1;
      return okEnvelope({ id: `bill_new_${seq}`, url: `https://pay.example.com/new_${seq}` });
    }
    if (path.startsWith('/subscriptions/checkouts/delete')) return okEnvelope({ ok: true });
    return undefined;
  });
};

const start = (db: FakeBillingDb, over: { planId?: number; nowIso?: string } = {}) => {
  const plan = db.state.plans.find((p) => p.id === (over.planId ?? 1))!;
  return startCardCheckout({
    query: db.query,
    userId: USER,
    plan: { ...plan },
    customerId: 'cust_1',
    completionUrl: 'http://localhost:5173/planos?checkout=completed',
    returnUrl: 'http://localhost:5173/planos?checkout=returned',
    nowIso: over.nowIso ?? NOW,
  });
};

/** Envolve a query do fake para forçar uma resposta numa instrução específica. */
const override = (
  db: FakeBillingDb,
  match: string,
  respond: () => { rows: unknown[]; rowCount: number },
  times = Infinity
) => {
  const inner = db.query.getMockImplementation()!;
  let left = times;
  db.query.mockImplementation(async (config: QueryConfig) => {
    if (left > 0 && config.text.includes(match)) {
      left -= 1;
      return respond();
    }
    return inner(config);
  });
};

describe('startCardCheckout', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    happyProvider(fetchMock);
  });

  test('cria: linha local ANTES do provedor, externalId com o id local, OPEN com bill_ e url', async () => {
    const db = createFakeBillingDb();

    const res = await start(db);

    expect(res).toEqual({
      checkoutId: 1,
      abacateCheckoutId: 'bill_new_1',
      url: 'https://pay.example.com/new_1',
      planId: 1,
      reused: false,
      supersededCheckoutId: null,
      supersededDeleteFailed: false,
    });
    expect(db.state.checkouts).toEqual([
      expect.objectContaining({
        id: 1,
        user_id: USER,
        plan_id: 1,
        status: 'OPEN',
        abacate_checkout_id: 'bill_new_1',
        checkout_url: 'https://pay.example.com/new_1',
        created_at: NOW,
      }),
    ]);
    const createCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/subscriptions/create')
    )!;
    expect(JSON.parse(createCall[1].body)).toEqual({
      items: [{ id: 'prod_1', quantity: 1 }],
      customerId: 'cust_1',
      externalId: 'checkout:1',
      methods: ['CARD'],
      completionUrl: 'http://localhost:5173/planos?checkout=completed',
      returnUrl: 'http://localhost:5173/planos?checkout=returned',
    });
    // Produto gravado no plano.
    expect(db.state.plans[0]).toMatchObject({
      abacate_product_id: 'prod_1',
      abacate_product_price_cents: 1990,
    });
  });

  test('cria a linha pending em subscriptions (sem provider_status)', async () => {
    const db = createFakeBillingDb();

    await start(db);

    expect(db.state.subscriptions).toEqual([
      expect.objectContaining({
        user_id: USER,
        plan_id: 1,
        status: 'pending',
        provider_status: null,
      }),
    ]);
  });

  test('assinatura vencida (Pix legado) vira pending com o plano novo', async () => {
    const db = createFakeBillingDb({
      plans: [fakePlan(), fakePlan({ id: 2, code: 'pro_yearly', interval: 'yearly' })],
      subscriptions: [
        fakeSubscription({
          status: 'active',
          plan_id: 2,
          current_period_end: '2026-10-01 00:00:00',
        }),
      ],
    });

    await start(db);

    expect(db.state.subscriptions[0]).toMatchObject({ status: 'pending', plan_id: 1 });
  });

  test('cancelada de cartão já vencida pode assinar de novo', async () => {
    const db = createFakeBillingDb({
      subscriptions: [
        fakeSubscription({
          status: 'canceled',
          current_period_end: '2026-11-01 00:00:00',
          abacate_subscription_id: 'subs_old',
          provider_status: 'CANCELLED',
        }),
      ],
    });

    const res = await start(db);

    expect(res.reused).toBe(false);
    expect(db.state.subscriptions[0]).toMatchObject({
      status: 'pending',
      provider_status: 'CANCELLED',
    });
  });

  test.each([
    [
      'cartão ativo no período',
      {
        status: 'active',
        current_period_end: '2026-12-01 00:00:00',
        abacate_subscription_id: 'subs_1',
      },
    ],
    [
      'Pix legado (provider NULL) ativo no período',
      { status: 'active', current_period_end: '2026-12-01 00:00:00' },
    ],
    [
      'Pix legado marcado pix_legacy',
      { status: 'active', provider: 'pix_legacy', current_period_end: '2026-12-01 00:00:00' },
    ],
    [
      'cancelada com período pago',
      {
        status: 'canceled',
        current_period_end: '2026-12-01 00:00:00',
        abacate_subscription_id: 'subs_1',
      },
    ],
    [
      'cartão active VENCIDO localmente (pode estar cobrando)',
      {
        status: 'active',
        current_period_end: '2026-10-01 00:00:00',
        abacate_subscription_id: 'subs_1',
      },
    ],
  ])('%s → AlreadySubscribedError, sem tocar provedor nem checkout', async (_l, sub) => {
    const db = createFakeBillingDb({ subscriptions: [fakeSubscription(sub)] });
    const before = JSON.stringify(db.state);

    await expect(start(db)).rejects.toBeInstanceOf(AlreadySubscribedError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(db.state)).toBe(before);
  });

  test('checkout PAGO sem assinatura gravada → ActivationPendingError (é AlreadySubscribed); não abre outro', async () => {
    const db = createFakeBillingDb({
      checkouts: [
        fakeCheckout({
          status: 'COMPLETED',
          abacate_subscription_id: 'subs_9',
          completed_at: '2026-11-08 11:30:00',
        }),
      ],
      subscriptions: [fakeSubscription({ status: 'pending', updated_at: '2026-11-08 11:00:00' })],
    });

    const err = await start(db).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ActivationPendingError);
    expect(err).toBeInstanceOf(AlreadySubscribedError);
    expect((err as Error).name).toBe('ActivationPendingError');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.state.checkouts).toHaveLength(1);
  });

  test('COMPLETED antigo (histórico, antes do pending atual) NÃO bloqueia', async () => {
    const db = createFakeBillingDb({
      checkouts: [
        fakeCheckout({
          status: 'COMPLETED',
          abacate_subscription_id: 'subs_old_dup',
          completed_at: '2026-10-01 00:00:00',
        }),
      ],
      subscriptions: [
        fakeSubscription({
          status: 'pending',
          abacate_subscription_id: 'subs_old',
          updated_at: '2026-11-01 00:00:00',
        }),
      ],
    });

    expect((await start(db)).reused).toBe(false);
  });

  test('reaproveita o OPEN do MESMO plano sem chamar o provedor', async () => {
    const db = createFakeBillingDb({ checkouts: [fakeCheckout({ id: 4 })] });

    const res = await start(db);

    expect(res).toEqual({
      checkoutId: 4,
      abacateCheckoutId: 'bill_1',
      url: 'https://pay.example.com/bill_1',
      planId: 1,
      reused: true,
      supersededCheckoutId: null,
      supersededDeleteFailed: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.state.checkouts).toHaveLength(1);
  });

  test('OPEN de OUTRO plano → SUPERSEDED, apagado no provedor, checkout novo', async () => {
    const db = createFakeBillingDb({
      plans: [fakePlan(), fakePlan({ id: 2, code: 'pro_yearly', interval: 'yearly' })],
      checkouts: [fakeCheckout({ id: 4, plan_id: 2, abacate_checkout_id: 'bill_old' })],
    });

    const res = await start(db);

    expect(res).toMatchObject({
      reused: false,
      supersededCheckoutId: 'bill_old',
      supersededDeleteFailed: false,
    });
    expect(db.state.checkouts.find((c) => c.id === 4)?.status).toBe('SUPERSEDED');
    expect(db.state.checkouts.find((c) => c.id === 5)?.status).toBe('OPEN');
    expect(calledPaths(fetchMock)).toContain('/subscriptions/checkouts/delete?id=bill_old');
  });

  test('apagar o checkout antigo falhando NÃO impede o novo', async () => {
    routeFetch(fetchMock, (path, body) => {
      if (path.startsWith('/subscriptions/checkouts/delete')) return errorEnvelope('boom', 500);
      if (path.startsWith('/products/get')) return errorEnvelope('Product not found', 404);
      if (path === '/products/create') return okEnvelope({ id: 'prod_1', price: body.price });
      if (path === '/subscriptions/create')
        return okEnvelope({ id: 'bill_new', url: 'https://pay.example.com/n' });
      return undefined;
    });
    const db = createFakeBillingDb({
      plans: [fakePlan(), fakePlan({ id: 2, code: 'pro_yearly', interval: 'yearly' })],
      checkouts: [fakeCheckout({ id: 4, plan_id: 2, abacate_checkout_id: 'bill_old' })],
    });

    const res = await start(db);

    expect(res).toMatchObject({
      abacateCheckoutId: 'bill_new',
      supersededCheckoutId: 'bill_old',
      supersededDeleteFailed: true,
    });
  });

  test('OPEN do mesmo plano mas sem url (linha torta) não é reaproveitado', async () => {
    const db = createFakeBillingDb({ checkouts: [fakeCheckout({ id: 4, checkout_url: null })] });

    const res = await start(db);

    expect(res).toMatchObject({ reused: false, supersededCheckoutId: 'bill_1' });
  });

  test('OPEN sem bill_ (linha torta) vira SUPERSEDED sem chamada de delete', async () => {
    const db = createFakeBillingDb({
      checkouts: [fakeCheckout({ id: 4, plan_id: 2, abacate_checkout_id: null })],
      plans: [fakePlan(), fakePlan({ id: 2, code: 'pro_yearly' })],
    });

    const res = await start(db);

    expect(res.supersededCheckoutId).toBeNull();
    expect(calledPaths(fetchMock).some((p) => p.includes('checkouts/delete'))).toBe(false);
  });

  test('OPEN que mudou no meio (SUPERSEDED com rowCount 0) não é apagado no provedor', async () => {
    const db = createFakeBillingDb({
      plans: [fakePlan(), fakePlan({ id: 2, code: 'pro_yearly' })],
      checkouts: [
        fakeCheckout({ id: 4, plan_id: 2, abacate_checkout_id: 'bill_old', status: 'OPEN' }),
      ],
    });
    override(db, "SET status = 'SUPERSEDED'", () => {
      // Simula a ativação concorrente: o checkout virou COMPLETED antes.
      db.state.checkouts[0].status = 'COMPLETED';
      return { rows: [], rowCount: 0 };
    });

    const res = await start(db);

    expect(res.supersededCheckoutId).toBeNull();
    expect(calledPaths(fetchMock).some((p) => p.includes('checkouts/delete'))).toBe(false);
  });

  test(`CREATING com mais de ${STALE_CREATING_MS / 60000} min é descartado (FAILED) e um novo nasce`, async () => {
    const db = createFakeBillingDb({
      checkouts: [
        fakeCheckout({
          id: 4,
          status: 'CREATING',
          abacate_checkout_id: null,
          created_at: '2026-11-08 11:57:59',
        }),
      ],
    });

    const res = await start(db);

    expect(db.state.checkouts.find((c) => c.id === 4)?.status).toBe('FAILED');
    expect(res).toMatchObject({ checkoutId: 5, reused: false });
  });

  test('CREATING recente (outro clique em andamento) → CheckoutInProgressError, sem provedor', async () => {
    const db = createFakeBillingDb({
      checkouts: [
        fakeCheckout({
          id: 4,
          status: 'CREATING',
          abacate_checkout_id: null,
          created_at: '2026-11-08 11:58:00',
        }),
      ],
    });

    await expect(start(db)).rejects.toBeInstanceOf(CheckoutInProgressError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.state.checkouts).toHaveLength(1);
  });

  test('DOIS cliques simultâneos: um checkout, o outro CheckoutInProgressError; provedor chamado uma vez', async () => {
    const db = createFakeBillingDb();

    const results = await Promise.allSettled([start(db), start(db)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(CheckoutInProgressError);
    expect(calledPaths(fetchMock).filter((p) => p === '/subscriptions/create')).toHaveLength(1);
    expect(db.state.checkouts.filter((c) => c.status === 'OPEN')).toHaveLength(1);
  });

  test('provedor cai no checkout: linha vira FAILED e o AbacatePayError sobe', async () => {
    routeFetch(fetchMock, (path, body) => {
      if (path.startsWith('/products/get')) return errorEnvelope('Product not found', 404);
      if (path === '/products/create') return okEnvelope({ id: 'prod_1', price: body.price });
      if (path === '/subscriptions/create') return errorEnvelope('boom', 503);
      return undefined;
    });
    const db = createFakeBillingDb();

    await expect(start(db)).rejects.toMatchObject({ name: 'AbacatePayError', status: 503 });
    expect(db.state.checkouts).toEqual([
      expect.objectContaining({ id: 1, status: 'FAILED', abacate_checkout_id: null }),
    ]);
    // A trava foi liberada: o próximo clique consegue.
    happyProvider(fetchMock);
    expect((await start(db)).reused).toBe(false);
  });

  test('provedor cai ao criar o produto: mesma coisa (FAILED + relança)', async () => {
    routeFetch(fetchMock, (path) => {
      if (path.startsWith('/products/get')) return errorEnvelope('boom', 500);
      return undefined;
    });
    const db = createFakeBillingDb();

    await expect(start(db)).rejects.toMatchObject({ name: 'AbacatePayError', status: 500 });
    expect(db.state.checkouts[0].status).toBe('FAILED');
  });

  test('UPSERT pending não rebaixa assinatura que ativou entre a checagem e a escrita', async () => {
    const db = createFakeBillingDb({
      subscriptions: [
        fakeSubscription({ status: 'active', current_period_end: '2026-12-01 00:00:00' }),
      ],
    });
    // A checagem inicial "não vê" a assinatura (ela ativou logo depois).
    override(
      db,
      'SELECT status, current_period_end, abacate_subscription_id',
      () => ({ rows: [], rowCount: 0 }),
      1
    );

    await start(db);

    expect(db.state.subscriptions[0]).toMatchObject({
      status: 'active',
      current_period_end: '2026-12-01 00:00:00',
    });
  });

  test('UPSERT pending não toca assinatura de cartão viva (vencida localmente) numa corrida', async () => {
    const db = createFakeBillingDb({
      subscriptions: [
        fakeSubscription({
          status: 'active',
          current_period_end: '2026-10-01 00:00:00',
          abacate_subscription_id: 'subs_1',
        }),
      ],
    });
    override(
      db,
      'SELECT status, current_period_end, abacate_subscription_id',
      () => ({ rows: [], rowCount: 0 }),
      1
    );

    await start(db);

    expect(db.state.subscriptions[0].status).toBe('active');
  });

  test.each([
    ['delete ok', okEnvelope({ ok: true })],
    ['delete falha', errorEnvelope('boom', 500)],
  ])(
    'linha CREATING descartada enquanto o provedor respondia (%s): apaga o bill_ e CheckoutInProgressError',
    async (_l, deleteResponse) => {
      routeFetch(fetchMock, (path, body) => {
        if (path.startsWith('/products/get')) return errorEnvelope('Product not found', 404);
        if (path === '/products/create') return okEnvelope({ id: 'prod_1', price: body.price });
        if (path === '/subscriptions/create')
          return okEnvelope({ id: 'bill_late', url: 'https://pay.example.com/late' });
        if (path.startsWith('/subscriptions/checkouts/delete')) return deleteResponse;
        return undefined;
      });
      const db = createFakeBillingDb();
      override(db, "SET status = 'OPEN'", () => {
        db.state.checkouts[0].status = 'FAILED';
        return { rows: [], rowCount: 0 };
      });

      await expect(start(db)).rejects.toBeInstanceOf(CheckoutInProgressError);
      expect(calledPaths(fetchMock)).toContain('/subscriptions/checkouts/delete?id=bill_late');
    }
  );

  test('o SQL (contrato com o banco)', async () => {
    const db = createFakeBillingDb();

    await start(db);

    expect(db.statements()).toMatchSnapshot();
    expect(db.query.mock.calls.map(([c]: [QueryConfig]) => c.values)).toMatchSnapshot();
  });
});
