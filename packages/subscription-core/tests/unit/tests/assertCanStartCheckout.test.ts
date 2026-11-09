import { ActivationPendingError } from 'src/ActivationPendingError';
import { AlreadySubscribedError } from 'src/AlreadySubscribedError';
import { assertCanStartCheckout } from 'src/assertCanStartCheckout';
import { createFakeBillingDb, fakeCheckout, fakeSubscription } from 'tests/unit/fakeBillingDb';

const NOW = '2026-11-08 12:00:00';
const USER = 7;

describe('assertCanStartCheckout', () => {
  test('sem assinatura nenhuma → libera, sem gravar', async () => {
    const db = createFakeBillingDb();
    const before = JSON.stringify(db.state);

    await expect(
      assertCanStartCheckout({ query: db.query, userId: USER, now: NOW })
    ).resolves.toBeUndefined();
    expect(JSON.stringify(db.state)).toBe(before);
  });

  test.each([
    ['pending', { status: 'pending' }],
    [
      'active vencida (Pix legado)',
      { status: 'active', current_period_end: '2026-10-01 00:00:00' },
    ],
    [
      'canceled vencida',
      {
        status: 'canceled',
        current_period_end: '2026-11-01 00:00:00',
        abacate_subscription_id: 'subs_old',
      },
    ],
  ])('%s → libera', async (_l, sub) => {
    const db = createFakeBillingDb({ subscriptions: [fakeSubscription(sub)] });

    await expect(
      assertCanStartCheckout({ query: db.query, userId: USER, now: NOW })
    ).resolves.toBeUndefined();
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
      'Pix legado ativo no período',
      { status: 'active', current_period_end: '2026-12-01 00:00:00' },
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
  ])('%s → AlreadySubscribedError, sem gravar', async (_l, sub) => {
    const db = createFakeBillingDb({ subscriptions: [fakeSubscription(sub)] });
    const before = JSON.stringify(db.state);

    const err = await assertCanStartCheckout({ query: db.query, userId: USER, now: NOW }).catch(
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(AlreadySubscribedError);
    expect(err).not.toBeInstanceOf(ActivationPendingError);
    expect(JSON.stringify(db.state)).toBe(before);
  });

  test('checkout pago sem assinatura gravada → ActivationPendingError', async () => {
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

    await expect(
      assertCanStartCheckout({ query: db.query, userId: USER, now: NOW })
    ).rejects.toBeInstanceOf(ActivationPendingError);
  });
});
