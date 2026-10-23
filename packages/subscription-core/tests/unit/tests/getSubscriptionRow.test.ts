import { getSubscriptionRow } from 'src/getSubscriptionRow';
import { createTestQuery } from 'tests/unit/testQuery';

const subRow = {
  id: 3,
  plan_id: 1,
  status: 'active',
  current_period_end: '2026-09-01 00:00:00',
  created_at: '2026-08-01 00:00:00',
};

describe('getSubscriptionRow', () => {
  let query: ReturnType<typeof createTestQuery>;

  beforeEach(() => {
    query = createTestQuery();
  });

  test('filtra por user_id e devolve a linha crua', async () => {
    query.mockResolvedValue({ rows: [subRow], rowCount: 1 });

    const result = await getSubscriptionRow({ query, userId: 42 });

    expect(query).toHaveBeenCalledWith(expect.objectContaining({ values: [42] }));
    expect(query.mock.calls[0][0].text).toMatchSnapshot();
    expect(result).toEqual(subRow);
  });

  test('usuário sem assinatura vira null', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(getSubscriptionRow({ query, userId: 42 })).resolves.toBeNull();
  });
});
