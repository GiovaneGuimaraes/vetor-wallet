import { summarizeExpenseEntries } from 'src/summarizeExpenseEntries';
import { makeTestQuery } from 'tests/unit/testQuery';

const base = { userId: 7, startMonth: '2026-01', endMonth: '2026-03' };

describe('summarizeExpenseEntries', () => {
  it('agrega por mês e projeta month/total', async () => {
    const { query } = makeTestQuery([
      {
        rows: [
          { month: '2026-01', total: 100.5 },
          { month: '2026-03', total: 42 },
        ],
      },
    ]);

    expect(await summarizeExpenseEntries({ query, ...base })).toEqual([
      { month: '2026-01', total: 100.5 },
      { month: '2026-03', total: 42 },
    ]);
  });

  it('a janela é fechada nos dois lados e filtra por user_id', async () => {
    const { query, calls } = makeTestQuery();
    await summarizeExpenseEntries({ query, ...base });
    expect(calls[0].text).toContain('WHERE user_id = $1 AND substr(date, 1, 7) BETWEEN $2 AND $3');
    expect(calls[0].text).toContain('GROUP BY month');
    expect(calls[0].text).toContain('ORDER BY month ASC');
    expect(calls[0].values).toEqual([7, '2026-01', '2026-03']);
  });

  it('converte os valores do banco (texto vira número; mês vira string)', async () => {
    const { query } = makeTestQuery([{ rows: [{ month: 202601, total: '100.5' }] }]);
    expect(await summarizeExpenseEntries({ query, ...base })).toEqual([
      { month: '202601', total: 100.5 },
    ]);
  });

  it('meses sem lançamento simplesmente não aparecem', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await summarizeExpenseEntries({ query, ...base })).toEqual([]);
  });
});
