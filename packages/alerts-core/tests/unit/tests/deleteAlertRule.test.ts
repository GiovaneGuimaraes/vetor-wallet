import { deleteAlertRule } from 'src/deleteAlertRule';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('deleteAlertRule', () => {
  it('apaga pela dupla id + user_id e devolve true', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);

    expect(await deleteAlertRule({ query, userId: 7, id: '5' })).toBe(true);
    expect(calls[0].text).toContain('DELETE FROM alert_rules WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual(['5', 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);
    expect(await deleteAlertRule({ query, userId: 7, id: 5 })).toBe(false);
  });
});
