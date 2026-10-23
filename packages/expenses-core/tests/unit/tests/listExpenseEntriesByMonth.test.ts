import { listExpenseEntriesByMonth } from 'src/listExpenseEntriesByMonth';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listExpenseEntriesByMonth', () => {
  it('devolve os lançamentos do mês, do mais recente para o mais antigo', async () => {
    const rows = [
      { id: 2, date: '2026-03-20', amount: 10 },
      { id: 1, date: '2026-03-02', amount: 20 },
    ];
    const { query, calls } = makeTestQuery([{ rows }]);

    expect(await listExpenseEntriesByMonth({ query, userId: 7, month: '2026-03' })).toEqual(rows);
    expect(calls[0].text).toContain('SELECT * FROM expense_entries');
    expect(calls[0].text).toContain('ORDER BY date DESC, created_at DESC');
  });

  it('recorta o mês por substr(date, 1, 7) e filtra por user_id', async () => {
    const { query, calls } = makeTestQuery();
    await listExpenseEntriesByMonth({ query, userId: 7, month: '2026-03' });
    expect(calls[0].text).toContain('WHERE user_id = $1 AND substr(date, 1, 7) = $2');
    expect(calls[0].values).toEqual([7, '2026-03']);
  });

  it('mês sem lançamento devolve lista vazia', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await listExpenseEntriesByMonth({ query, userId: 7, month: '2026-03' })).toEqual([]);
  });

  it('não materializa recorrência — é uma leitura só', async () => {
    const { query, calls } = makeTestQuery();
    await listExpenseEntriesByMonth({ query, userId: 7, month: '2026-03' });
    expect(calls).toHaveLength(1);
  });
});
