import { deleteIncomeEntry } from 'src/deleteIncomeEntry';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('deleteIncomeEntry', () => {
  it('devolve true quando apagou', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);
    expect(await deleteIncomeEntry({ query, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].text).toContain('DELETE FROM income_entries WHERE id = $1 AND user_id = $2');
  });

  it('devolve false quando nada foi apagado', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);
    expect(await deleteIncomeEntry({ query, userId: 7, id: 3 })).toBe(false);
  });
});
