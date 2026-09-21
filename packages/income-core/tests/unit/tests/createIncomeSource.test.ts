import { createIncomeSource } from 'src/createIncomeSource';
import { makeTestDb } from 'tests/unit/testDb';

describe('createIncomeSource', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = { id: 4, user_id: 7, name: 'Salário', type: 'SALARIO', amount: 5000 };
    const { db, calls } = makeTestDb([{ lastInsertRowid: 4n }, { rows: [criada] }]);

    const source = await createIncomeSource({
      db,
      userId: 7,
      name: 'Salário',
      type: 'SALARIO',
      amount: 5000,
    });

    expect(source).toEqual(criada);
    expect(calls[0].args).toEqual([7, 'Salário', 'SALARIO', 5000]);
  });

  it('type ausente cai no default OUTRO (débito conhecido, preservado)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createIncomeSource({ db, userId: 7, name: 'Bico', amount: 100 });
    expect((calls[0].args as unknown[])[2]).toBe('OUTRO');
  });

  it('tira espaços das pontas do nome', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createIncomeSource({ db, userId: 7, name: '  Freela  ', amount: 100 });
    expect((calls[0].args as unknown[])[1]).toBe('Freela');
  });

  it('o re-SELECT filtra por user_id (T-059)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 9n }, { rows: [{ id: 9 }] }]);
    await createIncomeSource({ db, userId: 7, name: 'x', amount: 1 });
    expect(calls[1].args).toEqual([9, 7]);
  });

  it('sem lastInsertRowid cai em 0 em vez de quebrar', async () => {
    const { db, calls } = makeTestDb([{}, { rows: [] }]);
    await createIncomeSource({ db, userId: 7, name: 'x', amount: 1 });
    expect(calls[1].args).toEqual([0, 7]);
  });
});
