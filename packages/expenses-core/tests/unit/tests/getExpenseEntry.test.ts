import { getExpenseEntry } from 'src/getExpenseEntry';
import { makeTestDb } from 'tests/unit/testDb';

describe('getExpenseEntry', () => {
  it('devolve a linha e filtra por user_id (T-059)', async () => {
    const linha = { id: 3, description: 'Mercado', amount: 50 };
    const { db, calls } = makeTestDb([{ rows: [linha] }]);

    expect(await getExpenseEntry({ db, userId: 7, id: 3 })).toEqual(linha);
    expect(calls[0].sql).toBe('SELECT * FROM expense_entries WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual([3, 7]);
  });

  it('devolve null quando não existe ou é de outro usuário', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await getExpenseEntry({ db, userId: 7, id: '99' })).toBeNull();
  });
});
