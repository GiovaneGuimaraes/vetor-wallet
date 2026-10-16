import { countWallets } from 'src/countWallets';
import { makeTestDb } from 'tests/unit/testDb';

describe('countWallets', () => {
  it('conta as carteiras do usuário', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ n: 2 }] }]);

    expect(await countWallets({ db, userId: 7 })).toBe(2);
    expect(calls[0].sql).toContain('SELECT COUNT(*) AS n FROM wallets WHERE user_id = ?');
    expect(calls[0].args).toEqual([7]);
  });

  it('converte o COUNT vindo como bigint/string em number', async () => {
    const { db } = makeTestDb([{ rows: [{ n: 1n }] }]);
    expect(await countWallets({ db, userId: 7 })).toBe(1);
  });

  it('sem linha no resultado conta 0 em vez de quebrar', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await countWallets({ db, userId: 7 })).toBe(0);
  });
});
