import { deleteFixedExpense } from 'src/deleteFixedExpense';
import { makeTestDb } from 'tests/unit/testDb';

describe('deleteFixedExpense', () => {
  it('devolve true quando apagou', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);

    expect(await deleteFixedExpense({ db, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].sql).toContain('DELETE FROM fixed_expenses WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual([3, 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);
    expect(await deleteFixedExpense({ db, userId: 7, id: 3 })).toBe(false);
  });
});
