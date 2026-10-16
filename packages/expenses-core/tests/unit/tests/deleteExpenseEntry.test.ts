import { deleteExpenseEntry } from 'src/deleteExpenseEntry';
import { makeTestDb } from 'tests/unit/testDb';

describe('deleteExpenseEntry', () => {
  it('apaga filtrando por user_id e devolve true', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);

    expect(await deleteExpenseEntry({ db, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].sql).toBe('DELETE FROM expense_entries WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual([3, 7]);
  });

  it('devolve false quando não existe ou é de outro usuário', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);
    expect(await deleteExpenseEntry({ db, userId: 7, id: '99' })).toBe(false);
  });
});
