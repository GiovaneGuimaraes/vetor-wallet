import { listSavingsEntries } from 'src/listSavingsEntries';
import { makeTestDb } from 'tests/unit/testDb';

describe('listSavingsEntries', () => {
  it('filtra por user_id e devolve as linhas', async () => {
    const rows = [{ id: 1, user_id: 7, type: 'DEPOSIT', amount: 10 }];
    const { db, calls } = makeTestDb([{ rows }]);

    const entries = await listSavingsEntries({ db, userId: 7 });

    expect(entries).toEqual(rows);
    expect(calls[0].sql).toContain('WHERE user_id = ?');
    expect(calls[0].args).toEqual([7]);
  });

  it('ordena do mais recente para o mais antigo, com created_at de desempate', async () => {
    const { db, calls } = makeTestDb();
    await listSavingsEntries({ db, userId: 1 });
    expect(calls[0].sql).toContain('ORDER BY date DESC, created_at DESC');
  });

  it('usuário sem lançamentos devolve lista vazia', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await listSavingsEntries({ db, userId: 99 })).toEqual([]);
  });
});
