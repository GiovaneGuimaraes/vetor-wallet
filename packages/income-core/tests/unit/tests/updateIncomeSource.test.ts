import { updateIncomeSource } from 'src/updateIncomeSource';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('updateIncomeSource', () => {
  it('devolve null quando a fonte não é do usuário (ou não existe)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);
    expect(
      await updateIncomeSource({ query, userId: 7, id: 3, changes: { name: 'x' } })
    ).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('monta o SET só com os campos enviados e trima o nome', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeSource({
      query,
      userId: 7,
      id: 3,
      changes: { name: ' Salário ', type: 'FREELA', amount: 10 },
    });
    expect(calls[1].text).toContain('SET name = $1, type = $2, amount = $3');
    expect(calls[1].values).toEqual(['Salário', 'FREELA', 10, 3, 7]);
  });

  it('changes vazio não emite UPDATE e devolve a linha intocada', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rows: [{ id: 3, name: 'a' }] },
    ]);
    const source = await updateIncomeSource({ query, userId: 7, id: 3, changes: {} });
    expect(calls.some((c) => c.text.startsWith('UPDATE'))).toBe(false);
    expect(source).toEqual({ id: 3, name: 'a' });
  });

  it('o UPDATE também carrega o user_id (T-051)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeSource({ query, userId: 7, id: 3, changes: { amount: 1 } });
    expect(calls[1].text).toContain('WHERE id = $2 AND user_id = $3');
  });
});
