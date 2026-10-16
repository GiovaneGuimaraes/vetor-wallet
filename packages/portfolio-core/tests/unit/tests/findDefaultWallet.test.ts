import { findDefaultWallet } from 'src/findDefaultWallet';
import { makeTestDb } from 'tests/unit/testDb';

describe('findDefaultWallet', () => {
  it('lê a carteira mais antiga do usuário, com desempate por id', async () => {
    const wallet = { id: 3, user_id: 7, name: 'Carteira' };
    const { db, calls } = makeTestDb([{ rows: [wallet] }]);

    expect(await findDefaultWallet({ db, userId: 7 })).toEqual(wallet);
    expect(calls[0].sql).toContain('WHERE user_id = ?');
    expect(calls[0].sql).toContain('ORDER BY created_at ASC, id ASC LIMIT 1');
    expect(calls[0].args).toEqual([7]);
  });

  it('usuário sem carteira devolve null', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await findDefaultWallet({ db, userId: 7 })).toBeNull();
  });
});
