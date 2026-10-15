import { updateSavingsEntry } from 'src/updateSavingsEntry';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('updateSavingsEntry', () => {
  it('devolve null quando o lançamento não é do usuário (ou não existe)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);

    expect(
      await updateSavingsEntry({ query, userId: 7, id: 3, changes: { note: 'x' } })
    ).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('WHERE id = $1 AND user_id = $2');
  });

  it('monta o SET só com os campos enviados', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rowCount: 1 },
      { rows: [{ id: 3, note: 'nova' }] },
    ]);

    const entry = await updateSavingsEntry({
      query,
      userId: 7,
      id: 3,
      changes: { note: 'nova', amount: 12.5 },
    });

    expect(calls[1].text).toContain('SET amount = $1, note = $2');
    expect(calls[1].text).toContain('WHERE id = $3 AND user_id = $4');
    expect(calls[1].values).toEqual([12.5, 'nova', 3, 7]);
    expect(entry).toEqual({ id: 3, note: 'nova' });
  });

  it('cobre os quatro campos editáveis', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rowCount: 1 },
      { rows: [{ id: 3 }] },
    ]);
    await updateSavingsEntry({
      query,
      userId: 7,
      id: 3,
      changes: { type: 'YIELD', amount: 1, date: '2026-01-02', note: 'n' },
    });
    expect(calls[1].text).toContain('SET type = $1, amount = $2, date = $3, note = $4');
    expect(calls[1].values).toEqual(['YIELD', 1, '2026-01-02', 'n', 3, 7]);
  });

  it('changes vazio não emite UPDATE e devolve a linha intocada', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rows: [{ id: 3, note: 'antiga' }] },
    ]);

    const entry = await updateSavingsEntry({ query, userId: 7, id: 3, changes: {} });

    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.text.startsWith('UPDATE'))).toBe(false);
    expect(entry).toEqual({ id: 3, note: 'antiga' });
  });

  it('o UPDATE também carrega o user_id, não só a checagem de existência', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rowCount: 1 },
      { rows: [{ id: 3 }] },
    ]);
    await updateSavingsEntry({ query, userId: 7, id: 3, changes: { note: 'x' } });
    expect(calls[1].text).toContain('WHERE id = $2 AND user_id = $3');
  });
});
