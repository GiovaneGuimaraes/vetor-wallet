import { createFixedExpense } from 'src/createFixedExpense';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('createFixedExpense', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = { id: 3, user_id: 7, name: 'Aluguel', category: 'Moradia', amount: 1200 };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 3 }] }, { rows: [criada] }]);

    const expense = await createFixedExpense({
      query,
      userId: 7,
      name: 'Aluguel',
      category: 'Moradia',
      amount: 1200,
    });

    expect(expense).toEqual(criada);
    expect(calls[0].text).toContain('INSERT INTO fixed_expenses');
    expect(calls[0].text).toContain('RETURNING id');
  });

  it('normaliza a categoria na gravação (T-028)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createFixedExpense({
      query,
      userId: 7,
      name: 'Luz',
      category: '  MORADIA  ',
      amount: 10,
    });
    expect((calls[0].values as unknown[])[2]).toBe('moradia');
  });

  it('tira espaços das pontas do nome', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createFixedExpense({ query, userId: 7, name: '  Internet  ', amount: 10 });
    expect((calls[0].values as unknown[])[1]).toBe('Internet');
  });

  it('categoria ausente grava string vazia (normalizeCategory não inventa "Outros")', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createFixedExpense({ query, userId: 7, name: 'Água', amount: 10 });
    expect((calls[0].values as unknown[])[2]).toBe('');
  });

  it('o re-SELECT filtra por user_id, não só pelo id criado (T-059)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, { rows: [{ id: 9 }] }]);
    await createFixedExpense({ query, userId: 7, name: 'Gás', amount: 10 });
    expect(calls[1].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[1].values).toEqual([9, 7]);
  });

  it('sem id de volta do INSERT cai em 0 em vez de quebrar', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);
    await createFixedExpense({ query, userId: 7, name: 'Gás', amount: 10 });
    expect(calls[1].values).toEqual([0, 7]);
  });
});
