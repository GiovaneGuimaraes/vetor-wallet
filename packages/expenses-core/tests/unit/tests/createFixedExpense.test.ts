import { createFixedExpense } from 'src/createFixedExpense';
import { makeTestDb } from 'tests/unit/testDb';

describe('createFixedExpense', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = { id: 3, user_id: 7, name: 'Aluguel', category: 'Moradia', amount: 1200 };
    const { db, calls } = makeTestDb([{ lastInsertRowid: 3n }, { rows: [criada] }]);

    const expense = await createFixedExpense({
      db,
      userId: 7,
      name: 'Aluguel',
      category: 'Moradia',
      amount: 1200,
    });

    expect(expense).toEqual(criada);
    expect(calls[0].sql).toContain('INSERT INTO fixed_expenses');
  });

  it('normaliza a categoria na gravação (T-028)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createFixedExpense({ db, userId: 7, name: 'Luz', category: '  MORADIA  ', amount: 10 });
    expect((calls[0].args as unknown[])[2]).toBe('moradia');
  });

  it('tira espaços das pontas do nome', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createFixedExpense({ db, userId: 7, name: '  Internet  ', amount: 10 });
    expect((calls[0].args as unknown[])[1]).toBe('Internet');
  });

  it('categoria ausente grava string vazia (normalizeCategory não inventa "Outros")', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createFixedExpense({ db, userId: 7, name: 'Água', amount: 10 });
    expect((calls[0].args as unknown[])[2]).toBe('');
  });

  it('o re-SELECT filtra por user_id, não só pelo id criado (T-059)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 9n }, { rows: [{ id: 9 }] }]);
    await createFixedExpense({ db, userId: 7, name: 'Gás', amount: 10 });
    expect(calls[1].sql).toContain('WHERE id = ? AND user_id = ?');
    expect(calls[1].args).toEqual([9, 7]);
  });

  it('sem lastInsertRowid cai em 0 em vez de quebrar', async () => {
    const { db, calls } = makeTestDb([{}, { rows: [] }]);
    await createFixedExpense({ db, userId: 7, name: 'Gás', amount: 10 });
    expect(calls[1].args).toEqual([0, 7]);
  });
});
