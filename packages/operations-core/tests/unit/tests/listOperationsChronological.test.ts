import { listOperationsChronological } from 'src/listOperationsChronological';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listOperationsChronological', () => {
  it('sem `until`: todas as operações do usuário, sem filtro de data', async () => {
    const linhas = [{ id: 1, ticker: 'PETR4', type: 'BUY' }];
    const { query, calls } = makeTestQuery([{ rows: linhas }]);

    expect(await listOperationsChronological({ query, userId: 7 })).toEqual(linhas);
    expect(calls[0].values).toEqual([7]);
    expect(calls[0].text).not.toContain('date <=');
  });

  it('com `until`: corta as operações posteriores ao teto da janela', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);

    await listOperationsChronological({ query, userId: 7, until: '2026-07-10' });
    expect(calls[0].text).toContain('WHERE user_id = $1 AND date <= $2');
    expect(calls[0].values).toEqual([7, '2026-07-10']);
  });

  it('ordena CRONOLOGICAMENTE nos dois caminhos — é o que o preço médio exige', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);
    await listOperationsChronological({ query, userId: 7 });
    await listOperationsChronological({ query, userId: 7, until: '2026-07-10' });
    expect(calls[0].text).toContain('ORDER BY date ASC, created_at ASC');
    expect(calls[1].text).toContain('ORDER BY date ASC, created_at ASC');
  });

  it('filtra por user_id e não por carteira (T-050)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);
    await listOperationsChronological({ query, userId: 7 });
    expect(calls[0].text).toContain('WHERE user_id = $1');
    expect(calls[0].text).not.toContain('wallet_id');
  });
});
