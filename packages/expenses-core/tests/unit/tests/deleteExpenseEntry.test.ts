import { deleteExpenseEntry } from 'src/deleteExpenseEntry';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('deleteExpenseEntry', () => {
  it('apaga filtrando por user_id e devolve true', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);

    expect(await deleteExpenseEntry({ query, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].text).toBe('DELETE FROM expense_entries WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('devolve false quando não existe ou é de outro usuário', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);
    expect(await deleteExpenseEntry({ query, userId: 7, id: '99' })).toBe(false);
  });
});
