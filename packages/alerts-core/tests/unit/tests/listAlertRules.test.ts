import { listAlertRules } from 'src/listAlertRules';
import { makeTestDb } from 'tests/unit/testDb';

describe('listAlertRules', () => {
  it('lista as regras do usuário, mais recentes primeiro', async () => {
    const rules = [
      { id: 2, ticker: 'VALE3', type: 'PRICE_BELOW', threshold: 60, user_id: 7 },
      { id: 1, ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 35, user_id: 7 },
    ];
    const { db, calls } = makeTestDb([{ rows: rules }]);

    expect(await listAlertRules({ db, userId: 7 })).toEqual(rules);
    expect(calls[0].sql).toContain('WHERE user_id = ? ORDER BY created_at DESC');
    expect(calls[0].args).toEqual([7]);
  });

  it('devolve lista vazia quando o usuário não tem regras', async () => {
    const { db } = makeTestDb([{ rows: [] }]);
    expect(await listAlertRules({ db, userId: 7 })).toEqual([]);
  });
});
