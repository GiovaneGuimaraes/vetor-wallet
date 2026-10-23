import { listOperations } from 'src/listOperations';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listOperations', () => {
  it('devolve as linhas do usuário', async () => {
    const linhas = [
      { id: 2, ticker: 'PETR4', type: 'BUY' },
      { id: 1, ticker: 'VALE3', type: 'BUY' },
    ];
    const { query, calls } = makeTestQuery([{ rows: linhas }]);

    expect(await listOperations({ query, userId: 7 })).toEqual(linhas);
    expect(calls[0].values).toEqual([7]);
  });

  it('filtra por user_id e não por carteira (T-050)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);
    await listOperations({ query, userId: 7 });
    expect(calls[0].text).toContain('WHERE user_id = $1');
    expect(calls[0].text).not.toContain('wallet_id');
  });

  it('ordena da mais recente para a mais antiga', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);
    await listOperations({ query, userId: 7 });
    expect(calls[0].text).toContain('ORDER BY date DESC, created_at DESC');
  });
});
