import { updateFixedExpense } from 'src/updateFixedExpense';
import { makeTestDb } from 'tests/unit/testDb';

describe('updateFixedExpense', () => {
  it('devolve null quando a despesa não é do usuário (ou não existe)', async () => {
    const { db, calls } = makeTestDb([{ rows: [] }]);

    expect(await updateFixedExpense({ db, userId: 7, id: 3, changes: { name: 'x' } })).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('monta o SET só com os campos enviados', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);

    await updateFixedExpense({ db, userId: 7, id: 3, changes: { name: ' Luz ', amount: 80 } });

    expect(calls[1].sql).toContain('SET name = ?, amount = ?');
    expect(calls[1].args).toEqual(['Luz', 80, 3, 7]);
  });

  it('normaliza a categoria também no PATCH (T-028)', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateFixedExpense({ db, userId: 7, id: 3, changes: { category: '  ALIMENTACAO  ' } });
    expect(calls[1].args).toEqual(['alimentacao', 3, 7]);
  });

  it('changes vazio não emite UPDATE e devolve a linha intocada', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, { rows: [{ id: 3, name: 'Luz' }] }]);

    const expense = await updateFixedExpense({ db, userId: 7, id: 3, changes: {} });

    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
    expect(expense).toEqual({ id: 3, name: 'Luz' });
  });

  it('o UPDATE também carrega o user_id (T-051)', async () => {
    const { db, calls } = makeTestDb([{ rows: [{ id: 3 }] }, {}, { rows: [{ id: 3 }] }]);
    await updateFixedExpense({ db, userId: 7, id: 3, changes: { amount: 1 } });
    expect(calls[1].sql).toContain('WHERE id = ? AND user_id = ?');
  });
});
