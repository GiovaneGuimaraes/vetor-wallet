import { deleteIncomeSource } from 'src/deleteIncomeSource';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('deleteIncomeSource', () => {
  it('devolve true quando apagou', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);
    expect(await deleteIncomeSource({ query, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('devolve false quando nada foi apagado', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);
    expect(await deleteIncomeSource({ query, userId: 7, id: 3 })).toBe(false);
  });
});
