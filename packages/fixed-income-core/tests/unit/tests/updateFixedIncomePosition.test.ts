import { updateFixedIncomePosition } from 'src/updateFixedIncomePosition';
import { makeTestQuery } from 'tests/unit/testQuery';

describe('updateFixedIncomePosition', () => {
  it('devolve null quando a posição não é do usuário (ou não existe)', async () => {
    const { query, calls } = makeTestQuery([{ rows: [] }]);

    expect(
      await updateFixedIncomePosition({ query, userId: 7, id: 3, changes: { name: 'x' } })
    ).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(calls[0].values).toEqual([3, 7]);
  });

  it('monta o SET só com os campos enviados, e o UPDATE carrega o user_id', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rowCount: 1 },
      { rows: [{ id: 3, name: 'novo' }] },
    ]);

    const position = await updateFixedIncomePosition({
      query,
      userId: 7,
      id: 3,
      changes: { rate: 0, name: 'novo' },
    });

    expect(calls[1].text).toBe(
      'UPDATE fixed_income_positions SET name = $1, rate = $2 WHERE id = $3 AND user_id = $4'
    );
    expect(calls[1].values).toEqual(['novo', 0, 3, 7]);
    expect(calls[2].text).toContain('WHERE id = $1 AND user_id = $2');
    expect(position).toEqual({ id: 3, name: 'novo' });
  });

  it('cobre os onze campos editáveis, na ordem das colunas', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rowCount: 1 },
      { rows: [{ id: 3 }] },
    ]);
    await updateFixedIncomePosition({
      query,
      userId: 7,
      id: 3,
      changes: {
        supersededByPluggyInvestmentId: 'inv-abc',
        currentValueDate: '2026-10-01',
        currentValue: 10,
        rate: 12,
        rateType: 'PRE',
        maturityDate: '2027-01-01',
        investedAt: '2026-01-01',
        investedAmount: 9,
        institution: 'Banco',
        kind: 'LCI',
        name: 'n',
      },
    });
    expect(calls[1].text).toBe(
      'UPDATE fixed_income_positions SET name = $1, kind = $2, institution = $3, ' +
        'invested_amount = $4, invested_at = $5, maturity_date = $6, rate_type = $7, ' +
        'rate = $8, current_value = $9, current_value_date = $10, ' +
        'superseded_by_pluggy_investment_id = $11 WHERE id = $12 AND user_id = $13'
    );
    expect(calls[1].values).toEqual([
      'n',
      'LCI',
      'Banco',
      9,
      '2026-01-01',
      '2027-01-01',
      'PRE',
      12,
      10,
      '2026-10-01',
      'inv-abc',
      3,
      7,
    ]);
  });

  it('null entra no SET — é como se limpa vencimento e saldo informado', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rowCount: 1 },
      { rows: [{ id: 3 }] },
    ]);
    await updateFixedIncomePosition({
      query,
      userId: 7,
      id: 3,
      changes: { maturityDate: null, currentValue: null, currentValueDate: null },
    });
    expect(calls[1].text).toContain(
      'SET maturity_date = $1, current_value = $2, current_value_date = $3'
    );
    expect(calls[1].values).toEqual([null, null, null, 3, 7]);
  });

  it('vínculo com a Pluggy: null limpa, e é aceito sozinho (fatia d3a)', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rowCount: 1 },
      { rows: [{ id: 3, superseded_by_pluggy_investment_id: null }] },
    ]);
    await updateFixedIncomePosition({
      query,
      userId: 7,
      id: 3,
      changes: { supersededByPluggyInvestmentId: null },
    });
    expect(calls[1].text).toBe(
      'UPDATE fixed_income_positions SET superseded_by_pluggy_investment_id = $1 ' +
        'WHERE id = $2 AND user_id = $3'
    );
    expect(calls[1].values).toEqual([null, 3, 7]);
  });

  it('changes vazio não emite UPDATE e devolve a linha intocada', async () => {
    const { query, calls } = makeTestQuery([
      { rows: [{ id: 3 }] },
      { rows: [{ id: 3, name: 'antigo' }] },
    ]);

    const position = await updateFixedIncomePosition({ query, userId: 7, id: 3, changes: {} });

    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.text.startsWith('UPDATE'))).toBe(false);
    expect(position).toEqual({ id: 3, name: 'antigo' });
  });

  it('linha apagada entre o UPDATE e o re-SELECT devolve null, não undefined', async () => {
    const { query } = makeTestQuery([{ rows: [{ id: 3 }] }, { rowCount: 0 }, { rows: [] }]);
    expect(
      await updateFixedIncomePosition({ query, userId: 7, id: 3, changes: { name: 'x' } })
    ).toBeNull();
  });
});
