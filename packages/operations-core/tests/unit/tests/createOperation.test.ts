import { createOperation } from 'src/createOperation';
import { makeTestDb } from 'tests/unit/testDb';

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
    const { db, calls } = makeTestDb([{ lastInsertRowid: 4n }, { rows: [criada] }]);

    expect(await createOperation({ db, ...base })).toEqual(criada);
    expect(calls[0].sql).toContain('INSERT INTO operations');
    expect(calls[0].args).toEqual(['PETR4', 'BUY', 100, 30, '2024-01-01', 7, 3]);
  });

  it('grava o walletId recebido, não um do corpo da request (T-050)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createOperation({ db, ...base, walletId: 99 });
    expect((calls[0].args as unknown[])[6]).toBe(99);
  });

  it('o re-SELECT filtra por user_id (T-059)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 9n }, { rows: [{ id: 9 }] }]);
    await createOperation({ db, ...base });
    expect(calls[1].sql).toContain('WHERE id = ? AND user_id = ?');
    expect(calls[1].args).toEqual([9, 7]);
  });

  it('sem lastInsertRowid cai em 0 em vez de quebrar', async () => {
    const { db, calls } = makeTestDb([{}, { rows: [] }]);
    await createOperation({ db, ...base });
    expect(calls[1].args).toEqual([0, 7]);
  });
});
