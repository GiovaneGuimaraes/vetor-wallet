import { updateIncomeSource } from 'src/updateIncomeSource';
import { makeTestDb } from 'tests/unit/testDb';

describe('updateIncomeSource', () => {
  it('devolve null quando a fonte não é do usuário (ou não existe)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);
    expect(await updateIncomeSource({ db, userId: 7, id: 3, changes: { name: 'x' } })).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('monta o SET só com os campos enviados e trima o nome', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeSource({
      db,
      userId: 7,
      id: 3,
      changes: { name: ' Salário ', type: 'FREELA', amount: 10 },
    });
    expect(calls[1].sql).toContain('SET name = ?, type = ?, amount = ?');
    expect(calls[1].args).toEqual(['Salário', 'FREELA', 10, 3, 7]);
  });

  it('changes vazio não emite UPDATE e devolve a linha intocada', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, { rows: [{ id: 3, name: 'a' }] }]);
    const source = await updateIncomeSource({ db, userId: 7, id: 3, changes: {} });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
    expect(source).toEqual({ id: 3, name: 'a' });
  });

  it('o UPDATE também carrega o user_id (T-051)', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateIncomeSource({ db, userId: 7, id: 3, changes: { amount: 1 } });
    expect(calls[1].sql).toContain('WHERE id = ? AND user_id = ?');
  });
});
