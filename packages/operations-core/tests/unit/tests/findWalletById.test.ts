import { findWalletById } from 'src/findWalletById';
import { makeTestDb } from 'tests/unit/testDb';

describe('findWalletById', () => {
  it('devolve a carteira quando ela é do usuário', async () => {
    const carteira = { id: 3, user_id: 7, name: 'Carteira Real' };
    const { db, calls } = makeTestDb([{ rows: [carteira] }]);

    expect(await findWalletById({ db, userId: 7, id: 3 })).toEqual(carteira);
    expect(calls[0].sql).toContain('WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual([3, 7]);
  });

  it('devolve null quando não existe ou é de outro usuário', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await findWalletById({ db, userId: 7, id: 3 })).toBeNull();
  });
});
