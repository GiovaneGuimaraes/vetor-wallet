import { deleteIncomeSource } from 'src/deleteIncomeSource';
import { makeTestDb } from 'tests/unit/testDb';

describe('deleteIncomeSource', () => {
  it('devolve true quando apagou', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);
    expect(await deleteIncomeSource({ db, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].args).toEqual([3, 7]);
  });

  it('devolve false quando nada foi apagado', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);
    expect(await deleteIncomeSource({ db, userId: 7, id: 3 })).toBe(false);
  });
});
