import { createOperation } from 'src/createOperation';
import { makeTestQuery } from 'tests/unit/testQuery';

const base = {
  userId: 7,
  walletId: 3,
  ticker: 'PETR4',
  type: 'BUY' as const,
  quantity: 100,
  price: 30,
  date: '2024-01-01',
};

describe('createOperation', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = { id: 4, ticker: 'PETR4', type: 'BUY', quantity: 100, price: 30 };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 4 }] }, { rows: [criada] }]);

    expect(await createOperation({ query, ...base })).toEqual(criada);
    expect(calls[0].text).toContain('INSERT INTO operations');
    expect(calls[0].text).toContain('RETURNING id');
    expect(calls[0].values).toEqual(['PETR4', 'BUY', 100, 30, '2024-01-01', 7, 3]);
  });

  it('grava o walletId recebido, não um do corpo da request (T-050)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createOperation({ query, ...base, walletId: 99 });
    expect((calls[0].values as unknown[])[6]).toBe(99);
  });

  it('o re-SELECT filtra por user_id (T-059)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, { rows: [{ id: 9 }] }]);
    await createOperation({ query, ...base });
    expect(calls[1].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[1].values).toEqual([9, 7]);
  });

  it('sem id de volta do INSERT cai em 0 em vez de quebrar', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);
    await createOperation({ query, ...base });
    expect(calls[1].values).toEqual([0, 7]);
  });
});
