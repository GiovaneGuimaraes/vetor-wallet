import { deleteFixedExpense } from 'src/deleteFixedExpense';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('deleteFixedExpense', () => {
  it('devolve true quando apagou', async () => {
    const { query, calls } = makeTestQuery([{ rowCount: 1 }]);

    expect(await deleteFixedExpense({ query, userId: 7, id: 3 })).toBe(true);
    expect(calls[0].text).toContain('DELETE FROM fixed_expenses WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('devolve false quando nada foi apagado (inexistente ou de outro usuário)', async () => {
    const { query } = makeTestQuery([{ rowCount: 0 }]);
    expect(await deleteFixedExpense({ query, userId: 7, id: 3 })).toBe(false);
  });
});
