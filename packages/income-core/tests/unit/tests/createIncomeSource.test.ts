import { createIncomeSource } from 'src/createIncomeSource';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('createIncomeSource', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = { id: 4, user_id: 7, name: 'Salário', type: 'SALARIO', amount: 5000 };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 4 }] }, { rows: [criada] }]);

    const source = await createIncomeSource({
      query,
      userId: 7,
      name: 'Salário',
      type: 'SALARIO',
      amount: 5000,
    });

    expect(source).toEqual(criada);
    expect(calls[0].values).toEqual([7, 'Salário', 'SALARIO', 5000]);
  });

  it('type ausente cai no default OUTRO (débito conhecido, preservado)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createIncomeSource({ query, userId: 7, name: 'Bico', amount: 100 });
    expect((calls[0].values as unknown[])[2]).toBe('OUTRO');
  });

  it('tira espaços das pontas do nome', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createIncomeSource({ query, userId: 7, name: '  Freela  ', amount: 100 });
    expect((calls[0].values as unknown[])[1]).toBe('Freela');
  });

  it('o re-SELECT filtra por user_id (T-059)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, { rows: [{ id: 9 }] }]);
    await createIncomeSource({ query, userId: 7, name: 'x', amount: 1 });
    expect(calls[1].values).toEqual([9, 7]);
  });

  it('sem id no RETURNING cai em 0 em vez de quebrar', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);
    await createIncomeSource({ query, userId: 7, name: 'x', amount: 1 });
    expect(calls[1].values).toEqual([0, 7]);
  });
});
