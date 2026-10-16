import { createFixedIncomePosition } from 'src/createFixedIncomePosition';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('createFixedIncomePosition', () => {
  it('insere todas as colunas e devolve a linha lida de volta', async () => {
    const criada = { id: 12, user_id: 7, name: 'CDB Banco X' };
    const { query, calls } = makeTestQuery([{ rows: [{ id: 12 }] }, { rows: [criada] }]);

    const position = await createFixedIncomePosition({
      query,
      userId: 7,
      position: {
        name: 'CDB Banco X',
        kind: 'CDB',
        institution: 'Banco X',
        investedAmount: 1000,
        investedAt: '2026-01-10',
        maturityDate: '2028-01-10',
        rateType: 'CDI',
        rate: 110,
        currentValue: 1050.5,
        currentValueDate: '2026-10-01',
      },
    });

    expect(position).toEqual(criada);
    expect(calls[0].text).toMatchInlineSnapshot(
      `"INSERT INTO fixed_income_positions (user_id, name, kind, institution, invested_amount, invested_at, maturity_date, rate_type, rate, current_value, current_value_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id"`
    );
    expect(calls[0].values).toEqual([
      7,
      'CDB Banco X',
      'CDB',
      'Banco X',
      1000,
      '2026-01-10',
      '2028-01-10',
      'CDI',
      110,
      1050.5,
      '2026-10-01',
    ]);
  });

  it('o re-SELECT filtra por user_id, não só pelo id criado', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 12 }] }, { rows: [{ id: 12 }] }]);
    await createFixedIncomePosition({
      query,
      userId: 7,
      position: {
        name: 'Caixinha',
        kind: 'CAIXINHA',
        investedAmount: 50,
        investedAt: '2026-01-10',
        rateType: 'CDI',
        rate: 100,
      },
    });
    expect(calls[1].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[1].values).toEqual([12, 7]);
  });

  it('opcionais ausentes viram string vazia (institution) e NULL (o resto)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [{ id: 1 }] }, { rows: [{ id: 1 }] }]);
    await createFixedIncomePosition({
      query,
      userId: 7,
      position: {
        name: 'Tesouro',
        kind: 'TESOURO',
        investedAmount: 50,
        investedAt: '2026-01-10',
        rateType: 'IPCA',
        rate: 0,
      },
    });
    const values = calls[0].values as unknown[];
    expect(values[3]).toBe('');
    expect(values[6]).toBeNull();
    expect(values[9]).toBeNull();
    expect(values[10]).toBeNull();
    expect(values).not.toContain(undefined);
  });

  it('sem linha de RETURNING cai em 0 em vez de quebrar', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }, { rows: [] }]);
    await createFixedIncomePosition({
      query,
      userId: 7,
      position: {
        name: 'x',
        kind: 'OUTRO',
        investedAmount: 1,
        investedAt: '2026-01-10',
        rateType: 'PRE',
        rate: 10,
      },
    });
    expect(calls[1].values).toEqual([0, 7]);
  });
});
