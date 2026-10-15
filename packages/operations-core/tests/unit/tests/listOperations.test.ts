import { listOperations } from 'src/listOperations';
import { makeTestDb } from 'tests/unit/testDb';

describe('listOperations', () => {
  it('devolve as linhas do usuário', async () => {
    const linhas = [
      { id: 2, ticker: 'PETR4', type: 'BUY' },
      { id: 1, ticker: 'VALE3', type: 'BUY' },
    ];
    const { db, calls } = makeTestDb([{ rows: linhas }]);

    expect(await listOperations({ db, userId: 7 })).toEqual(linhas);
    expect(calls[0].args).toEqual([7]);
  });

  it('filtra por user_id e não por carteira (T-050)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);
    await listOperations({ db, userId: 7 });
    expect(calls[0].sql).toContain('WHERE user_id = ?');
    expect(calls[0].sql).not.toContain('wallet_id');
  });

  it('ordena da mais recente para a mais antiga', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);
    await listOperations({ db, userId: 7 });
    expect(calls[0].sql).toContain('ORDER BY date DESC, created_at DESC');
  });
});
