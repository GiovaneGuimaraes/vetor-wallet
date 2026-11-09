import { getOpenCheckout } from 'src/getOpenCheckout';
import { createTestQuery } from 'tests/unit/testQuery';

describe('getOpenCheckout', () => {
  test('filtra por user_id e devolve só url, plano e data', async () => {
    const query = createTestQuery();
    query.mockResolvedValue({
      rows: [{ checkout_url: 'https://pay.example.com/x', plan_id: '2', created_at: 'ts' }],
      rowCount: 1,
    });

    expect(await getOpenCheckout({ query, userId: 7 })).toEqual({
      checkout_url: 'https://pay.example.com/x',
      plan_id: 2,
      created_at: 'ts',
    });
    expect(query.mock.calls[0][0].values).toEqual([7]);
    expect(query.mock.calls[0][0].text).toMatchSnapshot();
  });

  test('sem checkout aberto → null', async () => {
    const query = createTestQuery();

    expect(await getOpenCheckout({ query, userId: 7 })).toBeNull();
  });
});
