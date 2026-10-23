import { listIncomeEntriesByMonth } from 'src/listIncomeEntriesByMonth';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listIncomeEntriesByMonth (T-036)', () => {
  it('recorta o mês pelo prefixo da data e filtra por user_id', async () => {
    const rows = [{ id: 1, user_id: 7, description: 'Bico', amount: 200, date: '2026-09-10' }];
    const { query, calls } = makeTestQuery([{ rows }]);

    expect(await listIncomeEntriesByMonth({ query, userId: 7, month: '2026-09' })).toEqual(rows);
    expect(calls[0].text).toContain('substr(date, 1, 7) = $2');
    expect(calls[0].text).toContain('user_id = $1');
    expect(calls[0].values).toEqual([7, '2026-09']);
  });

  it('ordena por data desc, com created_at de desempate', async () => {
    const { query, calls } = makeTestQuery();
    await listIncomeEntriesByMonth({ query, userId: 1, month: '2026-09' });
    expect(calls[0].text).toContain('ORDER BY date DESC, created_at DESC');
  });

  it('mês sem lançamento devolve lista vazia', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await listIncomeEntriesByMonth({ query, userId: 7, month: '2026-01' })).toEqual([]);
  });
});
