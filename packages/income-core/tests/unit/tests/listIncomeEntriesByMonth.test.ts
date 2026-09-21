import { listIncomeEntriesByMonth } from 'src/listIncomeEntriesByMonth';
import { makeTestDb } from 'tests/unit/testDb';

describe('listIncomeEntriesByMonth (T-036)', () => {
  it('recorta o mês pelo prefixo da data e filtra por user_id', async () => {
    const rows = [{ id: 1, user_id: 7, description: 'Bico', amount: 200, date: '2026-09-10' }];
    const { db, calls } = makeTestDb([{ rows }]);

    expect(await listIncomeEntriesByMonth({ db, userId: 7, month: '2026-09' })).toEqual(rows);
    expect(calls[0].sql).toContain('substr(date, 1, 7) = ?');
    expect(calls[0].sql).toContain('user_id = ?');
    expect(calls[0].args).toEqual([7, '2026-09']);
  });

  it('ordena por data desc, com created_at de desempate', async () => {
    const { db, calls } = makeTestDb();
    await listIncomeEntriesByMonth({ db, userId: 1, month: '2026-09' });
    expect(calls[0].sql).toContain('ORDER BY date DESC, created_at DESC');
  });

  it('mês sem lançamento devolve lista vazia', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await listIncomeEntriesByMonth({ db, userId: 7, month: '2026-01' })).toEqual([]);
  });
});
