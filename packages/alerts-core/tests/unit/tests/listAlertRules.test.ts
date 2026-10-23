import { listAlertRules } from 'src/listAlertRules';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('listAlertRules', () => {
  it('lista as regras do usuário, mais recentes primeiro', async () => {
    const rules = [
      { id: 2, ticker: 'VALE3', type: 'PRICE_BELOW', threshold: 60, user_id: 7 },
      { id: 1, ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 35, user_id: 7 },
    ];
    const { query, calls } = makeTestQuery([{ rows: rules }]);

    expect(await listAlertRules({ query, userId: 7 })).toEqual(rules);
    expect(calls[0].text).toContain('WHERE user_id = $1 ORDER BY created_at DESC');
    expect(calls[0].values).toEqual([7]);
  });

  it('devolve lista vazia quando o usuário não tem regras', async () => {
    const { query } = makeTestQuery([{ rows: [] }]);
    expect(await listAlertRules({ query, userId: 7 })).toEqual([]);
  });
});
