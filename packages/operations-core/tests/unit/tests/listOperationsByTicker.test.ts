import { listOperationsByTicker } from 'src/listOperationsByTicker';
import { makeTestDb } from 'tests/unit/testDb';

describe('listOperationsByTicker', () => {
  it('devolve as linhas do ticker daquele usuário', async () => {
    const linhas = [{ id: 1, ticker: 'PETR4', type: 'BUY' }];
    const { db, calls } = makeTestDb([{ rows: linhas }]);

    expect(await listOperationsByTicker({ db, userId: 7, ticker: 'PETR4' })).toEqual(linhas);
    expect(calls[0].args).toEqual(['PETR4', 7]);
  });

  it('ordena CRONOLOGICAMENTE — é o que o preço médio exige', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);
    await listOperationsByTicker({ db, userId: 7, ticker: 'PETR4' });
    expect(calls[0].sql).toContain('ORDER BY date ASC, created_at ASC');
  });

  it('filtra por user_id e não por carteira (T-050)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);
    await listOperationsByTicker({ db, userId: 7, ticker: 'PETR4' });
    expect(calls[0].sql).toContain('WHERE ticker = ? AND user_id = ?');
    expect(calls[0].sql).not.toContain('wallet_id');
  });
});
