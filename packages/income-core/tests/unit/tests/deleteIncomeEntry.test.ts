import { deleteIncomeEntry } from 'src/deleteIncomeEntry';
import { makeTestDb } from 'tests/unit/testDb';

describe('deleteIncomeEntry', () => {
  it('devolve true quando apagou', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);
    expect(await deleteIncomeEntry({ db, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].sql).toContain('DELETE FROM income_entries WHERE id = ? AND user_id = ?');
  });

  it('devolve false quando nada foi apagado', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);
    expect(await deleteIncomeEntry({ db, userId: 7, id: 3 })).toBe(false);
  });
});
