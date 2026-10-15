import { listWallets } from 'src/listWallets';
import { makeTestDb } from 'tests/unit/testDb';

describe('listWallets', () => {
  it('devolve as carteiras do usuário', async () => {
    const linhas = [{ id: 1, name: 'Carteira B3 pessoal' }];
    const { db, calls } = makeTestDb([{ rows: linhas }]);

    expect(await listWallets({ db, userId: 7 })).toEqual(linhas);
    expect(calls[0].args).toEqual([7]);
  });

  it('ordena da mais antiga para a mais nova, com desempate por id', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);
    await listWallets({ db, userId: 7 });
    expect(calls[0].sql).toContain('ORDER BY created_at ASC, id ASC');
  });

  it('lista TODAS as carteiras do usuário — base legada com 2+ continua visível (T-050)', async () => {
    const legadas = [{ id: 1 }, { id: 2 }];
    const { db, calls } = makeTestDb([{ rows: legadas }]);
    expect(await listWallets({ db, userId: 7 })).toHaveLength(2);
    expect(calls[0].sql).toContain('WHERE user_id = ?');
    expect(calls[0].sql).not.toContain('LIMIT');
  });
});
