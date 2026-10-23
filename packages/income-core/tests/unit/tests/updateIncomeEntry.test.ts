import { updateIncomeEntry } from 'src/updateIncomeEntry';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('updateIncomeEntry', () => {
  it('devolve null quando o lançamento não é do usuário (ou não existe)', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await updateIncomeEntry({ query, userId: 7, id: 3, changes: { amount: 1 } })).toBeNull();
  });

  it('monta o SET só com os campos enviados e trima a descrição', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeEntry({
      query,
      userId: 7,
      id: 3,
      changes: { description: ' Bico ', amount: 50, date: '2026-09-11' },
    });
    expect(calls[1].text).toContain('SET description = $1, amount = $2, date = $3');
    expect(calls[1].values).toEqual(['Bico', 50, '2026-09-11', 3, 7]);
  });

  it('mudar a data move o lançamento de mês, e isso é permitido', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeEntry({ query, userId: 7, id: 3, changes: { date: '2026-10-01' } });
    expect(calls[1].values).toEqual(['2026-10-01', 3, 7]);
  });

  it('changes vazio não emite UPDATE', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 3 }] }, { rows: [{ id: 3 }] }]);
    await updateIncomeEntry({ query, userId: 7, id: 3, changes: {} });
    expect(calls.some((c) => c.text.startsWith('UPDATE'))).toBe(false);
  });
});
