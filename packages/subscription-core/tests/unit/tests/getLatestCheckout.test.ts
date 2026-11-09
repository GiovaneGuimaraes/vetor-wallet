import { getLatestCheckout } from 'src/getLatestCheckout';
import { createTestQuery } from 'tests/unit/testQuery';

describe('getLatestCheckout', () => {
  test('filtra por user_id e devolve o bill_', async () => {
    const query = createTestQuery();
    query.mockResolvedValue({ rows: [{ abacate_checkout_id: 'bill_1' }], rowCount: 1 });

    expect(await getLatestCheckout({ query, userId: 7 })).toEqual({
      abacate_checkout_id: 'bill_1',
    });
    expect(query.mock.calls[0][0].values).toEqual([7]);
    expect(query.mock.calls[0][0].text).toMatchSnapshot();
  });

  test('sem checkout → null', async () => {
    const query = createTestQuery();

    expect(await getLatestCheckout({ query, userId: 7 })).toBeNull();
  });
});
