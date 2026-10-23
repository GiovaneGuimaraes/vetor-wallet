import { listOperationsByTicker } from 'src/listOperationsByTicker';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listOperationsByTicker', () => {
  it('devolve as linhas do ticker daquele usuário', async () => {
    const linhas = [{ id: 1, ticker: 'PETR4', type: 'BUY' }];
    const { query, calls } = makeTestQuery([{ rows: linhas }]);

    expect(await listOperationsByTicker({ query, userId: 7, ticker: 'PETR4' })).toEqual(linhas);
    expect(calls[0].values).toEqual(['PETR4', 7]);
  });

  it('ordena CRONOLOGICAMENTE — é o que o preço médio exige', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);
    await listOperationsByTicker({ query, userId: 7, ticker: 'PETR4' });
    expect(calls[0].text).toContain('ORDER BY date ASC, created_at ASC');
  });

  it('filtra por user_id e não por carteira (T-050)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);
    await listOperationsByTicker({ query, userId: 7, ticker: 'PETR4' });
    expect(calls[0].text).toContain('WHERE ticker = $1 AND user_id = $2');
    expect(calls[0].text).not.toContain('wallet_id');
  });
});
