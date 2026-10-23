import { findWalletById } from 'src/findWalletById';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('findWalletById', () => {
  it('devolve a carteira quando ela é do usuário', async () => {
    const carteira = { id: 3, user_id: 7, name: 'Carteira Real' };
    const { query, calls } = makeTestQuery([{ rows: [carteira] }]);

    expect(await findWalletById({ query, userId: 7, id: 3 })).toEqual(carteira);
    expect(calls[0].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('devolve null quando não existe ou é de outro usuário', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await findWalletById({ query, userId: 7, id: 3 })).toBeNull();
  });
});
