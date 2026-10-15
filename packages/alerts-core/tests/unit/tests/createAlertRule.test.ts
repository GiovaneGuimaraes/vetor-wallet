import { createAlertRule } from 'src/createAlertRule';
import { makeTestDb } from 'tests/unit/testDb';

const base = {
  userId: 7,
  ticker: 'PETR4',
  type: 'PRICE_ABOVE' as const,
  threshold: 35.5,
};

describe('createAlertRule', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = { id: 4, ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 35.5 };
    const { db, calls } = makeTestDb([{ lastInsertRowid: 4n }, { rows: [criada] }]);

    expect(await createAlertRule({ db, ...base })).toEqual(criada);
    expect(calls[0].sql).toContain('INSERT INTO alert_rules');
    expect(calls[0].args).toEqual(['PETR4', 'PRICE_ABOVE', 35.5, 7]);
  });

  it('o re-SELECT filtra por user_id (T-065)', async () => {
    const { db, calls } = makeTestDb([{ lastInsertRowid: 9n }, { rows: [{ id: 9 }] }]);
    await createAlertRule({ db, ...base });
    expect(calls[1].sql).toContain('WHERE id = ? AND user_id = ?');
    expect(calls[1].args).toEqual([9, 7]);
  });

  it('sem lastInsertRowid cai em 0 em vez de quebrar', async () => {
    const { db, calls } = makeTestDb([{}, { rows: [] }]);
    await createAlertRule({ db, ...base });
    expect(calls[1].args).toEqual([0, 7]);
  });
});
