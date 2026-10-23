import { listIncomeSources } from 'src/listIncomeSources';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listIncomeSources', () => {
  it('filtra por user_id e devolve as linhas', async () => {
    const rows = [{ id: 1, user_id: 7, name: 'Salário', type: 'SALARIO', amount: 5000 }];
    const { query, calls } = makeTestQuery([{ rows }]);

    expect(await listIncomeSources({ query, userId: 7 })).toEqual(rows);
    expect(calls[0].text).toContain('WHERE user_id = $1');
    expect(calls[0].values).toEqual([7]);
  });

  it('ordena da mais recente para a mais antiga', async () => {
    const { query, calls } = makeTestQuery();
    await listIncomeSources({ query, userId: 1 });
    expect(calls[0].text).toContain('ORDER BY created_at DESC');
  });
});
