import { listOperationsChronological } from 'src/listOperationsChronological';
import { makeTestDb } from 'tests/unit/testDb';

describe('listOperationsChronological', () => {
  it('sem `until`: todas as operações do usuário, sem filtro de data', async () => {
    const linhas = [{ id: 1, ticker: 'PETR4', type: 'BUY' }];
    const { db, calls } = makeTestDb([{ rows: linhas }]);

    expect(await listOperationsChronological({ db, userId: 7 })).toEqual(linhas);
    expect(calls[0].args).toEqual([7]);
    expect(calls[0].sql).not.toContain('date <=');
  });

  it('com `until`: corta as operações posteriores ao teto da janela', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);

    await listOperationsChronological({ db, userId: 7, until: '2026-07-10' });
    expect(calls[0].sql).toContain('WHERE user_id = ? AND date <= ?');
    expect(calls[0].args).toEqual([7, '2026-07-10']);
  });

  it('ordena CRONOLOGICAMENTE nos dois caminhos — é o que o preço médio exige', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }, { rows: [] }]);
    await listOperationsChronological({ db, userId: 7 });
    await listOperationsChronological({ db, userId: 7, until: '2026-07-10' });
    expect(calls[0].sql).toContain('ORDER BY date ASC, created_at ASC');
    expect(calls[1].sql).toContain('ORDER BY date ASC, created_at ASC');
  });

  it('filtra por user_id e não por carteira (T-050)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);
    await listOperationsChronological({ db, userId: 7 });
    expect(calls[0].sql).toContain('WHERE user_id = ?');
    expect(calls[0].sql).not.toContain('wallet_id');
  });
});
