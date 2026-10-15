import { listSavingsEntries } from 'src/listSavingsEntries';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listSavingsEntries', () => {
  it('filtra por user_id e devolve as linhas', async () => {
    const rows = [{ id: 1, user_id: 7, type: 'DEPOSIT', amount: 10 }];
    const { query, calls } = makeTestQuery([{ rows }]);

    const entries = await listSavingsEntries({ query, userId: 7 });

    expect(entries).toEqual(rows);
    expect(calls[0].text).toContain('WHERE user_id = $1');
    expect(calls[0].values).toEqual([7]);
  });

  it('ordena do mais recente para o mais antigo, com created_at de desempate', async () => {
    const { query, calls } = makeTestQuery();
    await listSavingsEntries({ query, userId: 1 });
    expect(calls[0].text).toContain('ORDER BY date DESC, created_at DESC');
  });

  it('usuário sem lançamentos devolve lista vazia', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await listSavingsEntries({ query, userId: 99 })).toEqual([]);
  });
});
