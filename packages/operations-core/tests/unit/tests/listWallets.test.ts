import { listWallets } from 'src/listWallets';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listWallets', () => {
  it('devolve as carteiras do usuário', async () => {
    const linhas = [{ id: 1, name: 'Carteira B3 pessoal' }];
    const { query, calls } = makeTestQuery([{ rows: linhas }]);

    expect(await listWallets({ query, userId: 7 })).toEqual(linhas);
    expect(calls[0].values).toEqual([7]);
  });

  it('ordena da mais antiga para a mais nova, com desempate por id', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);
    await listWallets({ query, userId: 7 });
    expect(calls[0].text).toContain('ORDER BY created_at ASC, id ASC');
  });

  it('lista TODAS as carteiras do usuário — base legada com 2+ continua visível (T-050)', async () => {
    const legadas = [{ id: 1 }, { id: 2 }];
    const { query, calls } = makeTestQuery([{ rows: legadas }]);
    expect(await listWallets({ query, userId: 7 })).toHaveLength(2);
    expect(calls[0].text).toContain('WHERE user_id = $1');
    expect(calls[0].text).not.toContain('LIMIT');
  });
});
