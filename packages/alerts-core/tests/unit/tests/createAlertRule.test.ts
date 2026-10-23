import { createAlertRule } from 'src/createAlertRule';
import { makeTestQuery } from 'tests/unit/testQuery';

const base = {
  userId: 7,
  ticker: 'PETR4',
  type: 'PRICE_ABOVE' as const,
  threshold: 35.5,
};

describe('createAlertRule', () => {
  it('insere e devolve a linha lida de volta', async () => {
    const criada = { id: 4, ticker: 'PETR4', type: 'PRICE_ABOVE', threshold: 35.5 };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 4 }] }, { rows: [criada] }]);

    expect(await createAlertRule({ query, ...base })).toEqual(criada);
    expect(calls[0].text).toContain('INSERT INTO alert_rules');
    expect(calls[0].text).toContain('RETURNING id');
    expect(calls[0].values).toEqual(['PETR4', 'PRICE_ABOVE', 35.5, 7]);
  });

  it('o re-SELECT filtra por user_id (T-065)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 9 }] }, { rows: [{ id: 9 }] }]);
    await createAlertRule({ query, ...base });
    expect(calls[1].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[1].values).toEqual([9, 7]);
  });

  it('sem id de volta no INSERT cai em 0 em vez de quebrar', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);
    await createAlertRule({ query, ...base });
    expect(calls[1].values).toEqual([0, 7]);
  });
});
