import { updateSavingsEntry } from 'src/updateSavingsEntry';
import { makeTestDb } from 'tests/unit/testDb';

describe('updateSavingsEntry', () => {
  it('devolve null quando o lançamento não é do usuário (ou não existe)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);

    expect(await updateSavingsEntry({ db, userId: 7, id: 3, changes: { note: 'x' } })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('WHERE id = ? AND user_id = ?');
  });

  it('monta o SET só com os campos enviados', async () => {
    const { db, calls } = makeTestDb([
      { rows: [{ id: 3 }] },
      {},
      { rows: [{ id: 3, note: 'nova' }] },
    ]);

    const entry = await updateSavingsEntry({
      db,
      userId: 7,
      id: 3,
      changes: { note: 'nova', amount: 12.5 },
    });

    expect(calls[1].sql).toContain('SET amount = ?, note = ?');
    expect(calls[1].args).toEqual([12.5, 'nova', 3, 7]);
    expect(entry).toEqual({ id: 3, note: 'nova' });
  });

  it('cobre os quatro campos editáveis', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateSavingsEntry({
      db,
      userId: 7,
      id: 3,
      changes: { type: 'YIELD', amount: 1, date: '2026-01-02', note: 'n' },
    });
    expect(calls[1].sql).toContain('SET type = ?, amount = ?, date = ?, note = ?');
    expect(calls[1].args).toEqual(['YIELD', 1, '2026-01-02', 'n', 3, 7]);
  });

  it('changes vazio não emite UPDATE e devolve a linha intocada', async () => {
    const { db, calls } = makeTestDb([
      { rows: [{ id: 3 }] },
      { rows: [{ id: 3, note: 'antiga' }] },
    ]);

    const entry = await updateSavingsEntry({ db, userId: 7, id: 3, changes: {} });

    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
    expect(entry).toEqual({ id: 3, note: 'antiga' });
  });

  it('o UPDATE também carrega o user_id, não só a checagem de existência', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateSavingsEntry({ db, userId: 7, id: 3, changes: { note: 'x' } });
    expect(calls[1].sql).toContain('WHERE id = ? AND user_id = ?');
  });
});
