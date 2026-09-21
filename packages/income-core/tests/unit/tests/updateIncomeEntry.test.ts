import { updateIncomeEntry } from 'src/updateIncomeEntry';
import { makeTestDb } from 'tests/unit/testDb';

describe('updateIncomeEntry', () => {
  it('devolve null quando o lançamento não é do usuário (ou não existe)', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await updateIncomeEntry({ db, userId: 7, id: 3, changes: { amount: 1 } })).toBeNull();
  });

  it('monta o SET só com os campos enviados e trima a descrição', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeEntry({
      db,
      userId: 7,
      id: 3,
      changes: { description: ' Bico ', amount: 50, date: '2026-09-11' },
    });
    expect(calls[1].sql).toContain('SET description = ?, amount = ?, date = ?');
    expect(calls[1].args).toEqual(['Bico', 50, '2026-09-11', 3, 7]);
  });

  it('mudar a data move o lançamento de mês, e isso é permitido', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeEntry({ db, userId: 7, id: 3, changes: { date: '2026-10-01' } });
    expect(calls[1].args).toEqual(['2026-10-01', 3, 7]);
  });

  it('changes vazio não emite UPDATE', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, { rows: [{ id: 3 }] }]);
    await updateIncomeEntry({ db, userId: 7, id: 3, changes: {} });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });
});
