import type { QueryConfig } from '@vetor-wallet/query';

import {
  applyProviderSubscriptionState,
  MAX_ACTIVATION_ATTEMPTS,
  RENEWAL_WINDOW_DAYS,
  type SubscriptionSnapshot,
} from 'src/applyProviderSubscriptionState';
import { isSubscriptionActive } from 'src/isSubscriptionActive';
import {
  createFakeBillingDb,
  fakeCheckout,
  fakePlan,
  fakeSubscription,
} from 'tests/unit/fakeBillingDb';

const NOW = '2026-11-08 12:00:00';
const USER = 7;

const active = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => {
  return {
    id: 'subs_new',
    status: 'ACTIVE',
    providerStatus: 'ACTIVE',
    nextBillingAt: null,
    ...over,
  };
};

/** Usuário com um checkout aberto e a linha `pending` que o `startCardCheckout` deixa. */
const openCheckoutDb = (over: Parameters<typeof createFakeBillingDb>[0] = {}) => {
  return createFakeBillingDb({
    checkouts: [fakeCheckout()],
    subscriptions: [fakeSubscription({ status: 'pending' })],
    ...over,
  });
};

/** Usuário com assinatura de cartão ativa `subs_1` terminando em `end`. */
const cardDb = (end: string | null, over: Partial<ReturnType<typeof fakeSubscription>> = {}) => {
  return createFakeBillingDb({
    plans: [
      fakePlan(),
      fakePlan({ id: 2, code: 'pro_yearly', interval: 'yearly', abacate_product_id: 'prod_y' }),
    ],
    checkouts: [fakeCheckout({ status: 'COMPLETED', abacate_subscription_id: 'subs_1' })],
    subscriptions: [
      fakeSubscription({
        status: 'active',
        current_period_end: end,
        provider: 'abacatepay_card',
        abacate_subscription_id: 'subs_1',
        provider_status: 'ACTIVE',
        ...over,
      }),
    ],
  });
};

const activate = (db: { query: any }, checkoutId = 'bill_1', snapshot = active(), nowIso = NOW) => {
  return applyProviderSubscriptionState({
    query: db.query,
    ref: { checkoutId },
    transition: 'activate',
    snapshot,
    nowIso,
  });
};

const bySubs = (
  db: { query: any },
  transition: 'renew' | 'payment_failed' | 'cancel' | 'plan_changed',
  snapshot = active({ id: 'subs_1' }),
  nowIso = NOW,
  plan?: { productId: string | null }
) => {
  return applyProviderSubscriptionState({
    query: db.query,
    ref: { subscriptionId: 'subs_1' },
    transition,
    snapshot,
    nowIso,
    plan,
  });
};

