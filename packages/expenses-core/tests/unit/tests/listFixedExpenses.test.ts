import { listFixedExpenses } from 'src/listFixedExpenses';
import { makeTestDb } from 'tests/unit/testDb';

describe('listFixedExpenses', () => {
  it('filtra por user_id e devolve as linhas', async () => {
    const rows = [{ id: 1, user_id: 7, name: 'Aluguel', category: 'Moradia', amount: 100 }];
    const { db, calls } = makeTestDb([{ rows }]);

    expect(await listFixedExpenses({ db, userId: 7 })).toEqual(rows);
    expect(calls[0].sql).toContain('WHERE user_id = ?');
    expect(calls[0].args).toEqual([7]);
  });

  it('ordena da mais recente para a mais antiga', async () => {
    const { db, calls } = makeTestDb();
    await listFixedExpenses({ db, userId: 1 });
    expect(calls[0].sql).toContain('ORDER BY created_at DESC');
  });
});
