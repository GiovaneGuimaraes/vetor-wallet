import { getFixedIncomePosition } from 'src/getFixedIncomePosition';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('getFixedIncomePosition', () => {
  it('lê por id E user_id e devolve a linha', async () => {
    const row = { id: 3, user_id: 7, name: 'CDB' };
    const { query, calls } = makeTestQuery([{ rows: [row] }]);

    expect(await getFixedIncomePosition({ query, userId: 7, id: 3 })).toEqual(row);
    expect(calls[0].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('devolve null quando não existe ou é de outro usuário', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await getFixedIncomePosition({ query, userId: 7, id: 3 })).toBeNull();
  });
});
