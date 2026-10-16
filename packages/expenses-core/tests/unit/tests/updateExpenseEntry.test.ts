import { updateExpenseEntry } from 'src/updateExpenseEntry';
import { makeTestDb } from 'tests/unit/testDb';

describe('updateExpenseEntry', () => {
  it('devolve null quando a linha não é do usuário (ou não existe)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);

    expect(await updateExpenseEntry({ db, userId: 7, id: 9, changes: { amount: 10 } })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe('SELECT id FROM expense_entries WHERE id = ? AND user_id = ?');
    expect(calls[0].args).toEqual([9, 7]);
  });

  it('atualiza só os campos informados, normalizando a categoria (T-028)', async () => {
    const atualizada = { id: 9, description: 'Feira', category: 'mercado' };
    const { db, calls } = makeTestDb([{ rows: [{ id: 9 }] }, {}, { rows: [atualizada] }]);

    const row = await updateExpenseEntry({
      db,
      userId: 7,
      id: 9,
      changes: { description: '  Feira  ', category: '  MERCADO  ' },
    });

    expect(row).toEqual(atualizada);
    expect(calls[1].sql).toBe(
      'UPDATE expense_entries SET description = ?, category = ? WHERE id = ? AND user_id = ?'
    );
    expect(calls[1].args).toEqual(['Feira', 'mercado', 9, 7]);
  });

  it('aceita amount e date, e o UPDATE também filtra por user_id (T-051)', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 9 }] }, {}, { rows: [{ id: 9 }] }]);

    await updateExpenseEntry({
      db,
      userId: 7,
      id: 9,
      changes: { amount: 12.5, date: '2026-04-01' },
    });

    expect(calls[1].sql).toBe(
      'UPDATE expense_entries SET amount = ?, date = ? WHERE id = ? AND user_id = ?'
    );
    expect(calls[1].args).toEqual([12.5, '2026-04-01', 9, 7]);
  });

  it('changes vazio não emite UPDATE, mas ainda devolve a linha', async () => {
    const linha = { id: 9, amount: 10 };
    const { db, calls } = makeTestDb([{ rows: [{ id: 9 }] }, { rows: [linha] }]);

    expect(await updateExpenseEntry({ db, userId: 7, id: 9, changes: {} })).toEqual(linha);
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toBe('SELECT * FROM expense_entries WHERE id = ? AND user_id = ?');
  });

  it('o re-SELECT final filtra por user_id', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 9 }] }, {}, { rows: [{ id: 9 }] }]);
    await updateExpenseEntry({ db, userId: 7, id: '9', changes: { amount: 1 } });
    expect(calls[2].sql).toBe('SELECT * FROM expense_entries WHERE id = ? AND user_id = ?');
    expect(calls[2].args).toEqual(['9', 7]);
  });
});
