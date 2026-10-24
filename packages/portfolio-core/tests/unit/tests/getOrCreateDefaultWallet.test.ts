import { DEFAULT_WALLET, getOrCreateDefaultWallet } from 'src/getOrCreateDefaultWallet';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('getOrCreateDefaultWallet', () => {
  it('usuário que já tem carteira: devolve o id dela sem escrever nada', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 11 }] }]);

    expect(await getOrCreateDefaultWallet({ query, userId: 7 })).toBe(11);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('SELECT * FROM wallets WHERE user_id = $1');
  });

  it('sem carteira: cria com o DEFAULT_WALLET, relê a vencedora e adota as operações órfãs', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, {}, { rows: [{ id: 21 }] }, {}]);

    expect(await getOrCreateDefaultWallet({ query, userId: 7 })).toBe(21);

    expect(calls[1].text).toContain('INSERT INTO wallets (user_id, name, description, color)');
    expect(calls[1].values).toEqual([
      7,
      DEFAULT_WALLET.name,
      DEFAULT_WALLET.description,
      DEFAULT_WALLET.color,
    ]);
    // Relê a MAIS ANTIGA depois do INSERT — é isso que faz duas corridas convergirem.
    expect(calls[2].text).toContain('ORDER BY created_at ASC, id ASC LIMIT 1');
    expect(calls[3].text).toContain(
      'UPDATE operations SET wallet_id = $1 WHERE user_id = $2 AND wallet_id IS NULL'
    );
    expect(calls[3].values).toEqual([21, 7]);
  });

  it('corrida: a carteira relida (de outro request) vence a recém-inserida', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, {}, { rows: [{ id: 5 }] }, {}]);

    expect(await getOrCreateDefaultWallet({ query, userId: 7 })).toBe(5);
    expect(calls[3].values).toEqual([5, 7]);
  });

  it('overrides (T-053) entram já no INSERT', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, {}, { rows: [{ id: 1 }] }, {}]);

    await getOrCreateDefaultWallet({
      query,
      userId: 7,
      overrides: { name: 'Minha', description: 'desc', color: '#000000' },
    });
    expect(calls[1].values).toEqual([7, 'Minha', 'desc', '#000000']);
  });

  it('override parcial completa o resto com o DEFAULT_WALLET', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, {}, { rows: [{ id: 1 }] }, {}]);

    await getOrCreateDefaultWallet({ query, userId: 7, overrides: { name: 'Só o nome' } });
    expect(calls[1].values).toEqual([
      7,
      'Só o nome',
      DEFAULT_WALLET.description,
      DEFAULT_WALLET.color,
    ]);
  });

  it('releitura vazia (não deveria acontecer) cai em 0 em vez de quebrar', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, {}, { rows: [] }, {}]);

    expect(await getOrCreateDefaultWallet({ query, userId: 7 })).toBe(0);
    expect(calls[3].values).toEqual([0, 7]);
  });
});
