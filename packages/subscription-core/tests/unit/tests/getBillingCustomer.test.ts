import { getBillingCustomer } from 'src/getBillingCustomer';
import { createTestQuery } from 'tests/unit/testQuery';

describe('getBillingCustomer', () => {
  test('filtra por user_id e devolve o cust_', async () => {
    const query = createTestQuery();
    query.mockResolvedValue({ rows: [{ abacate_customer_id: 'cust_1' }], rowCount: 1 });

    expect(await getBillingCustomer({ query, userId: 7 })).toBe('cust_1');
    expect(query.mock.calls[0][0].values).toEqual([7]);
    expect(query.mock.calls[0][0].text).toMatchSnapshot();
  });

  test('sem cliente → null', async () => {
    const query = createTestQuery();

    expect(await getBillingCustomer({ query, userId: 7 })).toBeNull();
  });
});
