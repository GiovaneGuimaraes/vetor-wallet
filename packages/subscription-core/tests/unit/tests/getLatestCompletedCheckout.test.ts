import { getLatestCompletedCheckout } from 'src/getLatestCompletedCheckout';
import { createFakeBillingDb, fakeCheckout } from 'tests/unit/fakeBillingDb';

describe('getLatestCompletedCheckout', () => {
  test('o COMPLETED com subs_ mais recente do usuário', async () => {
    const db = createFakeBillingDb({
      checkouts: [
        fakeCheckout({
          id: 1,
          abacate_checkout_id: 'bill_a',
          status: 'COMPLETED',
          abacate_subscription_id: 'subs_a',
          completed_at: '2026-11-01 00:00:00',
        }),
        fakeCheckout({
          id: 2,
          abacate_checkout_id: 'bill_b',
          status: 'COMPLETED',
          abacate_subscription_id: 'subs_b',
          completed_at: '2026-11-05 00:00:00',
        }),
        fakeCheckout({ id: 3, abacate_checkout_id: 'bill_c', status: 'OPEN' }),
        fakeCheckout({
          id: 4,
          abacate_checkout_id: 'bill_d',
          status: 'COMPLETED',
          abacate_subscription_id: 'subs_d',
          completed_at: '2026-11-09 00:00:00',
          user_id: 99,
        }),
      ],
    });

    expect(await getLatestCompletedCheckout({ query: db.query, userId: 7 })).toEqual({
      abacate_checkout_id: 'bill_b',
      abacate_subscription_id: 'subs_b',
      completed_at: '2026-11-05 00:00:00',
    });
    expect(db.statements()).toMatchSnapshot();
    expect(db.query.mock.calls[0][0].values).toEqual([7]);
  });

  test('nenhum → null', async () => {
    const db = createFakeBillingDb({ checkouts: [fakeCheckout()] });

    expect(await getLatestCompletedCheckout({ query: db.query, userId: 7 })).toBeNull();
  });
});
