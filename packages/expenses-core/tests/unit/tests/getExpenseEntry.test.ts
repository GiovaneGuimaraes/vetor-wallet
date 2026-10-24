import { getExpenseEntry } from 'src/getExpenseEntry';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('getExpenseEntry', () => {
  it('devolve a linha e filtra por user_id (T-059)', async () => {
    const linha = { id: 3, description: 'Mercado', amount: 50 };
    const { query, calls } = makeTestQuery([{ rows: [linha] }]);

    expect(await getExpenseEntry({ query, userId: 7, id: 3 })).toEqual(linha);
    expect(calls[0].text).toBe('SELECT * FROM expense_entries WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('devolve null quando não existe ou é de outro usuário', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await getExpenseEntry({ query, userId: 7, id: '99' })).toBeNull();
  });
});
