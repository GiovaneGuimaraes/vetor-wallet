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
    });
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
