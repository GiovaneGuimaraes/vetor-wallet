import { deleteOperation } from 'src/deleteOperation';
import { makeTestDb } from 'tests/unit/testDb';

describe('deleteOperation', () => {
  it('apaga pela dupla id + user_id e devolve true', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);

    expect(await deleteOperation({ db, userId: 7, id: '5' })).toBe(true);
    expect(calls[0].sql).toContain('DELETE FROM operations WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual(['5', 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);
    expect(await deleteOperation({ db, userId: 7, id: 5 })).toBe(false);
  });
});
