import type { QueryConfig } from '@vetor-wallet/query';

import { applyProviderSubscriptionState } from 'src/applyProviderSubscriptionState';
import { isSubscriptionActive } from 'src/isSubscriptionActive';
import {
  reconcileCardSubscription,
  SYNC_INTERVAL_IDLE_SECONDS,
  SYNC_INTERVAL_OPEN_SECONDS,
} from 'src/reconcileCardSubscription';
import {
  createFakeBillingDb,
  type FakeBillingDb,
  fakeCheckout,
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

const reconcile = (
  db: FakeBillingDb,
  over: { nowIso?: string; minIntervalSeconds?: number } = {}
) => {
  return reconcileCardSubscription({ query: db.query, userId: USER, nowIso: NOW, ...over });
};

/** Checkout aberto + linha pending (o que `startCardCheckout` deixa). */
const openDb = (lastSynced: string | null = null) => {
  return createFakeBillingDb({
    checkouts: [fakeCheckout()],
    subscriptions: [fakeSubscription({ status: 'pending', last_synced_at: lastSynced })],
  });
};

/** Assinatura de cartão ativa `subs_1`. */
const cardDb = (end: string | null, lastSynced: string | null = null, status = 'active') => {
  return createFakeBillingDb({
    checkouts: [fakeCheckout({ status: 'COMPLETED', abacate_subscription_id: 'subs_1' })],
    subscriptions: [
      fakeSubscription({
        status,
        current_period_end: end,
        provider: 'abacatepay_card',
        abacate_subscription_id: 'subs_1',
        provider_status: 'ACTIVE',
        last_synced_at: lastSynced,
      }),
    ],
  });
};

describe('reconcileCardSubscription', () => {
  let fetchMock: jest.Mock;
  let listResponse: unknown;
  let getResponse: unknown;

  beforeEach(() => {
    fetchMock = mockFetch();
    process.env.ABACATEPAY_API_KEY = 'abc_key';
    listResponse = okEnvelope([]);
    getResponse = okEnvelope({ id: 'subs_1', status: 'ACTIVE' });
    routeFetch(fetchMock, (path) => {
      if (path.startsWith('/subscriptions/list?checkoutId=')) return listResponse;
      if (path.startsWith('/subscriptions/get?id=')) return getResponse;
      return undefined;
    });
  });

  test('nada a reconciliar (sem checkout aberto nem cartão vivo): não grava nem consulta', async () => {
    const db = createFakeBillingDb({
      subscriptions: [
        fakeSubscription({ status: 'active', current_period_end: '2026-12-01 00:00:00' }),
      ],
    });

    expect(await reconcile(db)).toEqual({
      throttled: false,
      providerUnavailable: false,
      results: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.state.subscriptions[0].last_synced_at).toBeNull();
  });

  test('sem linha nenhuma também não faz nada', async () => {
    const db = createFakeBillingDb();

    expect(await reconcile(db)).toEqual({
      throttled: false,
      providerUnavailable: false,
      results: [],
    });
  });

  test.each([
    ['canceled', 'canceled'],
    ['pending com subs_ antigo', 'pending'],
  ])('cartão %s não consulta o provedor', async (_l, status) => {
    const db = cardDb('2026-11-09 00:00:00', null, status);

    await reconcile(db);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('checkout aberto ainda não pago (lista vazia): só carimba last_synced_at', async () => {
    const db = openDb();

    expect(await reconcile(db)).toEqual({
      throttled: false,
      providerUnavailable: false,
      results: [],
    });
    expect(calledPaths(fetchMock)).toEqual(['/subscriptions/list?checkoutId=bill_1']);
    expect(db.state.subscriptions[0]).toMatchObject({ status: 'pending', last_synced_at: NOW });
  });

  test('checkout aberto PAGO (ACTIVE): ativa pela porta', async () => {
    listResponse = okEnvelope([{ id: 'subs_9', status: 'ACTIVE' }]);
    const db = openDb();

    const res = await reconcile(db);

    expect(res.results).toEqual([
      {
        applied: true,
        transition: 'activate',
        userId: USER,
        currentPeriodEnd: '2026-12-08 12:00:00',
      },
    ]);
    expect(db.state.subscriptions[0]).toMatchObject({
      status: 'active',
      abacate_subscription_id: 'subs_9',
    });
    expect(db.state.checkouts[0].status).toBe('COMPLETED');
  });

  test.each([
    ['PENDING', [{ id: 'subs_9', status: 'PENDING' }]],
    ['ACTIVE sem id', [{ status: 'ACTIVE' }]],
  ])('assinatura do checkout %s não ativa', async (_l, list) => {
    listResponse = okEnvelope(list);
    const db = openDb();

    expect((await reconcile(db)).results).toEqual([]);
    expect(db.state.subscriptions[0].status).toBe('pending');
  });

  test('provedor fora do ar com checkout aberto: providerUnavailable, NÃO lança, nada muda', async () => {
    listResponse = errorEnvelope('boom', 503);
    const db = openDb();

    expect(await reconcile(db)).toEqual({
      throttled: false,
      providerUnavailable: true,
      results: [],
    });
    expect(db.state.subscriptions[0].status).toBe('pending');
  });

  test('rede fora (timeout) também vira providerUnavailable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const db = cardDb('2026-11-09 00:00:00');

    expect((await reconcile(db)).providerUnavailable).toBe(true);
  });

  test('erro que NÃO é do provedor (bug/ambiente) sobe em vez de virar providerUnavailable', async () => {
    fetchMock.mockResolvedValue(null);
    const db = openDb();

    await expect(reconcile(db)).rejects.toBeInstanceOf(TypeError);
  });

  test('erro de banco sobe', async () => {
    const db = openDb();
    const inner = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (config: QueryConfig) => {
      if (config.text.includes('last_synced_at')) throw new Error('SQLITE_BUSY');
      return inner(config);
    });

    await expect(reconcile(db)).rejects.toThrow('SQLITE_BUSY');
  });

  test('cartão CANCELLED no provedor → cancela pela porta (acesso segue até o fim)', async () => {
    getResponse = okEnvelope({ id: 'subs_1', status: 'CANCELLED' });
    const db = cardDb('2026-11-20 00:00:00');

    const res = await reconcile(db);

    expect(res.results).toEqual([{ applied: true, transition: 'cancel', userId: USER }]);
    expect(db.state.subscriptions[0]).toMatchObject({
      status: 'canceled',
      canceled_at: NOW,
      current_period_end: '2026-11-20 00:00:00',
    });
  });

  test('cartão ACTIVE com fim dentro da janela → renovação DEDUZIDA', async () => {
    const db = cardDb('2026-11-10 12:00:00');

    const res = await reconcile(db);

    expect(res.results).toEqual([
      { applied: true, transition: 'renew', userId: USER, currentPeriodEnd: '2026-12-10 12:00:00' },
    ]);
  });

  test('cartão ACTIVE com fim longe → não tenta renovar', async () => {
    const db = cardDb('2026-11-30 12:00:00');

    expect(await reconcile(db)).toEqual({
      throttled: false,
      providerUnavailable: false,
      results: [],
    });
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-11-30 12:00:00');
    expect(calledPaths(fetchMock)).toEqual(['/subscriptions/get?id=subs_1']);
  });

  test('cartão sem fim gravado: tenta, a porta nega (nada em que ancorar)', async () => {
    const db = cardDb(null);

    expect((await reconcile(db)).results).toEqual([
      { applied: false, transition: 'renew', userId: USER, reason: 'not_due' },
    ]);
  });

  test('cartão FAILED no provedor (desistiu de cobrar) → cancel: acesso até o fim, depois pode recomeçar', async () => {
    getResponse = okEnvelope({ id: 'subs_1', status: 'FAILED' });
    const db = cardDb('2026-11-20 12:00:00');

    expect((await reconcile(db)).results).toEqual([
      { applied: true, transition: 'cancel', userId: USER },
    ]);
    const sub = db.state.subscriptions[0];
    expect(sub).toMatchObject({
      status: 'canceled',
      canceled_at: NOW,
      provider_status: 'FAILED',
      current_period_end: '2026-11-20 12:00:00',
    });
    expect(isSubscriptionActive(sub, NOW)).toBe(true);
    expect(isSubscriptionActive(sub, '2026-11-20 12:00:01')).toBe(false);
  });

  test.each([
    ['PENDING', { id: 'subs_1', status: 'PENDING' }, 'PENDING'],
    ['desconhecido', { id: 'subs_1', status: 'WHATEVER' }, 'WHATEVER'],
    ['sem status', { id: 'subs_1' }, 'UNKNOWN'],
  ])(
    'cartão %s no provedor: status local intacto, só provider_status + remote_not_actionable',
    async (_l, raw, providerStatus) => {
      getResponse = okEnvelope(raw);
      const db = cardDb('2026-11-09 12:00:00');

      expect((await reconcile(db)).results).toEqual([
        {
          applied: true,
          transition: 'provider_status',
          userId: USER,
          reason: 'remote_not_actionable',
          providerStatus,
        },
      ]);
      expect(db.state.subscriptions[0]).toMatchObject({
        status: 'active',
        current_period_end: '2026-11-09 12:00:00',
        provider_status: providerStatus,
      });
    }
  );

  test('provider_status repetido não regrava (applied:false) e segue avisando', async () => {
    getResponse = okEnvelope({ id: 'subs_1', status: 'PENDING' });
    const db = cardDb('2026-11-09 12:00:00');
    await reconcile(db);

    const again = await reconcile(db, { nowIso: '2026-11-08 12:10:00' });

    expect(again.results).toEqual([
      {
        applied: false,
        transition: 'provider_status',
        userId: USER,
        reason: 'remote_not_actionable',
        providerStatus: 'PENDING',
      },
    ]);
  });

  describe('checkout PAGO sem assinatura gravada (crash entre as duas escritas)', () => {
    /** Estado do crash: checkout COMPLETED com subs_9, linha ainda pending de antes. */
    const crashedDb = (over: Partial<ReturnType<typeof fakeSubscription>> = {}) => {
      return createFakeBillingDb({
        checkouts: [
          fakeCheckout({
            status: 'COMPLETED',
            abacate_subscription_id: 'subs_9',
            completed_at: '2026-11-08 11:30:00',
          }),
        ],
        subscriptions: [
          fakeSubscription({ status: 'pending', updated_at: '2026-11-08 11:00:00', ...over }),
        ],
      });
    };

    beforeEach(() => {
      getResponse = okEnvelope({ id: 'subs_9', status: 'ACTIVE' });
    });

    test('reconcile RECUPERA: assinatura ativa, período soma uma vez', async () => {
      const db = crashedDb();

      const res = await reconcile(db);

      expect(calledPaths(fetchMock)).toEqual(['/subscriptions/get?id=subs_9']);
      expect(res.results).toEqual([
        {
          applied: true,
          transition: 'activate',
          userId: USER,
          currentPeriodEnd: '2026-12-08 12:00:00',
        },
      ]);
      expect(db.state.subscriptions[0]).toMatchObject({
        status: 'active',
        abacate_subscription_id: 'subs_9',
        current_period_end: '2026-12-08 12:00:00',
      });
    });

    test('recuperação repetida (depois do throttle) é no-op: período não soma de novo', async () => {
      const db = crashedDb();
      await reconcile(db);

      const again = await reconcile(db, { nowIso: '2026-11-08 13:00:00' });

      // Recuperado: nada mais a fazer (o subs_9 agora é cartão vivo, longe do fim).
      expect(again.results).toEqual([]);
      expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
    });

    test('COMPLETED com UPSERT já feito → nada a recuperar', async () => {
      const db = crashedDb({
        status: 'active',
        abacate_subscription_id: 'subs_9',
        current_period_end: '2026-12-08 11:30:00',
      });

      expect((await reconcile(db)).results).toEqual([]);
      expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 11:30:00');
    });

    test('recuperação CONCORRENTE (reconcile + reentrega do activate) aplica uma vez', async () => {
      const db = crashedDb();

      const [rec, hook] = await Promise.all([
        reconcile(db),
        applyProviderSubscriptionState({
          query: db.query,
          ref: { checkoutId: 'bill_1' },
          transition: 'activate',
          snapshot: {
            id: 'subs_9',
            status: 'ACTIVE',
            providerStatus: 'ACTIVE',
            nextBillingAt: null,
          },
          nowIso: NOW,
        }),
      ]);

      expect([...rec.results, hook].filter((r) => r.applied)).toHaveLength(1);
      expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
    });

    test('provedor diz que não está ACTIVE: não ativa, avisa remote_not_actionable', async () => {
      getResponse = okEnvelope({ id: 'subs_9', status: 'CANCELLED' });
      const db = crashedDb();

      expect((await reconcile(db)).results).toEqual([
        {
          applied: false,
          transition: 'activate',
          userId: USER,
          reason: 'remote_not_actionable',
          providerStatus: 'CANCELLED',
        },
      ]);
      expect(db.state.subscriptions[0].status).toBe('pending');
    });

    test('provedor fora do ar: providerUnavailable, nada muda', async () => {
      getResponse = errorEnvelope('boom', 503);
      const db = crashedDb();

      expect(await reconcile(db)).toEqual({
        throttled: false,
        providerUnavailable: true,
        results: [],
      });
    });

    test(`usa o intervalo curto (${SYNC_INTERVAL_OPEN_SECONDS} s): o usuário acabou de pagar`, async () => {
      expect(
        (await reconcile(crashedDb({ last_synced_at: '2026-11-08 11:59:50' }))).throttled
      ).toBe(false);
    });

    test('duplicada ANTIGA (COMPLETED antes do pending atual) não ressuscita', async () => {
      const db = crashedDb({ updated_at: '2026-11-08 11:45:00' });

      expect(await reconcile(db)).toEqual({
        throttled: false,
        providerUnavailable: false,
        results: [],
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('UPSERT que perdeu as 3 corridas deixa estado RECUPERÁVEL pelo reconcile', async () => {
      const db = openDb();
      const inner = db.query.getMockImplementation()!;
      let sabotage = true;
      db.query.mockImplementation(async (config: QueryConfig) => {
        if (sabotage && config.text.includes("'abacatepay_card'")) return { rows: [], rowCount: 0 };
        return inner(config);
      });
      await expect(
        applyProviderSubscriptionState({
          query: db.query,
          ref: { checkoutId: 'bill_1' },
          transition: 'activate',
          snapshot: {
            id: 'subs_9',
            status: 'ACTIVE',
            providerStatus: 'ACTIVE',
            nextBillingAt: null,
          },
          nowIso: NOW,
        })
      ).rejects.toThrow('perdeu 3 corridas');
      expect(db.state.checkouts[0].status).toBe('COMPLETED');
      expect(db.state.subscriptions[0].status).toBe('pending');
      sabotage = false;

      const res = await reconcile(db);

      expect(res.results).toEqual([
        {
          applied: true,
          transition: 'activate',
          userId: USER,
          currentPeriodEnd: '2026-12-08 12:00:00',
        },
      ]);
    });
  });

  test('provedor fora do ar na leitura da assinatura → providerUnavailable', async () => {
    getResponse = errorEnvelope('Subscription not found', 400);
    const db = cardDb('2026-11-09 12:00:00');

    expect(await reconcile(db)).toEqual({
      throttled: false,
      providerUnavailable: true,
      results: [],
    });
  });

  describe('throttling', () => {
    test(`com checkout aberto: ${SYNC_INTERVAL_OPEN_SECONDS} s`, async () => {
      expect(await reconcile(openDb('2026-11-08 11:59:51'))).toMatchObject({ throttled: true });
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await reconcile(openDb('2026-11-08 11:59:50'))).throttled).toBe(false);
    });

    test(`sem checkout aberto: ${SYNC_INTERVAL_IDLE_SECONDS} s`, async () => {
      expect(
        (await reconcile(cardDb('2026-11-30 00:00:00', '2026-11-08 11:55:01'))).throttled
      ).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        (await reconcile(cardDb('2026-11-30 00:00:00', '2026-11-08 11:55:00'))).throttled
      ).toBe(false);
    });

    test('minIntervalSeconds explícito vence o default', async () => {
      const db = cardDb('2026-11-30 00:00:00', '2026-11-08 11:59:00');

      expect((await reconcile(db, { minIntervalSeconds: 30 })).throttled).toBe(false);
    });

    test('throttled devolve o estado local sem chamar o provedor nem gravar', async () => {
      const db = openDb('2026-11-08 11:59:58');

      expect(await reconcile(db)).toEqual({
        throttled: true,
        providerUnavailable: false,
        results: [],
      });
      expect(db.state.subscriptions[0].last_synced_at).toBe('2026-11-08 11:59:58');
    });

    test('DUAS consultas simultâneas: só uma chama o provedor', async () => {
      listResponse = okEnvelope([{ id: 'subs_9', status: 'ACTIVE' }]);
      const db = openDb();

      const results = await Promise.all([reconcile(db), reconcile(db)]);

      expect(results.filter((r) => r.throttled)).toHaveLength(1);
      expect(calledPaths(fetchMock)).toHaveLength(1);
      expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
    });
  });

  test('consulta + webhook de renovação ao mesmo tempo estendem UMA vez', async () => {
    const db = cardDb('2026-11-10 12:00:00');

    const [rec, hook] = await Promise.all([
      reconcile(db),
      applyProviderSubscriptionState({
        query: db.query,
        ref: { subscriptionId: 'subs_1' },
        transition: 'renew',
        snapshot: { id: 'subs_1', status: 'ACTIVE', providerStatus: 'ACTIVE', nextBillingAt: null },
        nowIso: NOW,
      }),
    ]);

    const applied = [...rec.results, hook].filter((r) => r.applied);
    expect(applied).toHaveLength(1);
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-10 12:00:00');
  });

  test('consulta + webhook de ativação ao mesmo tempo ativam UMA vez', async () => {
    listResponse = okEnvelope([{ id: 'subs_9', status: 'ACTIVE' }]);
    const db = openDb();

    const [rec, hook] = await Promise.all([
      reconcile(db),
      applyProviderSubscriptionState({
        query: db.query,
        ref: { checkoutId: 'bill_1' },
        transition: 'activate',
        snapshot: { id: 'subs_9', status: 'ACTIVE', providerStatus: 'ACTIVE', nextBillingAt: null },
        nowIso: NOW,
      }),
    ]);

    expect([...rec.results, hook].filter((r) => r.applied)).toHaveLength(1);
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
  });

  test('o SQL (contrato com o banco)', async () => {
    const db = openDb();

    await reconcile(db);

    expect(db.statements()).toMatchSnapshot();
    expect(db.query.mock.calls.map(([c]: [QueryConfig]) => c.values)).toMatchSnapshot();
  });
});
