import { findDefaultWallet } from 'src/findDefaultWallet';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('findDefaultWallet', () => {
  it('lê a carteira mais antiga do usuário, com desempate por id', async () => {
    const wallet = { id: 3, user_id: 7, name: 'Carteira' };
    const { query, calls } = makeTestQuery([{ rows: [wallet] }]);

    expect(await findDefaultWallet({ query, userId: 7 })).toEqual(wallet);
    expect(calls[0].text).toContain('WHERE user_id = $1');
    expect(calls[0].text).toContain('ORDER BY created_at ASC, id ASC LIMIT 1');
    expect(calls[0].values).toEqual([7]);
  });

  it('usuário sem carteira devolve null', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await findDefaultWallet({ query, userId: 7 })).toBeNull();
  });
});
