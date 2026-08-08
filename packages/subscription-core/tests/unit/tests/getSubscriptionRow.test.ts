import { getSubscriptionRow } from 'src/getSubscriptionRow';
import { createMockDb, type MockDb } from 'tests/unit/createMockDb';

const subRow = {
  id: 3,
  plan_id: 1,
  status: 'active',
  current_period_end: '2026-09-01 00:00:00',
  created_at: '2026-08-01 00:00:00',
};

describe('getSubscriptionRow', () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
  });

  test('filtra por user_id e devolve a linha crua', async () => {
    db.execute.mockResolvedValue({ rows: [subRow] });

    const result = await getSubscriptionRow({ db, userId: 42 });

    expect(db.execute).toHaveBeenCalledWith(expect.objectContaining({ args: [42] }));
    expect(db.execute.mock.calls[0][0].sql).toMatchSnapshot();
    expect(result).toEqual(subRow);
  });

  test('usuário sem assinatura vira null', async () => {
    db.execute.mockResolvedValue({ rows: [] });

    await expect(getSubscriptionRow({ db, userId: 42 })).resolves.toBeNull();
  });
});
