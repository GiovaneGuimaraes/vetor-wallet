import { createSavingsEntry } from 'src/createSavingsEntry';
import { makeTestDb } from 'tests/unit/testDb';

describe('createSavingsEntry', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = {
      id: 12,
      user_id: 7,
      type: 'DEPOSIT',
      amount: 50,
      date: '2026-09-20',
      note: '',
    };
    const { db, calls } = makeTestDb([{ lastInsertRowid: 12n }, { rows: [criada] }]);

    const entry = await createSavingsEntry({
      db,
      userId: 7,
      type: 'DEPOSIT',
      amount: 50,
      date: '2026-09-20',
      note: 'aporte',
    });

    expect(entry).toEqual(criada);
    expect(calls[0].sql).toContain('INSERT INTO savings_entries');
    expect(calls[0].args).toEqual([7, 'DEPOSIT', 50, '2026-09-20', 'aporte']);
  });

  it('o re-SELECT filtra por user_id, não só pelo id criado (T-059)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 12n }, { rows: [{ id: 12 }] }]);
    await createSavingsEntry({ db, userId: 7, type: 'YIELD', amount: 1, date: '2026-09-20' });
    expect(calls[1].sql).toContain('WHERE id = ? AND user_id = ?');
    expect(calls[1].args).toEqual([12, 7]);
  });

  it('note ausente grava string vazia, nunca null', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createSavingsEntry({ db, userId: 7, type: 'DEPOSIT', amount: 5, date: '2026-09-20' });
    expect((calls[0].args as unknown[])[4]).toBe('');
  });

  it('sem lastInsertRowid cai em 0 em vez de quebrar', async () => {
    const { db, calls } = makeTestDb([{}, { rows: [] }]);
    await createSavingsEntry({ db, userId: 7, type: 'DEPOSIT', amount: 5, date: '2026-09-20' });
    expect(calls[1].args).toEqual([0, 7]);
  });
});

describe('createSavingsEntry — note nulo', () => {
  it('note: null (JSON do cliente) também grava string vazia', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 1n }, { rows: [{ id: 1 }] }]);
    await createSavingsEntry({
      db,
      userId: 7,
      type: 'DEPOSIT',
      amount: 5,
      date: '2026-09-20',
      note: null as unknown as string,
    });
    expect((calls[0].args as unknown[])[4]).toBe('');
  });
});
