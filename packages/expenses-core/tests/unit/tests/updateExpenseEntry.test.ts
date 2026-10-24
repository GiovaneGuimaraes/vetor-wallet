import { updateExpenseEntry } from 'src/updateExpenseEntry';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('updateExpenseEntry', () => {
  it('devolve null quando a linha não é do usuário (ou não existe)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);

    expect(
      await updateExpenseEntry({ query, userId: 7, id: 9, changes: { amount: 10 } })
    ).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe('SELECT id FROM expense_entries WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([9, 7]);
  });

  it('atualiza só os campos informados, normalizando a categoria (T-028)', async () => {
    const atualizada = { id: 9, description: 'Feira', category: 'mercado' };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, {}, { rows: [atualizada] }]);

    const row = await updateExpenseEntry({
      query,
      userId: 7,
      id: 9,
      changes: { description: '  Feira  ', category: '  MERCADO  ' },
    });

    expect(row).toEqual(atualizada);
    expect(calls[1].text).toBe(
      'UPDATE expense_entries SET description = $1, category = $2 WHERE id = $3 AND user_id = $4'
    );
    expect(calls[1].values).toEqual(['Feira', 'mercado', 9, 7]);
  });

  it('aceita amount e date, e o UPDATE também filtra por user_id (T-051)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, {}, { rows: [{ id: 9 }] }]);

    await updateExpenseEntry({
      query,
      userId: 7,
      id: 9,
      changes: { amount: 12.5, date: '2026-04-01' },
    });

    expect(calls[1].text).toBe(
      'UPDATE expense_entries SET amount = $1, date = $2 WHERE id = $3 AND user_id = $4'
    );
    expect(calls[1].values).toEqual([12.5, '2026-04-01', 9, 7]);
  });

  it('changes vazio não emite UPDATE, mas ainda devolve a linha', async () => {
    const linha = { id: 9, amount: 10 };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, { rows: [linha] }]);

    expect(await updateExpenseEntry({ query, userId: 7, id: 9, changes: {} })).toEqual(linha);
    expect(calls).toHaveLength(2);
    expect(calls[1].text).toBe('SELECT * FROM expense_entries WHERE id = $1 AND user_id = $2');
  });

  it('o re-SELECT final filtra por user_id', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, {}, { rows: [{ id: 9 }] }]);
    await updateExpenseEntry({ query, userId: 7, id: '9', changes: { amount: 1 } });
    expect(calls[2].text).toBe('SELECT * FROM expense_entries WHERE id = $1 AND user_id = $2');
    expect(calls[2].values).toEqual(['9', 7]);
  });
});
