import { countWallets } from 'src/countWallets';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('countWallets', () => {
  it('conta as carteiras do usuário', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ n: 2 }] }]);

    expect(await countWallets({ query, userId: 7 })).toBe(2);
    expect(calls[0].text).toContain('SELECT COUNT(*) AS n FROM wallets WHERE user_id = $1');
    expect(calls[0].values).toEqual([7]);
  });

  it('converte o COUNT vindo como bigint/string em number', async () => {
    const { query } = makeTestQuery([{ rows: [{ n: 1n }] }]);
    expect(await countWallets({ query, userId: 7 })).toBe(1);
  });

  it('sem linha no resultado conta 0 em vez de quebrar', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await countWallets({ query, userId: 7 })).toBe(0);
  });
});