describe('applyProviderSubscriptionState — activate', () => {
  test('ativa: checkout COMPLETED com o subs_, assinatura active de cartão, período a partir de agora', async () => {
    const db = openCheckoutDb();

    const res = await activate(db);

    expect(res).toEqual({
      applied: true,
      transition: 'activate',
      userId: USER,
      currentPeriodEnd: '2026-12-08 12:00:00',
    });
    expect(db.state.checkouts[0]).toMatchObject({
      status: 'COMPLETED',
      abacate_subscription_id: 'subs_new',
      completed_at: NOW,
    });
    expect(db.state.subscriptions[0]).toMatchObject({
      user_id: USER,
      plan_id: 1,
      status: 'active',
      current_period_end: '2026-12-08 12:00:00',
      provider: 'abacatepay_card',
      abacate_subscription_id: 'subs_new',
      provider_status: 'ACTIVE',
      canceled_at: null,
      updated_at: NOW,
    });
  });

  test('aceita nowIso em ISO com T/Z e grava no formato do banco', async () => {
    const db = openCheckoutDb();

    await activate(db, 'bill_1', active(), '2026-11-08T12:00:00.000Z');

    expect(db.state.checkouts[0].completed_at).toBe(NOW);
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
  });

  test('sem linha em subscriptions: cria a linha já ativa', async () => {
    const db = openCheckoutDb({ subscriptions: [] });

    const res = await activate(db);

    expect(res.applied).toBe(true);
    expect(db.state.subscriptions).toHaveLength(1);
    expect(db.state.subscriptions[0]).toMatchObject({
      status: 'active',
      abacate_subscription_id: 'subs_new',
    });
  });

  test('DUAS ativações concorrentes do mesmo checkout: só uma aplica e o período soma UMA vez', async () => {
    const db = openCheckoutDb();

    const results = await Promise.all([activate(db), activate(db)]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(results.find((r) => !r.applied)).toEqual({
      applied: false,
      transition: 'activate',
      userId: USER,
      reason: 'already_applied',
    });
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
  });

  test('ativação concorrente com assinatura ainda valendo (Pix legado) também soma uma vez só', async () => {
    const db = openCheckoutDb({
      subscriptions: [
        fakeSubscription({ status: 'active', current_period_end: '2026-11-20 12:00:00' }),
      ],
    });

    const results = await Promise.all([activate(db), activate(db), activate(db)]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    // Soma ao que resta (renewalBase), uma vez: 20/11 + 1 mês.
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-20 12:00:00');
  });

  test('ativação repetida (webhook reentregue / consulta depois) é no-op', async () => {
    const db = openCheckoutDb();
    await activate(db);
    const before = JSON.stringify(db.state);

    const again = await activate(db, 'bill_1', active(), '2026-11-09 12:00:00');

    expect(again).toEqual({
      applied: false,
      transition: 'activate',
      userId: USER,
      reason: 'already_applied',
    });
    expect(JSON.stringify(db.state)).toBe(before);
  });

  test('checkout desconhecido: nada é gravado, dono desconhecido', async () => {
    const db = openCheckoutDb();

    const res = await activate(db, 'bill_forjado');

    expect(res).toEqual({
      applied: false,
      transition: 'activate',
      userId: null,
      reason: 'unknown_checkout',
    });
    expect(db.state.subscriptions[0].status).toBe('pending');
  });

  test('o dono vem do CHECKOUT, nunca do snapshot (que nem tem campo de dono)', async () => {
    const db = openCheckoutDb({
      checkouts: [fakeCheckout({ user_id: 99 })],
      subscriptions: [fakeSubscription({ user_id: 99 }), fakeSubscription({ user_id: USER })],
    });

    const res = await activate(db);

    expect(res.userId).toBe(99);
    expect(db.state.subscriptions.find((s) => s.user_id === 99)?.status).toBe('active');
    expect(db.state.subscriptions.find((s) => s.user_id === USER)?.status).toBe('pending');
  });

  test('o plano vem da linha do checkout (checkout antigo pago depois de trocar de plano)', async () => {
    const db = openCheckoutDb({
      plans: [fakePlan(), fakePlan({ id: 2, code: 'pro_yearly', interval: 'yearly' })],
      checkouts: [fakeCheckout({ plan_id: 2, status: 'SUPERSEDED' })],
      subscriptions: [fakeSubscription({ plan_id: 1 })],
    });

    const res = await activate(db);

    expect(res.applied).toBe(true);
    expect(db.state.subscriptions[0]).toMatchObject({
      plan_id: 2,
      current_period_end: '2027-11-08 12:00:00',
    });
  });

  test('ref por subscriptionId não ativa (o dono só existe pelo checkout) e não toca o banco', async () => {
    const db = openCheckoutDb();

    const res = await applyProviderSubscriptionState({
      query: db.query,
      ref: { subscriptionId: 'subs_new' },
      transition: 'activate',
      snapshot: active(),
      nowIso: NOW,
    });

    expect(res).toEqual({
      applied: false,
      transition: 'activate',
      userId: null,
      reason: 'requires_checkout',
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  test.each(['PENDING', 'FAILED', 'CANCELLED', 'UNKNOWN'] as const)(
    'snapshot %s não ativa (sem pagamento confirmado não há acesso)',
    async (status) => {
      const db = openCheckoutDb();

      const res = await activate(db, 'bill_1', active({ status }));

      expect(res).toMatchObject({ applied: false, reason: 'not_active' });
      expect(db.state.checkouts[0].status).toBe('OPEN');
      expect(db.query).not.toHaveBeenCalled();
    }
  );

  test('snapshot sem id de assinatura não ativa (não haveria como renovar nem cancelar)', async () => {
    const db = openCheckoutDb();

    const res = await activate(db, 'bill_1', active({ id: null }));

    expect(res).toMatchObject({ applied: false, reason: 'missing_subscription_id', userId: null });
    expect(db.state.checkouts[0].status).toBe('OPEN');
  });

  test('assinatura que já venceu conta o período a partir de AGORA', async () => {
    const db = openCheckoutDb({
      subscriptions: [
        fakeSubscription({ status: 'expired', current_period_end: '2026-10-01 00:00:00' }),
      ],
    });

    await activate(db);

    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
  });

  test('data de próxima cobrança do provedor válida e futura vence o cálculo', async () => {
    const db = openCheckoutDb();

    const res = await activate(db, 'bill_1', active({ nextBillingAt: '2026-12-10T15:30:00.000Z' }));

    expect(res.currentPeriodEnd).toBe('2026-12-10 15:30:00');
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-10 15:30:00');
  });

  test.each([
    ['no passado', '2026-11-01T00:00:00.000Z'],
    ['exatamente agora', '2026-11-08T12:00:00.000Z'],
    ['inválida', 'amanhã'],
  ])('data de próxima cobrança %s é ignorada', async (_label, nextBillingAt) => {
    const db = openCheckoutDb();

    await activate(db, 'bill_1', active({ nextBillingAt }));

    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
  });

  test('DUPLICADA: usuário já tem outra assinatura de cartão ativa → não estende, manda cancelar a nova', async () => {
    const db = openCheckoutDb({
      subscriptions: [
        fakeSubscription({
          status: 'active',
          current_period_end: '2026-12-01 00:00:00',
          provider: 'abacatepay_card',
          abacate_subscription_id: 'subs_old',
        }),
      ],
    });

    const res = await activate(db);

    expect(res).toEqual({
      applied: false,
      transition: 'activate',
      userId: USER,
      reason: 'duplicate',
      duplicate: true,
      subscriptionIdToCancel: 'subs_new',
    });
    expect(db.state.subscriptions[0]).toMatchObject({
      current_period_end: '2026-12-01 00:00:00',
      abacate_subscription_id: 'subs_old',
    });
    // O checkout fica COMPLETED com o subs_ novo: é o registro do que foi pago.
    expect(db.state.checkouts[0]).toMatchObject({
      status: 'COMPLETED',
      abacate_subscription_id: 'subs_new',
    });
  });

  test('ativação da duplicada REENTREGUE: no-op (o checkout já é COMPLETED) — não pede um 2º cancelamento/reembolso', async () => {
    const db = openCheckoutDb({
      subscriptions: [
        fakeSubscription({
          status: 'active',
          current_period_end: '2026-12-01 00:00:00',
          abacate_subscription_id: 'subs_old',
        }),
      ],
    });
    expect((await activate(db)).duplicate).toBe(true);

    const again = await activate(db);

    expect(again).toEqual({
      applied: false,
      transition: 'activate',
      userId: USER,
      reason: 'already_applied',
    });
  });

  test('ativação velha reentregue depois de a assinatura ter sido trocada: no-op, não acusa duplicada', async () => {
    // subs_new foi ativada (checkout bill_1), cancelada, venceu, e o usuário
    // assinou de novo (subs_next). A reentrega do evento antigo não muda nada.
    const db = openCheckoutDb({
      checkouts: [fakeCheckout({ status: 'COMPLETED', abacate_subscription_id: 'subs_new' })],
      subscriptions: [
        fakeSubscription({
          status: 'active',
          current_period_end: '2026-12-01 00:00:00',
          abacate_subscription_id: 'subs_next',
        }),
      ],
    });

    expect(await activate(db)).toEqual({
      applied: false,
      transition: 'activate',
      userId: USER,
      reason: 'already_applied',
    });
  });

  test('duplicada também quando a outra está active mas VENCIDA localmente (pode estar cobrando)', async () => {
    const db = openCheckoutDb({
      subscriptions: [
        fakeSubscription({
          status: 'active',
          current_period_end: '2026-10-01 00:00:00',
          abacate_subscription_id: 'subs_old',
        }),
      ],
    });

    const res = await activate(db);

    expect(res).toMatchObject({ duplicate: true, subscriptionIdToCancel: 'subs_new' });
  });

  test('assinatura anterior CANCELADA não é duplicada: ativa somando ao período que resta', async () => {
    const db = openCheckoutDb({
      subscriptions: [
        fakeSubscription({
          status: 'canceled',
          current_period_end: '2026-11-20 12:00:00',
          abacate_subscription_id: 'subs_old',
          canceled_at: '2026-11-01 00:00:00',
        }),
      ],
    });

    const res = await activate(db);

    expect(res.applied).toBe(true);
    expect(db.state.subscriptions[0]).toMatchObject({
      status: 'active',
      current_period_end: '2026-12-20 12:00:00',
      abacate_subscription_id: 'subs_new',
      canceled_at: null,
    });
  });

  test.each(['active', 'canceled'])(
    'a MESMA assinatura (%s) chegando por outro checkout: no-op — nem estende, nem manda cancelar',
    async (status) => {
      const db = openCheckoutDb({
        checkouts: [
          fakeCheckout({
            id: 1,
            abacate_checkout_id: 'bill_a',
            status: 'COMPLETED',
            abacate_subscription_id: 'subs_new',
          }),
          fakeCheckout({ id: 2, abacate_checkout_id: 'bill_b', status: 'SUPERSEDED' }),
        ],
        subscriptions: [
          fakeSubscription({
            status,
            current_period_end: '2026-12-08 12:00:00',
            abacate_subscription_id: 'subs_new',
          }),
        ],
      });

      const res = await activate(db, 'bill_b');

      expect(res).toEqual({
        applied: false,
        transition: 'activate',
        userId: USER,
        reason: 'already_applied',
      });
      expect(db.state.subscriptions[0]).toMatchObject({
        status,
        current_period_end: '2026-12-08 12:00:00',
      });
    }
  );

  test('cancelada antiga em pending (checkout novo aberto) não é duplicada', async () => {
    const db = openCheckoutDb({
      subscriptions: [fakeSubscription({ status: 'pending', abacate_subscription_id: 'subs_old' })],
    });

    expect((await activate(db)).applied).toBe(true);
  });

  test('DOIS checkouts diferentes pagos ao mesmo tempo: um ativa, o outro é duplicada, período soma uma vez', async () => {
    const db = openCheckoutDb({
      checkouts: [
        fakeCheckout({ id: 1, abacate_checkout_id: 'bill_a', status: 'SUPERSEDED' }),
        fakeCheckout({ id: 2, abacate_checkout_id: 'bill_b', status: 'OPEN' }),
      ],
    });

    const results = await Promise.all([
      activate(db, 'bill_a', active({ id: 'subs_a' })),
      activate(db, 'bill_b', active({ id: 'subs_b' })),
    ]);

    const applied = results.filter((r) => r.applied);
    const dup = results.filter((r) => r.duplicate);
    expect(applied).toHaveLength(1);
    expect(dup).toHaveLength(1);
    const winner = db.state.subscriptions[0].abacate_subscription_id;
    expect(dup[0].subscriptionIdToCancel).not.toBe(winner);
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-08 12:00:00');
  });

  test('plano inexistente depois de ganhar o checkout é banco inconsistente: lança', async () => {
    const db = openCheckoutDb({ plans: [] });

    await expect(activate(db)).rejects.toThrow('Plano 1 não existe');
  });

  test(`UPSERT perdendo ${MAX_ACTIVATION_ATTEMPTS} corridas seguidas: lança em vez de chutar`, async () => {
    const db = openCheckoutDb();
    const inner = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (config: QueryConfig) => {
      if (config.text.includes("'abacatepay_card'")) return { rows: [], rowCount: 0 };
      return inner(config);
    });

    await expect(activate(db)).rejects.toThrow(`perdeu ${MAX_ACTIVATION_ATTEMPTS} corridas`);
    const upserts = db.statements().filter((s) => s.includes("'abacatepay_card'"));
    expect(upserts).toHaveLength(MAX_ACTIVATION_ATTEMPTS);
  });

  test('UPSERT perde uma corrida e acerta na volta seguinte', async () => {
    const db = openCheckoutDb();
    const inner = db.query.getMockImplementation()!;
    let lost = false;
    db.query.mockImplementation(async (config: QueryConfig) => {
      if (config.text.includes("'abacatepay_card'") && !lost) {
        lost = true;
        return { rows: [], rowCount: 0 };
      }
      return inner(config);
    });

    expect((await activate(db)).applied).toBe(true);
  });

  test('o SQL da ativação (contrato com o banco)', async () => {
    const db = openCheckoutDb();

    await activate(db);

    expect(db.statements()).toMatchSnapshot();
    expect(db.query.mock.calls.map(([c]: [QueryConfig]) => c.values)).toMatchSnapshot();
  });
});

describe('applyProviderSubscriptionState — renew', () => {
  test(`estende ancorado no fim anterior quando falta até ${RENEWAL_WINDOW_DAYS} dias`, async () => {
    const db = cardDb('2026-11-10 12:00:00');

    const res = await bySubs(db, 'renew');

    expect(res).toEqual({
      applied: true,
      transition: 'renew',
      userId: USER,
      currentPeriodEnd: '2026-12-10 12:00:00',
    });
    expect(db.state.subscriptions[0]).toMatchObject({
      current_period_end: '2026-12-10 12:00:00',
      provider_status: 'ACTIVE',
      updated_at: NOW,
    });
  });

  test('borda da janela: fim exatamente em agora + janela renova', async () => {
    const db = cardDb('2026-11-11 12:00:00');

    expect((await bySubs(db, 'renew')).applied).toBe(true);
  });

  test('fim ainda longe (1 s além da janela) → no-op', async () => {
    const db = cardDb('2026-11-11 12:00:01');

    const res = await bySubs(db, 'renew');

    expect(res).toEqual({ applied: false, transition: 'renew', userId: USER, reason: 'not_due' });
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-11-11 12:00:01');
  });

  test('renovação por DUAS vias ao mesmo tempo (webhook + consulta) estende uma vez', async () => {
    const db = cardDb('2026-11-10 12:00:00');

    const results = await Promise.all([
      bySubs(db, 'renew'),
      bySubs(db, 'renew'),
      bySubs(db, 'renew'),
    ]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-10 12:00:00');
  });

  test('renovação repetida depois de aplicada é no-op', async () => {
    const db = cardDb('2026-11-10 12:00:00');
    await bySubs(db, 'renew');

    const again = await bySubs(db, 'renew', active({ id: 'subs_1' }), '2026-11-09 12:00:00');

    expect(again.applied).toBe(false);
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-12-10 12:00:00');
  });

  test('vencida há dias (consulta atrasada) conta de agora', async () => {
    const db = cardDb('2026-11-01 00:00:00');

    const res = await bySubs(db, 'renew');

    expect(res.currentPeriodEnd).toBe('2026-12-08 12:00:00');
  });

  test('plano anual soma um ano', async () => {
    const db = cardDb('2026-11-10 12:00:00');
    db.state.subscriptions[0].plan_id = 2;

    expect((await bySubs(db, 'renew')).currentPeriodEnd).toBe('2027-11-10 12:00:00');
  });

  test('data de próxima cobrança do provedor depois do fim atual vence o cálculo', async () => {
    const db = cardDb('2026-11-10 12:00:00');

    const res = await bySubs(
      db,
      'renew',
      active({ id: 'subs_1', nextBillingAt: '2026-12-11T00:00:00Z' })
    );

    expect(res.currentPeriodEnd).toBe('2026-12-11 00:00:00');
  });

  test.each([
    ['igual ao fim atual', '2026-11-10T12:00:00Z'],
    ['antes do fim atual', '2026-11-09T12:00:00Z'],
  ])('provedor com próxima cobrança %s: ainda NÃO renovou → nega', async (_l, nextBillingAt) => {
    const db = cardDb('2026-11-10 12:00:00');

    const res = await bySubs(db, 'renew', active({ id: 'subs_1', nextBillingAt }));

    expect(res).toMatchObject({ applied: false, reason: 'provider_not_renewed', userId: USER });
    expect(db.state.subscriptions[0].current_period_end).toBe('2026-11-10 12:00:00');
  });

  test.each(['PENDING', 'FAILED', 'CANCELLED', 'UNKNOWN'] as const)(
    'snapshot %s não renova',
    async (status) => {
      const db = cardDb('2026-11-10 12:00:00');

      expect(await bySubs(db, 'renew', active({ id: 'subs_1', status }))).toMatchObject({
        applied: false,
        reason: 'not_active',
      });
    }
  );

  test('assinatura cancelada não renova', async () => {
    const db = cardDb('2026-11-10 12:00:00', { status: 'canceled' });

    expect(await bySubs(db, 'renew')).toMatchObject({ applied: false, reason: 'not_due' });
  });

  test('sem fim de período gravado não renova (nada em que ancorar)', async () => {
    const db = cardDb(null);

    expect(
      await bySubs(db, 'renew', active({ id: 'subs_1', nextBillingAt: '2026-12-11T00:00:00Z' }))
    ).toMatchObject({
      applied: false,
      reason: 'not_due',
    });
  });

  test('assinatura desconhecida → no-op sem dono', async () => {
    const db = cardDb('2026-11-10 12:00:00');

    const res = await applyProviderSubscriptionState({
      query: db.query,
      ref: { subscriptionId: 'subs_forjado' },
      transition: 'renew',
      snapshot: active(),
      nowIso: NOW,
    });

    expect(res).toEqual({
      applied: false,
      transition: 'renew',
      userId: null,
      reason: 'unknown_subscription',
    });
  });

  test('ref por checkoutId acha a assinatura pelo checkout', async () => {
    const db = cardDb('2026-11-10 12:00:00');

    const res = await applyProviderSubscriptionState({
      query: db.query,
      ref: { checkoutId: 'bill_1' },
      transition: 'renew',
      snapshot: active({ id: 'subs_1' }),
      nowIso: NOW,
    });

    expect(res.applied).toBe(true);
  });

  test.each([
    ['checkout desconhecido', 'bill_x'],
    ['checkout ainda sem subs_', 'bill_open'],
  ])('ref por %s → unknown_subscription', async (_l, checkoutId) => {
    const db = cardDb('2026-11-10 12:00:00');
    db.state.checkouts.push(fakeCheckout({ id: 9, abacate_checkout_id: 'bill_open' }));

    const res = await applyProviderSubscriptionState({
      query: db.query,
      ref: { checkoutId },
      transition: 'renew',
      snapshot: active(),
      nowIso: NOW,
    });

    expect(res).toMatchObject({ applied: false, userId: null, reason: 'unknown_subscription' });
    // Sem subs_ não há o que procurar: nenhuma busca com id nulo.
    expect(db.statements().some((s) => s.includes('WHERE abacate_subscription_id = $1'))).toBe(
      false
    );
  });

  test('o SQL da renovação (contrato com o banco)', async () => {
    const db = cardDb('2026-11-10 12:00:00');

    await bySubs(db, 'renew');

    expect(db.statements()).toMatchSnapshot();
    expect(db.query.mock.calls.map(([c]: [QueryConfig]) => c.values)).toMatchSnapshot();
  });
});

describe('applyProviderSubscriptionState — payment_failed', () => {
  test('marca PAYMENT_FAILED e mantém o acesso até o fim do período', async () => {
    const db = cardDb('2026-11-20 12:00:00');

    const res = await bySubs(
      db,
      'payment_failed',
      active({ id: 'subs_1', providerStatus: 'ACTIVE' })
    );

    expect(res).toEqual({ applied: true, transition: 'payment_failed', userId: USER });
    const sub = db.state.subscriptions[0];
    expect(sub).toMatchObject({
      status: 'active',
      provider_status: 'PAYMENT_FAILED',
      updated_at: NOW,
    });
    expect(isSubscriptionActive(sub, NOW)).toBe(true);
    // ...e expira sozinha no fim do período.
    expect(isSubscriptionActive(sub, '2026-11-20 12:00:01')).toBe(false);
  });

  test('repetido é no-op', async () => {
    const db = cardDb('2026-11-20 12:00:00');
    await bySubs(db, 'payment_failed');

    expect(await bySubs(db, 'payment_failed')).toEqual({
      applied: false,
      transition: 'payment_failed',
      userId: USER,
      reason: 'already_applied',
    });
  });
});

describe('applyProviderSubscriptionState — cancel', () => {
  test('cancela guardando o período pago (acesso até o fim)', async () => {
    const db = cardDb('2026-11-20 12:00:00');

    const res = await bySubs(
      db,
      'cancel',
      active({ id: 'subs_1', status: 'CANCELLED', providerStatus: 'CANCELLED' })
    );

    expect(res).toEqual({ applied: true, transition: 'cancel', userId: USER });
    const sub = db.state.subscriptions[0];
    expect(sub).toMatchObject({
      status: 'canceled',
      canceled_at: NOW,
      provider_status: 'CANCELLED',
      current_period_end: '2026-11-20 12:00:00',
    });
    expect(isSubscriptionActive(sub, NOW)).toBe(true);
  });

  test('sem status cru do provedor grava CANCELLED', async () => {
    const db = cardDb('2026-11-20 12:00:00');

    await bySubs(db, 'cancel', active({ id: 'subs_1', providerStatus: null }));

    expect(db.state.subscriptions[0].provider_status).toBe('CANCELLED');
  });

  test('cancelamento repetido é no-op e NÃO reescreve canceled_at', async () => {
    const db = cardDb('2026-11-20 12:00:00');
    await bySubs(db, 'cancel');

    const again = await bySubs(db, 'cancel', active({ id: 'subs_1' }), '2026-11-09 08:00:00');

    expect(again).toMatchObject({ applied: false, reason: 'already_applied' });
    expect(db.state.subscriptions[0].canceled_at).toBe(NOW);
  });

  test('cancelamento concorrente aplica uma vez', async () => {
    const db = cardDb('2026-11-20 12:00:00');

    const results = await Promise.all([bySubs(db, 'cancel'), bySubs(db, 'cancel')]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);
  });
});

describe('applyProviderSubscriptionState — plan_changed', () => {
  test('troca o plano pelo produto do provedor, sem mexer no período', async () => {
    const db = cardDb('2026-11-20 12:00:00');

    const res = await bySubs(db, 'plan_changed', active({ id: 'subs_1' }), NOW, {
      productId: 'prod_y',
    });

    expect(res).toEqual({ applied: true, transition: 'plan_changed', userId: USER });
    expect(db.state.subscriptions[0]).toMatchObject({
      plan_id: 2,
      current_period_end: '2026-11-20 12:00:00',
    });
  });

  test('mesmo plano → no-op', async () => {
    const db = cardDb('2026-11-20 12:00:00');
    db.state.subscriptions[0].plan_id = 2;

    expect(
      await bySubs(db, 'plan_changed', active({ id: 'subs_1' }), NOW, { productId: 'prod_y' })
    ).toMatchObject({
      applied: false,
      reason: 'already_applied',
    });
  });

  test('produto desconhecido → no-op com motivo', async () => {
    const db = cardDb('2026-11-20 12:00:00');

    expect(
      await bySubs(db, 'plan_changed', active({ id: 'subs_1' }), NOW, { productId: 'prod_nope' })
    ).toEqual({
      applied: false,
      transition: 'plan_changed',
      userId: USER,
      reason: 'unknown_product',
    });
    expect(db.state.subscriptions[0].plan_id).toBe(1);
  });

  test.each([
    ['sem plan', undefined],
    ['productId nulo', { productId: null }],
  ])('%s → missing_product', async (_l, plan) => {
    const db = cardDb('2026-11-20 12:00:00');

    expect(await bySubs(db, 'plan_changed', active({ id: 'subs_1' }), NOW, plan)).toMatchObject({
      applied: false,
      reason: 'missing_product',
    });
  });
});
