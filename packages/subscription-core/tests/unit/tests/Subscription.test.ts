import { type SubscriptionRow, toSubscription } from 'src/Subscription';

const row: SubscriptionRow = {
  id: 3,
  plan_id: 1,
  status: 'active',
  current_period_end: '2026-09-01 00:00:00',
  created_at: '2026-08-01 00:00:00',
};

describe('toSubscription', () => {
  test('projeta a linha na forma da API', () => {
    expect(toSubscription(row)).toEqual({
      id: 3,
      plan_id: 1,
      status: 'active',
      current_period_end: '2026-09-01 00:00:00',
      created_at: '2026-08-01 00:00:00',
      provider: null,
      provider_status: null,
      canceled_at: null,
    });
  });

  test('expõe provider, provider_status e canceled_at do cartão — nunca o subs_', () => {
    const card = {
      ...row,
      provider: 'abacatepay_card',
      provider_status: 'ACTIVE',
      canceled_at: '2026-08-20 00:00:00',
      abacate_subscription_id: 'subs_secret',
    };
    const out = toSubscription(card);
    expect(out).toMatchObject({
      provider: 'abacatepay_card',
      provider_status: 'ACTIVE',
      canceled_at: '2026-08-20 00:00:00',
    });
    expect(JSON.stringify(out)).not.toContain('subs_');
  });

  test('current_period_end ausente vira null explícito', () => {
    const semPeriodo = { ...row, current_period_end: undefined } as unknown as SubscriptionRow;
    expect(toSubscription(semPeriodo).current_period_end).toBeNull();
  });

  test('normaliza ids que o driver devolve como string', () => {
    const driverRow = { ...row, id: '3', plan_id: '1' } as unknown as SubscriptionRow;
    expect(toSubscription(driverRow)).toMatchObject({ id: 3, plan_id: 1 });
  });
});
