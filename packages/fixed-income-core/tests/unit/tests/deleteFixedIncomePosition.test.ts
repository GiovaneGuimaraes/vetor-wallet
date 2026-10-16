import { deleteFixedIncomePosition } from 'src/deleteFixedIncomePosition';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('deleteFixedIncomePosition', () => {
  it('apaga por id E user_id e devolve true quando apagou', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);

    expect(await deleteFixedIncomePosition({ query, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].text).toBe('DELETE FROM fixed_income_positions WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);
    expect(await deleteFixedIncomePosition({ query, userId: 7, id: 3 })).toBe(false);
  });
});
