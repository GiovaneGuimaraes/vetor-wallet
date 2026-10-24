import { listFixedExpenses } from 'src/listFixedExpenses';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listFixedExpenses', () => {
  it('filtra por user_id e devolve as linhas', async () => {
    const rows = [{ id: 1, user_id: 7, name: 'Aluguel', category: 'Moradia', amount: 100 }];
    const { query, calls } = makeTestQuery([{ rows }]);

    expect(await listFixedExpenses({ query, userId: 7 })).toEqual(rows);
    expect(calls[0].text).toContain('WHERE user_id = $1');
    expect(calls[0].values).toEqual([7]);
  });

  it('ordena da mais recente para a mais antiga', async () => {
    const { query, calls } = makeTestQuery();
    await listFixedExpenses({ query, userId: 1 });
    expect(calls[0].text).toContain('ORDER BY created_at DESC');
  });
});
