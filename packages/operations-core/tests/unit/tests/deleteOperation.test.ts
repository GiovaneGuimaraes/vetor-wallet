import { deleteOperation } from 'src/deleteOperation';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('deleteOperation', () => {
  it('apaga pela dupla id + user_id e devolve true', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);

    expect(await deleteOperation({ query, userId: 7, id: '5' })).toBe(true);
    expect(calls[0].text).toContain('DELETE FROM operations WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual(['5', 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);
    expect(await deleteOperation({ query, userId: 7, id: 5 })).toBe(false);
  });
});
