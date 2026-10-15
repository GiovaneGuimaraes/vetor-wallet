import { deleteAlertRule } from 'src/deleteAlertRule';
import { makeTestDb } from 'tests/unit/testDb';

describe('deleteAlertRule', () => {
  it('apaga pela dupla id + user_id e devolve true', async () => {
    const { db, calls } = makeTestDb([{ rowsAffected: 1 }]);

    expect(await deleteAlertRule({ db, userId: 7, id: '5' })).toBe(true);
    expect(calls[0].sql).toContain('DELETE FROM alert_rules WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual(['5', 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { db } = makeTestDb([{ rowsAffected: 0 }]);
    expect(await deleteAlertRule({ db, userId: 7, id: 5 })).toBe(false);
  });
});
