import { summarizeExpenseEntries } from 'src/summarizeExpenseEntries';
import { makeTestDb } from 'tests/unit/testDb';

const base = { userId: 7, startMonth: '2026-01', endMonth: '2026-03' };

describe('summarizeExpenseEntries', () => {
  it('agrega por mês e projeta month/total', async () => {
    const { db } = makeTestDb([
      {
        rows: [
          { month: '2026-01', total: 100.5 },
          { month: '2026-03', total: 42 },
        ],
      },
    ]);

    expect(await summarizeExpenseEntries({ db, ...base })).toEqual([
      { month: '2026-01', total: 100.5 },
      { month: '2026-03', total: 42 },
    ]);
  });

  it('a janela é fechada nos dois lados e filtra por user_id', async () => {
    const { db, calls } = makeTestDb();
    await summarizeExpenseEntries({ db, ...base });
    expect(calls[0].sql).toContain('WHERE user_id = ? AND substr(date, 1, 7) BETWEEN ? AND ?');
    expect(calls[0].sql).toContain('GROUP BY month');
    expect(calls[0].sql).toContain('ORDER BY month ASC');
    expect(calls[0].args).toEqual([7, '2026-01', '2026-03']);
  });

  it('converte os valores do banco (texto vira número; mês vira string)', async () => {
    const { db } = makeTestDb([{ rows: [{ month: 202601, total: '100.5' }] }]);
    expect(await summarizeExpenseEntries({ db, ...base })).toEqual([
      { month: '202601', total: 100.5 },
    ]);
  });

  it('meses sem lançamento simplesmente não aparecem', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await summarizeExpenseEntries({ db, ...base })).toEqual([]);
  });
});
